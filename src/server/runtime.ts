import "server-only";
import { createDatabase, type DatabaseHandle } from "@/db/client";
import { createAdapters } from "@/composition/adapters";
import { readRuntimeEnv, type RuntimeEnv } from "@/lib/env";
import type { Adapters } from "@/ports";

export interface ServerRuntime {
  env: RuntimeEnv;
  database: DatabaseHandle;
  adapters: Adapters;
}

const globalForRuntime = globalThis as unknown as { __makamRuntime?: ServerRuntime };

/**
 * The `web` process's composition root: one database pool and one set of
 * adapters per process (kept on globalThis so dev hot reload does not leak
 * pools). Built lazily so `next build` never needs a database.
 */
export function serverRuntime(): ServerRuntime {
  if (!globalForRuntime.__makamRuntime) {
    const env = readRuntimeEnv();
    globalForRuntime.__makamRuntime = {
      env,
      database: createDatabase(env.DATABASE_URL, { applicationName: "makam-web" }),
      adapters: createAdapters({
        appEnv: env.APP_ENV,
        fakePaymentWebhookSecret: env.FAKE_PAYMENT_WEBHOOK_SECRET,
      }),
    };
  }
  return globalForRuntime.__makamRuntime;
}
