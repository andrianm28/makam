import { afterAll, inject } from "vitest";
import { FakeClock, type FakeEmailSender } from "@/adapters/memory";
import { createAdapters } from "@/composition/adapters";
import { composeBilling } from "@/composition/billing";
import { composeIdentity } from "@/composition/identity";
import { composeLayanan } from "@/composition/layanan";
import { composeNotifications } from "@/composition/notifications";
import { composePemesanan } from "@/composition/pemesanan";
import { createDatabase } from "@/db/client";
import { createFieldwork } from "@/domain/fieldwork";
import { createInventory } from "@/domain/inventory";
import { createLokasi } from "@/domain/lokasi";
import { createPengurusan } from "@/domain/pengurusan";
import { readRuntimeEnv } from "@/lib/env";
import { createOperatorSettings } from "@/domain/operator-settings";
import { createQueues } from "@/domain/queues";
import { createTariffs } from "@/domain/tariffs";
import { wib } from "@/lib/time/jakarta";
import { nextTestIp } from "./identity";
import type { ServerRuntime } from "@/server/runtime";
import { serverRuntime } from "@/server/runtime";

/**
 * The `web` process's runtime (what `serverRuntime()` returns) on the run's
 * test Postgres, with the test environment's in-memory fakes and a FakeClock
 * the test can move. For tests that drive Server Actions; pair with
 * tests/support/next-request.ts.
 */
export function testServerRuntime() {
  process.env.APP_ENV = "test";
  process.env.DATABASE_URL = inject("databaseUrl");
  const holder = globalThis as unknown as { __makamRuntime?: ServerRuntime };
  const clock = new FakeClock(wib("2026-10-01 09:00"));
  if (!holder.__makamRuntime) {
    const env = readRuntimeEnv();
    const database = createDatabase(env.DATABASE_URL, { applicationName: "makam-test-web" });
    const adapters = createAdapters({
      appEnv: env.APP_ENV,
      fakePaymentWebhookSecret: env.FAKE_PAYMENT_WEBHOOK_SECRET,
      smtp: env.smtp,
      vapid: env.vapid,
      overrides: { clock },
    });
    const { audit, identity } = composeIdentity({ env, db: database.db, adapters });
    const lokasi = createLokasi({ db: database.db, clock: adapters.clock, files: adapters.files, audit, identity });
    const operatorSettings = createOperatorSettings({ db: database.db, clock: adapters.clock, audit });
    const tariffs = createTariffs({ db: database.db, clock: adapters.clock, audit, lokasi });
    const inventory = createInventory({ db: database.db, clock: adapters.clock, audit, files: adapters.files, tariffs, lokasi });
    const billing = composeBilling({ env, db: database.db, adapters, operatorSettings, layanan: { db: database.db, inventory }, reportError: () => {} });
    const notifications = composeNotifications({
      env,
      db: database.db,
      adapters,
      audit,
      identity,
      billing,
      reportError: () => {},
    });
    const layanan = composeLayanan({
      db: database.db,
      clock: adapters.clock,
      files: adapters.files,
      audit,
      lokasi,
      tariffs,
      inventory,
      billing,
      identity,
      notifications,
    });
    const fieldwork = createFieldwork({
      db: database.db,
      clock: adapters.clock,
      files: adapters.files,
      audit,
      identity,
      notifications,
      lokasi,
    });
    const pemesanan = composePemesanan({
      db: database.db,
      clock: adapters.clock,
      files: adapters.files,
      audit,
      lokasi,
      tariffs,
      inventory,
      billing,
      identity,
      notifications,
    });
    holder.__makamRuntime = {
      env,
      database,
      adapters,
      audit,
      identity,
      notifications,
      lokasi,
      operatorSettings,
      tariffs,
      layanan,
      billing,
      inventory,
      fieldwork,
      pemesanan,
      queues: createQueues({
        db: database.db,
        clock: adapters.clock,
        audit,
        lokasi,
        fieldwork,
        billing,
        notifications,
        inventory,
        pemesanan,
        layanan,
      }),
      pengurusan: createPengurusan({
        db: database.db,
        clock: adapters.clock,
        files: adapters.files,
        lokasi,
        tariffs,
        billing,
        identity,
      }),
    };
  }
  afterAll(async () => {
    await holder.__makamRuntime?.database.close();
    delete holder.__makamRuntime;
  });
  return {
    runtime: () => serverRuntime(),
    clock,
    email: () => serverRuntime().adapters.email as FakeEmailSender,
    /** Logs an email in with a Kode Masuk through the identity module and returns the login (its session cookies to store). */
    async logIn(address: string) {
      const { identity, adapters } = serverRuntime();
      const email = adapters.email as FakeEmailSender;
      let sent = await identity.requestKodeMasuk({ email: address, ip: nextTestIp() });
      // A second login to the same email within 60 s waits for "Kirim ulang", as a person would.
      if (!sent.ok && sent.reason === "tunggu_kirim_ulang") {
        clock.set(sent.retryAt);
        sent = await identity.requestKodeMasuk({ email: address, ip: nextTestIp() });
      }
      if (!sent.ok) throw new Error(`Kode Masuk not sent: ${sent.reason}`);
      const code = email.sent.filter((message) => message.to === sent.email).at(-1)?.text.match(/\b(\d{6})\b/)?.[1];
      if (!code) throw new Error("no Kode Masuk was sent");
      const login = await identity.verifyKodeMasuk({ email: address, code });
      if (!login.ok) throw new Error(`login failed: ${login.reason}`);
      return login;
    },
  };
}
