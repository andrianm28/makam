/**
 * The `worker` container's entry point: pg-boss consumers and schedules.
 * Built to dist/worker.mjs; run locally with `npm run worker`.
 */
import { SystemClock } from "@/adapters/live/system-clock";
import { composeSchedulerContext } from "@/composition/scheduler";
import { createDatabase } from "@/db/client";
import { scheduledTicks } from "@/domain/scheduler";
import { readRuntimeEnv } from "@/lib/env";
import { startWorker } from "./runtime";
import { initWorkerSentry } from "./sentry";

async function main() {
  const env = readRuntimeEnv();
  const sentry = initWorkerSentry(env);
  const database = createDatabase(env.DATABASE_URL, { applicationName: "makam-worker" });

  const worker = await startWorker({
    connectionString: env.DATABASE_URL,
    context: composeSchedulerContext({
      db: database.db,
      reportError: (error, context) => sentry.captureException(error, context),
    }),
    clock: new SystemClock(),
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
