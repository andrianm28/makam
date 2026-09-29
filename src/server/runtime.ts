import "server-only";
import * as Sentry from "@sentry/nextjs";
import { createDatabase, type DatabaseHandle } from "@/db/client";
import { createAdapters } from "@/composition/adapters";
import { composeBilling, billingOn, buktiPemesananEffect, documentUrls, paymentEffects, perpanjanganEffect, type BillingComposition } from "@/composition/billing";
import { composeIdentity } from "@/composition/identity";
import { composeLayanan } from "@/composition/layanan";
import { composeNotifications } from "@/composition/notifications";
import { composePemesanan, pemesananNotifikasiDari } from "@/composition/pemesanan";
import { composePayouts } from "@/composition/payouts";
import { composeRefunds } from "@/composition/refunds";
import type { AuditLog } from "@/domain/audit";
import type { Billing } from "@/domain/billing";
import { createFieldwork, type Fieldwork } from "@/domain/fieldwork";
import type { Identity } from "@/domain/identity";
import { createInventory, type Inventory } from "@/domain/inventory";
import type { Layanan } from "@/domain/layanan";
import { createLokasi, type Lokasi } from "@/domain/lokasi";
import type { Notifications } from "@/domain/notifications";
import { createOperatorSettings, type OperatorSettings } from "@/domain/operator-settings";
import { pernahMenyebutPetakAtauKavling, type Pemesanan } from "@/domain/pemesanan";
import { createPengurusan, type Pengurusan } from "@/domain/pengurusan";
import { createPerpanjangan, type Perpanjangan } from "@/domain/perpanjangan";
import type { Payouts } from "@/domain/payouts";
import type { Refunds } from "@/domain/refunds";
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
  /** Perpanjangan of a Hak Pakai at a Lokasi Mitra: the direct path, a code to the recorded email (ticket 40). */
  perpanjangan: Perpanjangan;
  /** Payouts: Pencairan items, Potongan, the Pencairan run and the Bukti Pencairan. */
  payouts: Payouts;
  /** Refunds: refund requests, their approval and the Bukti Pengembalian Dana a transfer issues. */
  refunds: Refunds;
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
      devFilesRoot: env.DEV_FILES_ROOT,
    });
    const { audit, identity } = composeIdentity({ env, db: database.db, adapters });
    const reportError: ReportError = (error, context) => Sentry.captureException(error, context);
    const lokasi = createLokasi({ db: database.db, clock: adapters.clock, files: adapters.files, audit, identity });
    const operatorSettings = createOperatorSettings({ db: database.db, clock: adapters.clock, audit });
    const tariffs = createTariffs({ db: database.db, clock: adapters.clock, audit, lokasi });
    // One place picks live or fake (AGENTS.md); the wizard's Denah and hold need a Lokasi Mitra's Terencana switch and tumpang rules.
    const inventory = createInventory({ db: database.db, clock: adapters.clock, audit, files: adapters.files, tariffs, lokasi, pemesananPernahMenyebut: pernahMenyebutPetakAtauKavling });
    // Billing's composition, held as one value: the runtime's own Billing, the read-only one Notifications and the payment effects all come from it (a payment's downstream effect acts inside Billing's transaction, so it is built from this too).
    // Every Billing of this runtime (the read-only ones the other modules hold included, since Pemesanan declares Tidak Tertagih through its own) guards it with
    // Notifications' call log; the closure runs only after both are built (ticket 29).
    // `payoutsRef.current` is filled in once Payouts is composed below (it is
    // composed *after* Billing, since it reads a Tagihan through it): Billing's
    // own Harga Khusus path (ticket 30) only ever *calls*
    // `kurangiPencairanPesanan` once a write happens, well after this module
    // has finished loading, so the closure over a not-yet-filled box is safe.
    const payoutsRef: { current?: Pick<Payouts, "pemakamanTercatat"> & { kurangiPencairanPesanan: NonNullable<BillingComposition["kurangiPencairanPesanan"]> } } = {};
    const billingComposition: BillingComposition = {
      env,
      db: database.db,
      adapters,
      operatorSettings,
      reportError,
      audit,
      files: adapters.files,
      kurangiPencairanPesanan: (tx, input) => {
        if (!payoutsRef.current) throw new Error("Payouts is not composed yet: kurangiPencairanPesanan was called before startup finished");
        return payoutsRef.current.kurangiPencairanPesanan(tx, input);
      },
      hasLoggedCall: (tagihanId: string): Promise<boolean> => notifications.teleponPemesanTercatat("tagihan", tagihanId),
      // A Harga Khusus reissue is announced to the family in its own transaction (Notifications is composed after this, hence the lazy read).
      umumkanTagihanPengganti: (tx, input) => notifications.tagihanTerbitPengganti(input, tx),
    };
    const notifications = composeNotifications({
      env,
      db: database.db,
      adapters,
      audit,
      identity,
      billing: billingOn(billingComposition, database.db),
      reportError,
    });
    const notifikasi = pemesananNotifikasiDari(notifications);
    const fieldwork = createFieldwork({
      db: database.db,
      clock: adapters.clock,
      files: adapters.files,
      audit,
      identity,
      notifications,
      lokasi,
      // The Tier 3 "Setor Retribusi" row and the payment that closes it read
      // Billing's own query of the Lunas Retribusi Tagihan.
      billing: billingOn(billingComposition, database.db),
    });
    // The wizard's own messages, and the Lokasi's when it confirms an order, go out through Notifications.
    const pemesanan = composePemesanan({
      db: database.db,
      clock: adapters.clock,
      reportError,
      files: adapters.files,
      audit,
      lokasi,
      tariffs,
      inventory,
      billing: billingOn(billingComposition, database.db),
      // A recorded Pemakaman is told to Payouts inside the burial's own transaction (ticket 90).
      // Payouts is composed after Billing, which is after this module, so it is reached through the lazy box filled below.
      payouts: {
        pemakamanTercatat: (tx, input) => {
          if (!payoutsRef.current) throw new Error("Payouts is not composed yet: pemakamanTercatat was called before startup finished");
          return payoutsRef.current.pemakamanTercatat(tx, input);
        },
      },
      identity,
      notifikasi,
    });
    const billing = composeBilling({
      ...billingComposition,
      paymentEffects: paymentEffects({
        clock: adapters.clock,
        dokumenUrl: documentUrls(env).publicDocumentUrl,
        // A paid order Layanan schedules its jobs, unless the grave's Hak Pakai is still Perlu Verifikasi (ticket 50).
        layanan: { db: database.db, inventory },
        // A paid order earns its Bukti Pemesanan and becomes Selesai, in the payment's own transaction (ticket 25).
        buktiPemesanan: buktiPemesananEffect({
          clock: adapters.clock,
          compose: billingComposition,
          inventory,
          lokasi,
          notifikasi,
        }),
        // A paid Perpanjangan extends its Hak Pakai and issues its Bukti Perpanjangan (ticket 40).
        perpanjangan: perpanjanganEffect({ compose: billingComposition, inventory, lokasi, notifikasi: notifications }),
      }),
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
    // Fills the lazy reference `billingComposition.kurangiPencairanPesanan`
    // closed over above, now that Payouts exists to call.
    payoutsRef.current = payouts;
    // Refunds (ticket 31) reads a Tagihan and numbers a Bukti through Billing
    // and nets through Payouts, so it is composed after both.
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
      pemesanan,
      reportError,
    });
    // The Layanan catalog, the prices a Lokasi Mitra offers and the order a family places for a grave:
    // it issues its Tagihan through Billing and announces it through Notifications, so it is composed after both.
    const layanan = composeLayanan({
      db: database.db,
      clock: adapters.clock,
      files: adapters.files,
      audit,
      lokasi,
      tariffs,
      inventory,
      billing,
      identity,
      refunds,
      notifications,
    });
    // The Antrean's Tier 1 "Konfirmasi TPU Saat Duka" row reads the Pengurusan
    // module, so it is composed before the queue that runs its query.
    const pengurusan = createPengurusan({
      db: database.db,
      clock: adapters.clock,
      files: adapters.files,
      audit,
      lokasi,
      tariffs,
      billing,
      identity,
      // The "Ambil surat pengantar" Tugas a confirmation creates, inside the
      // confirmation's own transaction.
      fieldwork,
      layanan,
      notifikasi: notifications,
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
      refunds,
      queues: createQueues({
        db: database.db,
        clock: adapters.clock,
        audit,
        identity,
        lokasi,
        fieldwork,
        billing,
        notifications,
        inventory,
        pemesanan,
        layanan,
        payouts,
        pengurusan,
        refunds,
      }),
      pengurusan,
      perpanjangan: createPerpanjangan({
        db: database.db,
        clock: adapters.clock,
        lokasi,
        tariffs,
        inventory,
        billing,
        pemesanan,
        identity,
        notifikasi: notifications,
      }),
    };
  }
  return globalForRuntime.__makamRuntime;
}
