import { afterAll, inject } from "vitest";
import { FakeClock, type FakeEmailSender, type FakeWhatsAppSender } from "@/adapters/memory";
import { createAdapters } from "@/composition/adapters";
import { composeBilling } from "@/composition/billing";
import { composeIdentity } from "@/composition/identity";
import { createDatabase } from "@/db/client";
import { createLokasi } from "@/domain/lokasi";
import { createNotifications } from "@/domain/notifications";
import { readRuntimeEnv } from "@/lib/env";
import { createOperatorSettings } from "@/domain/operator-settings";
import { createTariffs } from "@/domain/tariffs";
import { wib } from "@/lib/time/jakarta";
import { detachedTasks } from "./identity";
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
  const detached = detachedTasks();
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
    const { audit, identity } = composeIdentity({ env, db: database.db, adapters, runDetached: (task) => detached.run(task) });
    const notifications = createNotifications({
      db: database.db,
      clock: adapters.clock,
      whatsapp: adapters.whatsapp,
      webPush: adapters.webPush,
      identity,
      audit,
      reportError: () => {},
    });
    const lokasi = createLokasi({ db: database.db, clock: adapters.clock, files: adapters.files, audit, identity });
    const operatorSettings = createOperatorSettings({ db: database.db, clock: adapters.clock, audit });
    const tariffs = createTariffs({ db: database.db, clock: adapters.clock, audit, lokasi });
    const billing = composeBilling({ env, db: database.db, adapters, operatorSettings, reportError: () => {} });
    holder.__makamRuntime = { env, database, adapters, audit, identity, notifications, lokasi, operatorSettings, tariffs, billing };
  }
  afterAll(async () => {
    await holder.__makamRuntime?.database.close();
    delete holder.__makamRuntime;
  });
  return {
    runtime: () => serverRuntime(),
    clock,
    whatsapp: () => serverRuntime().adapters.whatsapp as FakeWhatsAppSender,
    email: () => serverRuntime().adapters.email as FakeEmailSender,
    /** Waits for the identity module's detached tasks (the email step's lookup and send). */
    settled: () => detached.settled(),
    /** Logs a number in through the identity module and returns the session cookies to store. */
    async logIn(phoneNumber: string) {
      const { identity, adapters } = serverRuntime();
      const whatsapp = adapters.whatsapp as FakeWhatsAppSender;
      await identity.requestOtp({ phoneNumber });
      const code = whatsapp.sent.filter((message) => message.template === "kode_verifikasi").at(-1)?.copyCode;
      if (!code) throw new Error("no OTP was sent");
      const login = await identity.verifyOtp({ phoneNumber, code });
      if (!login.ok) throw new Error(`login failed: ${login.reason}`);
      return login;
    },
  };
}
