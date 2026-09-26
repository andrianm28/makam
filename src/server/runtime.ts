import "server-only";
import * as Sentry from "@sentry/nextjs";
import { createDatabase, type DatabaseHandle } from "@/db/client";
import { createAdapters } from "@/composition/adapters";
import { composeIdentity } from "@/composition/identity";
import type { AuditLog } from "@/domain/audit";
import { createBilling, type Billing } from "@/domain/billing";
import { documentPagePath } from "@/lib/document-links";
import type { Identity } from "@/domain/identity";
import { createNotifications, type Notifications } from "@/domain/notifications";
import { createLokasi, type Lokasi } from "@/domain/lokasi";
import { createOperatorSettings, type OperatorSettings } from "@/domain/operator-settings";
import { createTariffs, type Tariffs } from "@/domain/tariffs";
import { readRuntimeEnv, type RuntimeEnv } from "@/lib/env";
import type { Adapters } from "@/ports";

export interface ServerRuntime {
  env: RuntimeEnv;
  database: DatabaseHandle;
  adapters: Adapters;
  audit: AuditLog;
  identity: Identity;
  notifications: Notifications;
  lokasi: Lokasi;
  /** Pengaturan Operator: read through `current()` / `inForceAt()`, never from env or constants. */
  operatorSettings: OperatorSettings;
  /** Tariffs: versioned price books and the all-in `quote()`. */
  tariffs: Tariffs;
  /** Billing: Tagihan, Bukti Pembayaran and their document pages. */
  billing: Billing;
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
      vapid: env.vapid,
      chromiumPath: env.CHROMIUM_PATH,
    });
    const { audit, identity } = composeIdentity({ env, db: database.db, adapters });
    const notifications = createNotifications({
      db: database.db,
      clock: adapters.clock,
      whatsapp: adapters.whatsapp,
      webPush: adapters.webPush,
      identity,
      audit,
      reportError: (error, context) => Sentry.captureException(error, context),
    });
    const lokasi = createLokasi({ db: database.db, clock: adapters.clock, files: adapters.files, audit, identity });
    const operatorSettings = createOperatorSettings({ db: database.db, clock: adapters.clock, audit });
    globalForRuntime.__makamRuntime = {
      env,
      database,
      adapters,
      audit,
      identity,
      notifications,
      lokasi,
      operatorSettings,
      tariffs: createTariffs({ db: database.db, clock: adapters.clock, audit, lokasi }),
      billing: createBilling({
        db: database.db,
        clock: adapters.clock,
        operatorSettings,
        pdf: adapters.pdf,
        documentPageUrl: (link) => `${env.documentPageOrigin}${documentPagePath(link)}`,
      }),
    };
  }
  return globalForRuntime.__makamRuntime;
}
