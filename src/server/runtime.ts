import "server-only";
import * as Sentry from "@sentry/nextjs";
import { createDatabase, type DatabaseHandle } from "@/db/client";
import { createAdapters } from "@/composition/adapters";
import { composeBilling } from "@/composition/billing";
import { composeIdentity } from "@/composition/identity";
import { composeNotifications } from "@/composition/notifications";
import { composePemesanan } from "@/composition/pemesanan";
import { composePayouts } from "@/composition/payouts";
import type { AuditLog } from "@/domain/audit";
import type { Billing } from "@/domain/billing";
import { createFieldwork, type Fieldwork } from "@/domain/fieldwork";
import type { Identity } from "@/domain/identity";
import { createInventory, type Inventory } from "@/domain/inventory";
import { createLayanan, type Layanan } from "@/domain/layanan";
import { createLokasi, type Lokasi } from "@/domain/lokasi";
import type { Notifications } from "@/domain/notifications";
import { createOperatorSettings, type OperatorSettings } from "@/domain/operator-settings";
import type { Pemesanan } from "@/domain/pemesanan";
import { createPengurusan, type Pengurusan } from "@/domain/pengurusan";
import type { Payouts } from "@/domain/payouts";
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
  /** Layanan: the global catalog, which Layanan each Lokasi offers, and the Paket Layanan. */
  layanan: Layanan;
  /** Billing: Tagihan, Bukti Pembayaran and their document pages. */
  billing: Billing;
  /** Inventory: the Denah (Blok, Petak Makam, Kavling Keluarga) and the plot hold a Terencana order places. */
  inventory: Inventory;
  /** Field Work: Tugas Lapangan for Petugas Lapangan (Kunjungan Verifikasi, Cek Denah). */
  fieldwork: Fieldwork;
  /** Work Queues: the Antrean, Ambil and Catatan Internal. */
  queues: Queues;
  /** Pemesanan Makam: both booking wizards (Saat Duka's list, Kirim and order page; Terencana's Denah, hold and order). */
  pemesanan: Pemesanan;
  /** Pengurusan at a DKI TPU: the Saat Duka TPU list, its submission and its order page. */
  pengurusan: Pengurusan;
  /** Payouts: Pencairan items, Potongan, the Pencairan run and the Bukti Pencairan. */
  payouts: Payouts;
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
    const layanan = createLayanan({ db: database.db, clock: adapters.clock, audit, lokasi, tariffs });
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
    // One place picks live or fake (AGENTS.md); the wizard's Denah and hold need a Lokasi Mitra's Terencana switch and tumpang rules.
    const inventory = createInventory({ db: database.db, clock: adapters.clock, audit, files: adapters.files, tariffs, lokasi });
    // The wizard's own messages, and the Lokasi's when it confirms an order, go out through Notifications.
    const pemesanan = composePemesanan({
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
    });
    // Payouts reads the issued Tagihan through Billing, so it is composed after it.
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
      layanan,
      billing,
      inventory,
      fieldwork,
      pemesanan,
      payouts,
      queues: createQueues({
        db: database.db,
        clock: adapters.clock,
        audit,
        lokasi,
        fieldwork,
        billing,
        notifications,
        inventory,
        pemesanan,
        payouts,
        identity,
      }),
      pengurusan: createPengurusan({
        db: database.db,
        clock: adapters.clock,
        files: adapters.files,
        lokasi,
        tariffs,
        billing,
        identity,
      }),
    };
  }
  return globalForRuntime.__makamRuntime;
}
