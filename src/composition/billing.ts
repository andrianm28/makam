import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import { createBilling, type Billing, type BillingDeps, type PaymentEffect } from "@/domain/billing";
import { efekJadwalkanPekerjaan, type JadwalkanDeps } from "@/domain/layanan/pembayaran";
import { efekBuktiPembayaran } from "@/domain/notifications";
import { masaPembatalanDimulai } from "@/domain/payouts";
import { efekPencairanSaatLunas } from "@/domain/payouts/efek";
import { efekBuktiPemesanan, type BuktiPemesananEffectDeps } from "@/domain/pemesanan";
import { efekPerpanjangan, type EfekPerpanjanganDeps } from "@/domain/perpanjangan";
import type { OperatorSettings } from "@/domain/operator-settings";
import { documentPagePath } from "@/lib/document-links";
import type { RuntimeEnv } from "@/lib/env";
import type { ReportError } from "@/lib/observability/report-error";
import type { Adapters } from "@/ports";
import type { Clock } from "@/ports/clock";

/** What Billing is composed from: the env, the database and the picked adapters. */
export interface BillingComposition {
  env: Pick<RuntimeEnv, "documentPageOrigin" | "APP_BASE_URL">;
  db: Database;
  adapters: Adapters;
  operatorSettings: Pick<OperatorSettings, "current">;
  reportError: ReportError;
  /**
   * Every staff write Billing itself records records an Entri Audit here (the
   * manual and direct payment paths, and Harga Khusus; ticket 30). Optional so
   * every read-only `billingOn` caller (Notifications, Fieldwork, …) need not
   * supply one; the runtime's own composition always does.
   */
  audit?: AuditLog;
  /** The private FileStore, for a manual or direct payment's proof (ticket 30). */
  files?: Adapters["files"];
  /**
   * Lowers one order's Pencairan by a Harga Khusus partner share (Payouts'
   * `kurangiPencairanPesanan`, ticket 32). Payouts is composed *after*
   * Billing (it reads a Tagihan through it), so the runtime wires this as a
   * lazy call into the Payouts it builds afterwards — see `src/server/runtime.ts`.
   */
  kurangiPencairanPesanan?: BillingDeps["kurangiPencairanPesanan"];
  /**
   * Whether a call has been logged for a Tagihan's chasing (ticket 29's
   * `declareTidakTertagih` guard), composed from Notifications'
   * `teleponPemesanTercatat`. Left out for a read-only Billing (`billingOn`)
   * or one composed before Notifications exists: unwired means nothing can be
   * declared Tidak Tertagih, the safe default.
   */
  hasLoggedCall?: (tagihanId: string) => Promise<boolean>;
  /**
   * Announces a Harga Khusus reissue's Tagihan (Notifications'
   * `tagihanTerbitPengganti`), inside the reissue's transaction. Wired lazily
   * by the runtime, since Notifications is composed after the Billing it reads.
   */
  umumkanTagihanPengganti?: BillingDeps["umumkanTagihanPengganti"];
}

/**
 * The downstream effects of a payment (spec, Billing: Bukti Pemesanan /
 * Perpanjangan, Pencairan due, Pekerjaan Layanan scheduled, Hak Pakai
 * extended or created). The modules that own them register them here, the one
 * registry both the `web` runtime and the worker's retry tick use. Built here:
 * Notifications' Bukti Pembayaran receipt email (ticket 20), the Payouts
 * module's record of a settled payment, which is the Lunas half of the Saat
 * Duka Pencairan trigger (ticket 32), and the Pemesanan module's Bukti
 * Pemesanan, which makes a paid order Selesai (ticket 25), and the Layanan
 * module's scheduling of a paid order's jobs (ticket 50).
 */
export function paymentEffects(deps: {
  clock: Clock;
  dokumenUrl: (link: string) => string;
  /** What the Layanan effect needs: the database and a grave's Hak Pakai, which holds a job back until the Admin Lokasi completes it. */
  layanan: JadwalkanDeps;
  /** The Pemesanan module's own effect (ticket 25), when a process composes that module beside Billing. */
  buktiPemesanan?: PaymentEffect;
  /** The Perpanjangan module's own effect (ticket 40): a paid Perpanjangan extends its Hak Pakai and issues its Bukti. */
  perpanjangan?: PaymentEffect;
}): readonly PaymentEffect[] {
  return [
    efekBuktiPembayaran({ clock: deps.clock, dokumenUrl: deps.dokumenUrl }),
    efekPencairanSaatLunas(),
    efekJadwalkanPekerjaan(deps.layanan),
    ...(deps.buktiPemesanan ? [deps.buktiPemesanan] : []),
    ...(deps.perpanjangan ? [deps.perpanjangan] : []),
  ];
}

/** Where a document's page lives: inside the container for the PdfRenderer, on the public site for payers. */
export function documentUrls(env: Pick<RuntimeEnv, "documentPageOrigin" | "APP_BASE_URL">) {
  const publicOrigin = new URL(env.APP_BASE_URL).origin;
  return {
    documentPageUrl: (link: string) => `${env.documentPageOrigin}${documentPagePath(link)}`,
    publicDocumentUrl: (link: string) => `${publicOrigin}${documentPagePath(link)}`,
    /** A Pemesanan Makam's own page, where a family follows its order (ticket 23). */
    pesananUrl: (nomor: string) => `${publicOrigin}/pesanan/${nomor}`,
    /**
     * The Pilih makam list a family is sent back to after a Tolak, carrying the
     * declined order's number: the page reads it, takes the rejecting Lokasi out
     * of the list and prefills the family's data (spec, Public site: "After a
     * Tolak, the Pilih makam list opens with a banner, the rejecting Lokasi
     * removed and the family's data prefilled"; ticket 24).
     */
    pesananUlangUrl: (nomor: string) => `${publicOrigin}/pesan-makam/saat-duka?dari=${encodeURIComponent(nomor)}`,
    /** A Pengurusan order's own page, where a family follows a TPU filing (ticket 45). */
    pengurusanUrl: (nomor: string) => `${publicOrigin}/pengurusan/${nomor}`,
    /** An order Layanan's own page, where its Pemesan follows every job and its proof (ticket 50). */
    layananUrl: (nomor: string) => `${publicOrigin}/layanan/${nomor}`,
  };
}

/** Billing's own dependency bundle for this composition, without the payment effects (which are built from it). */
function billingDeps(deps: BillingComposition, paymentEffects: readonly PaymentEffect[]): BillingDeps {
  const urls = documentUrls(deps.env);
  return {
    db: deps.db,
    clock: deps.adapters.clock,
    operatorSettings: deps.operatorSettings,
    pdf: deps.adapters.pdf,
    payments: deps.adapters.payments,
    ...urls,
    paymentEffects,
    reportError: deps.reportError,
    audit: deps.audit,
    files: deps.files ?? deps.adapters.files,
    kurangiPencairanPesanan: deps.kurangiPencairanPesanan,
    hasLoggedCall: deps.hasLoggedCall,
    umumkanTagihanPengganti: deps.umumkanTagihanPengganti,
  };
}

/**
 * Billing on a given database or open transaction, built from the same settings
 * the runtime's own Billing uses. A PaymentEffect of another module runs *inside*
 * the transaction that settles a Tagihan and has to issue a document there, which
 * is what Billing's `within` is for; this is how such an effect reaches that
 * `within` without holding a Billing that was built before the effect existed.
 * A caller that only reads (Notifications' Tagihan read) takes the same thing.
 */
export function billingOn(deps: BillingComposition, tx: Database): Billing {
  return createBilling({ ...billingDeps(deps, []), db: tx });
}

/** The Pemesanan module's Bukti Pemesanan effect, on a given payment transaction. */
export function buktiPemesananEffect(
  deps: Omit<BuktiPemesananEffectDeps, "billingOn" | "pencairan"> & { compose: BillingComposition },
): PaymentEffect {
  const { compose, ...rest } = deps;
  // A paid Pemesanan Terencana tells Payouts when its Masa Pembatalan ends, in the payment's own transaction (ticket 37).
  return efekBuktiPemesanan({ ...rest, billingOn: (tx) => billingOn(compose, tx), pencairan: { masaPembatalanDimulai } });
}

/** The Perpanjangan module's payment effect, on a given payment transaction (ticket 40). */
export function perpanjanganEffect(deps: Omit<EfekPerpanjanganDeps, "billingOn"> & { compose: BillingComposition }): PaymentEffect {
  const { compose, ...rest } = deps;
  return efekPerpanjangan({ ...rest, billingOn: (tx) => billingOn(compose, tx) });
}

/** Billing wired on one database: shared by the `web` runtime, its test twin, the CLIs and the worker's retry tick. */
export function composeBilling(
  deps: BillingComposition & ({ paymentEffects: readonly PaymentEffect[] } | { layanan: JadwalkanDeps }),
): Billing {
  const urls = documentUrls(deps.env);
  return createBilling(
    billingDeps(
      deps,
      "paymentEffects" in deps
        ? deps.paymentEffects
        : paymentEffects({ clock: deps.adapters.clock, dokumenUrl: urls.publicDocumentUrl, layanan: deps.layanan }),
    ),
  );
}
