import { afterAll, inject } from "vitest";
import { FakeClock, type FakeEmailSender } from "@/adapters/memory";
import { createAdapters } from "@/composition/adapters";
import { billingOn, buktiPemesananEffect, composeBilling, documentUrls, paymentEffects } from "@/composition/billing";
import { composeIdentity } from "@/composition/identity";
import { composeNotifications } from "@/composition/notifications";
import { composePemesanan, pemesananNotifikasiDari } from "@/composition/pemesanan";
import { createDatabase } from "@/db/client";
import { createFieldwork } from "@/domain/fieldwork";
import { createInventory } from "@/domain/inventory";
import { createLokasi } from "@/domain/lokasi";
import { createLayanan } from "@/domain/layanan";
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
    const layanan = createLayanan({ db: database.db, clock: adapters.clock, audit, lokasi, tariffs });
    const inventory = createInventory({ db: database.db, clock: adapters.clock, audit, files: adapters.files, tariffs, lokasi });
    const billingComposition = { env, db: database.db, adapters, operatorSettings, reportError: () => {} };
    const notifications = composeNotifications({
      env,
      db: database.db,
      adapters,
      audit,
      identity,
      billing: billingOn(billingComposition, database.db),
      reportError: () => {},
    });
    const notifikasi = pemesananNotifikasiDari(notifications);
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
      operatorSettings,
      billing: billingOn(billingComposition, database.db),
      identity,
      notifikasi,
    });
    const billing = composeBilling({
      ...billingComposition,
      paymentEffects: paymentEffects({
        clock: adapters.clock,
        dokumenUrl: documentUrls(env).publicDocumentUrl,
        buktiPemesanan: buktiPemesananEffect({ clock: adapters.clock, compose: billingComposition, inventory, lokasi, notifikasi }),
      }),
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
