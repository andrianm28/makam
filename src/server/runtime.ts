import "server-only";
import { createDatabase, type DatabaseHandle } from "@/db/client";
import { createAdapters } from "@/composition/adapters";
import { composeIdentity } from "@/composition/identity";
import type { AuditLog } from "@/domain/audit";
import type { Identity } from "@/domain/identity";
import { createNotifications, type Notifications } from "@/domain/notifications";
import { createOperatorSettings, type OperatorSettings } from "@/domain/operator-settings";
import { readRuntimeEnv, type RuntimeEnv } from "@/lib/env";
import type { Adapters } from "@/ports";

export interface ServerRuntime {
  env: RuntimeEnv;
  database: DatabaseHandle;
  adapters: Adapters;
  audit: AuditLog;
  identity: Identity;
  notifications: Notifications;
  /** Pengaturan Operator: read through `current()` / `inForceAt()`, never from env or constants. */
  operatorSettings: OperatorSettings;
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
      vapid: { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT },
    });
    const { audit, identity } = composeIdentity({ env, db: database.db, adapters });
    const notifications = createNotifications({
      db: database.db,
      clock: adapters.clock,
      whatsapp: adapters.whatsapp,
      webPush: adapters.webPush,
      identity,
      audit,
    });
    globalForRuntime.__makamRuntime = {
      env,
      database,
      adapters,
      audit,
      identity,
      notifications,
      operatorSettings: createOperatorSettings({ db: database.db, clock: adapters.clock, audit }),
    };
  }
  return globalForRuntime.__makamRuntime;
}
