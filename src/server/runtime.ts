import "server-only";
import { createDatabase, type DatabaseHandle } from "@/db/client";
import { createAdapters } from "@/composition/adapters";
import { composeIdentity } from "@/composition/identity";
import type { AuditLog } from "@/domain/audit";
import type { Identity } from "@/domain/identity";
import { readRuntimeEnv, type RuntimeEnv } from "@/lib/env";
import type { Adapters } from "@/ports";

export interface ServerRuntime {
  env: RuntimeEnv;
  database: DatabaseHandle;
  adapters: Adapters;
  audit: AuditLog;
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
      smtp: env.smtp,
    });
    globalForRuntime.__makamRuntime = {
      env,
      database,
      adapters,
      ...composeIdentity({ env, db: database.db, adapters }),
    };
  }
  return globalForRuntime.__makamRuntime;
}
