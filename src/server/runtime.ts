import "server-only";
import { createDatabase, type DatabaseHandle } from "@/db/client";
import { createAdapters } from "@/composition/adapters";
import { createIdentity, type Identity } from "@/domain/identity";
import { readRuntimeEnv, type RuntimeEnv } from "@/lib/env";
import type { Adapters } from "@/ports";

export interface ServerRuntime {
  env: RuntimeEnv;
  database: DatabaseHandle;
  adapters: Adapters;
  identity: Identity;
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
    const database = createDatabase(env.DATABASE_URL, { applicationName: "makam-web" });
    const adapters = createAdapters({
      appEnv: env.APP_ENV,
      fakePaymentWebhookSecret: env.FAKE_PAYMENT_WEBHOOK_SECRET,
    });
    globalForRuntime.__makamRuntime = {
      env,
      database,
      adapters,
      identity: createIdentity({
        db: database.db,
        clock: adapters.clock,
        whatsapp: adapters.whatsapp,
        secret: env.AUTH_SECRET,
        baseURL: env.APP_BASE_URL,
      }),
    };
  }
  return globalForRuntime.__makamRuntime;
}
