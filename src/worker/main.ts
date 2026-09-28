/**
 * The `worker` container's entry point: pg-boss consumers and schedules.
 * Built to dist/worker.mjs; run locally with `npm run worker`.
 */
import { createAdapters } from "@/composition/adapters";
import { composeBilling, documentUrls } from "@/composition/billing";
import { composeIdentity } from "@/composition/identity";
import { composeNotifications } from "@/composition/notifications";
import { composePayouts } from "@/composition/payouts";
import { composePemesanan, pemesananNotifikasiDari } from "@/composition/pemesanan";
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
  const billing = composeBilling({ env, db: database.db, adapters, operatorSettings, reportError });
  const urls = documentUrls(env);
  const notifications = composeNotifications({ env, db: database.db, adapters, audit, identity, billing, reportError });
  // The Lokasi module's own records (Jam Operasional, Kontak Siaga), which the Saat Duka re-alert reads.
  const lokasi = createLokasi({ db: database.db, clock: adapters.clock, files: adapters.files, audit, identity });
  // The Pemesanan module the two Terencairan money ticks drive (ticket 37): a paid order
  // becoming Aktif with its Hak Pakai and its Bukti Pemesanan, and a lapsed one giving
  // its plots back. It is composed here beside the Lokasi, Tariffs and Inventory it
  // reaches, exactly as the `web` runtime composes it — both processes import the same
  // domain modules, so a number is the same number in each (spec, Architecture).
  const tariffs = createTariffs({ db: database.db, clock: adapters.clock, audit, lokasi });
  const inventory = createInventory({ db: database.db, clock: adapters.clock, audit, files: adapters.files, tariffs, lokasi });
  const pemesananModuleDeps = {
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
  };
  const pemesanan = composePemesanan(pemesananModuleDeps);
  // The ticks are the module's own work, so the context carries its dependencies: a
  // tick grants a Hak Pakai and issues a Bukti Pemesanan, and it commits with the
  // status change that asked for it, which is a transaction the module owns.
  const pemesananTickDeps = { ...pemesananModuleDeps, notifikasi: pemesananNotifikasiDari(notifications) };
  // Payouts, for the Pencairan triggers and the Potongan ageing the worker runs.
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
    // The Terencairan trigger reads what a paid Pemesanan Terencana means to a
    // Pencairan, through that module's own public read (never its tables).
    terencanaTerbayar: () => pemesanan.terencanaTerbayar(),
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
      // The two Terencairan money ticks are domain work over what the module reads, so
      // the worker gets the whole module and not a narrow seam: the same composition the
      // `web` process uses, so both agree on every number (spec, Architecture).
      pemesanan: pemesananTickDeps,
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
