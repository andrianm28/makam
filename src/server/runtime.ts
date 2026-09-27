import "server-only";
import * as Sentry from "@sentry/nextjs";
import { createDatabase, type DatabaseHandle } from "@/db/client";
import { createAdapters } from "@/composition/adapters";
import { composeBilling } from "@/composition/billing";
import { composeIdentity } from "@/composition/identity";
import { composeNotifications } from "@/composition/notifications";
import { composePemesanan } from "@/composition/pemesanan";
import type { AuditLog } from "@/domain/audit";
import type { Billing } from "@/domain/billing";
import { createFieldwork, type Fieldwork } from "@/domain/fieldwork";
import type { Identity } from "@/domain/identity";
import { createInventory, type Inventory } from "@/domain/inventory";
import { createLokasi, type Lokasi } from "@/domain/lokasi";
import { createNotifications, type Notifications } from "@/domain/notifications";
import { createOperatorSettings, type OperatorSettings } from "@/domain/operator-settings";
import type { Pemesanan } from "@/domain/pemesanan";
import { createQueues, type Queues } from "@/domain/queues";
import { createTariffs, type Tariffs } from "@/domain/tariffs";
import { readRuntimeEnv, type RuntimeEnv } from "@/lib/env";
import type { ReportError } from "@/lib/observability/report-error";
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
  /** Inventory: the Denah (Blok, Petak Makam, Kavling Keluarga). */
  inventory: Inventory;
  /** Field Work: Tugas Lapangan for Petugas Lapangan (Kunjungan Verifikasi, Cek Denah). */
  fieldwork: Fieldwork;
  /** Work Queues: the Antrean, Ambil and Catatan Internal. */
  queues: Queues;
  /** Pemesanan Makam: the Saat Duka wizard's list, its Kirim and the order page. */
  pemesanan: Pemesanan;
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
      sumopod: env.sumopod,
      vapid: env.vapid,
      chromiumPath: env.CHROMIUM_PATH,
      authSecret: env.AUTH_SECRET,
      filesRoot: env.FILES_ROOT,
      appBaseUrl: env.APP_BASE_URL,
    });
    const { audit, identity } = composeIdentity({ env, db: database.db, adapters });
    const reportError: ReportError = (error, context) => Sentry.captureException(error, context);
    const lokasi = createLokasi({ db: database.db, clock: adapters.clock, files: adapters.files, audit, identity });
    const operatorSettings = createOperatorSettings({ db: database.db, clock: adapters.clock, audit });
    const tariffs = createTariffs({ db: database.db, clock: adapters.clock, audit, lokasi });
    const billing = composeBilling({ env, db: database.db, adapters, operatorSettings, reportError });
    const notifications = composeNotifications({
      env,
      db: database.db,
      adapters,
      audit,
      identity,
      billing,
      reportError,
    });
    const fieldwork = createFieldwork({
      db: database.db,
      clock: adapters.clock,
      files: adapters.files,
      audit,
      identity,
      notifications,
      lokasi,
    });
    const billing = composeBilling({ env, db: database.db, adapters, operatorSettings, reportError });
    const inventory = createInventory({ db: database.db, clock: adapters.clock, audit, files: adapters.files, tariffs });
    globalForRuntime.__makamRuntime = {
      env,
      database,
      adapters,
      audit,
      identity,
      notifications,
      lokasi,
      operatorSettings,
      tariffs,
      billing,
      inventory,
      fieldwork,
      queues: createQueues({
        db: database.db,
        clock: adapters.clock,
        audit,
        lokasi,
        fieldwork,
        billing,
        notifications,
      }),
      pemesanan: composePemesanan({
        db: database.db,
        clock: adapters.clock,
        lokasi,
        tariffs,
        inventory,
        billing,
        identity,
        notifications,
      }),
    };
  }
  return globalForRuntime.__makamRuntime;
}
