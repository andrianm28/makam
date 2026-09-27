/**
 * The `worker` container's entry point: pg-boss consumers and schedules.
 * Built to dist/worker.mjs; run locally with `npm run worker`.
 */
import { createAdapters } from "@/composition/adapters";
import { composeBilling, documentUrls } from "@/composition/billing";
import { composeIdentity } from "@/composition/identity";
import { composeNotifications } from "@/composition/notifications";
import { composePayouts } from "@/composition/payouts";
import { pemesananNotifikasiDari } from "@/composition/pemesanan";
import { composeSchedulerContext } from "@/composition/scheduler";
import { createDatabase } from "@/db/client";
import { createLokasi } from "@/domain/lokasi";
import { createOperatorSettings } from "@/domain/operator-settings";
import { scheduledTicks } from "@/domain/scheduler";
import { readRuntimeEnv } from "@/lib/env";
import type { ReportError } from "@/lib/observability/report-error";
import { startWorker } from "./runtime";
import { initWorkerSentry } from "./sentry";

async function main() {
  const env = readRuntimeEnv();
  const sentry = initWorkerSentry(env);
  const database = createDatabase(env.DATABASE_URL, { applicationName: "makam-worker" });
  const reportError: ReportError = (error, context) => {
    sentry.captureException(error, context);
  };
  const adapters = createAdapters({
    appEnv: env.APP_ENV,
    fakePaymentWebhookSecret: env.FAKE_PAYMENT_WEBHOOK_SECRET,
    smtp: env.smtp,
    sumopod: env.sumopod,
    vapid: env.vapid,
    chromiumPath: env.CHROMIUM_PATH,
    authSecret: env.AUTH_SECRET,
    filesRoot: env.FILES_ROOT,
    appBaseUrl: env.APP_BASE_URL,
  });
  const { audit, identity } = composeIdentity({ env, db: database.db, adapters });
  const operatorSettings = createOperatorSettings({ db: database.db, clock: adapters.clock, audit });
  const billing = composeBilling({ env, db: database.db, adapters, operatorSettings, reportError });
  const urls = documentUrls(env);
  const notifications = composeNotifications({ env, db: database.db, adapters, audit, identity, billing, reportError });
  // The Lokasi module's own records (Jam Operasional, Kontak Siaga), which the Saat Duka re-alert reads.
  const lokasi = createLokasi({ db: database.db, clock: adapters.clock, files: adapters.files, audit, identity });
  // Payouts, for the Pencairan trigger and the Potongan ageing the worker runs.
  const payouts = composePayouts({
    env,
    db: database.db,
    adapters,
    audit,
    identity,
    lokasi,
    billing,
    operatorSettings,
    notifications,
    reportError,
  });

  const worker = await startWorker({
    connectionString: env.DATABASE_URL,
    context: composeSchedulerContext({
      db: database.db,
      reportError,
      clock: adapters.clock,
      dokumenUrl: urls.publicDocumentUrl,
      notifications,
      lokasi,
      identity,
      notifikasi: pemesananNotifikasiDari(notifications),
      payouts,
    }),
    clock: adapters.clock,
    ticks: scheduledTicks,
    onError: (error, context) => {
      console.error("[worker] error", context.job ?? "", error);
      sentry.captureException(error, { tags: context.job ? { job: context.job } : undefined });
    },
  });
  console.log(`[worker] started: ${scheduledTicks.map((t) => `${t.name} (${t.cron})`).join(", ")}`);

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[worker] ${signal}: stopping`);
    await worker.stop();
    await database.close();
    await sentry.flush(2_000);
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error: unknown) => {
  console.error("[worker] failed to start", error);
  process.exit(1);
});
