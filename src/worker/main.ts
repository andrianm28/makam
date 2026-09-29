/**
 * The `worker` container's entry point: pg-boss consumers and schedules.
 * Built to dist/worker.mjs; run locally with `npm run worker`.
 */
import { createAdapters } from "@/composition/adapters";
import { billingOn, buktiPemesananEffect, composeBilling, documentUrls, paymentEffects } from "@/composition/billing";
import { composeIdentity } from "@/composition/identity";
import { composeNotifications } from "@/composition/notifications";
import { composePayouts } from "@/composition/payouts";
import { composeRefunds } from "@/composition/refunds";
import { pemesananNotifikasiDari } from "@/composition/pemesanan";
import { composeSchedulerContext } from "@/composition/scheduler";
import { createDatabase } from "@/db/client";
import { createInventory } from "@/domain/inventory";
import { createLokasi } from "@/domain/lokasi";
import { createOperatorSettings } from "@/domain/operator-settings";
import { createTariffs } from "@/domain/tariffs";
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
  // The Lokasi module's own records (Jam Operasional, Kontak Siaga), which the Saat Duka re-alert reads.
  const lokasi = createLokasi({ db: database.db, clock: adapters.clock, files: adapters.files, audit, identity });
  const urls = documentUrls(env);
  const billingComposition = {
    env,
    db: database.db,
    adapters,
    operatorSettings,
    reportError,
    // Billing's guard on Tidak Tertagih reads Notifications' call log; the closure runs only once both are built (ticket 29).
    hasLoggedCall: (tagihanId: string): Promise<boolean> => notifications.teleponPemesanTercatat("tagihan", tagihanId),
  };
  const notifications = composeNotifications({ env, db: database.db, adapters, audit, identity, billing: billingOn(billingComposition, database.db), reportError });
  // The worker re-runs a payment's failed effects, so it holds the same registry the
  // web runtime does: a Bukti Pemesanan that failed once must be issuable here too.
  const tariffs = createTariffs({ db: database.db, clock: adapters.clock, audit, lokasi });
  const inventory = createInventory({ db: database.db, clock: adapters.clock, audit, files: adapters.files, tariffs, lokasi });
  const notifikasi = pemesananNotifikasiDari(notifications);
  // One registry, handed to both the scheduler's retry tick and Billing below: a
  // payment's failed effect is run again here, exactly as the web runtime would.
  const efek = paymentEffects({
    clock: adapters.clock,
    dokumenUrl: urls.publicDocumentUrl,
    // A paid order Layanan's jobs are scheduled here too when the first attempt failed (ticket 50).
    layanan: { db: database.db, inventory },
    buktiPemesanan: buktiPemesananEffect({ clock: adapters.clock, compose: billingComposition, inventory, lokasi, notifikasi }),
  });
  const billing = composeBilling({
    ...billingComposition,
    paymentEffects: efek,
  });
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
  // Refunds, for the worker's materialising tick (ticket 31): composed after
  // Payouts, exactly as it is composed after Billing.
  const refunds = composeRefunds({
    env,
    db: database.db,
    adapters,
    audit,
    lokasi,
    billing,
    payouts,
    notifications,
    operatorSettings,
    reportError,
  });

  const worker = await startWorker({
    connectionString: env.DATABASE_URL,
    context: composeSchedulerContext({
      db: database.db,
      reportError,
      clock: adapters.clock,
      dokumenUrl: urls.publicDocumentUrl,
      // The same registry Billing below holds: an effect that failed there is run again here, identically.
      paymentEffects: efek,
      notifications,
      lokasi,
      identity,
      inventory,
      notifikasi,
      payouts,
      refunds,
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
