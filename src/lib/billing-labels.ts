import type { BillingDocument, LineProvider, PaymentMethod, Tagihan, TagihanStatus } from "@/domain/billing";
import { formatTanggal } from "@/lib/time/jakarta";

/**
 * How Tagihan and Bukti Pembayaran read on their pages (and so in their PDFs).
 * The Billing module carries the facts; the wording lives here, once.
 */

const STATUS_TEXT: Record<TagihanStatus, string> = {
  belum_dibayar: "Belum Dibayar",
  lunas: "Lunas",
  lewat_jatuh_tempo: "Lewat Jatuh Tempo",
  tidak_tertagih: "Tidak Tertagih",
  dibatalkan: "Dibatalkan",
  dikembalikan_sebagian: "Dikembalikan Sebagian",
  dikembalikan_penuh: "Dikembalikan Penuh",
};

export function tagihanStatusText(status: TagihanStatus): string {
  return STATUS_TEXT[status];
}

export function paymentMethodText(method: PaymentMethod): string {
  switch (method.kind) {
    case "penyedia_pembayaran":
      return `Pembayaran online (${method.channel})`;
    case "transfer_manual":
      return "Transfer manual";
    case "tunai":
      return "Tunai";
    case "langsung_ke_lokasi":
      return `Dibayar langsung, diterima oleh Lokasi Mitra ${method.lokasiName}`;
    case "tanpa_pembayaran":
      return "Tanpa pembayaran (Harga Khusus)";
  }
}

/** Who a document names: a Tagihan is "Kepada" its addressee, a Bukti Pembayaran "Atas nama" them. */
export function addresseeText(document: BillingDocument["type"], role: Tagihan["addressee"]["role"]): string {
  const who = role === "pemegang_hak" ? "Pemegang Hak" : "Pemesan";
  return `${document === "tagihan" ? "Kepada" : "Atas nama"} (${who})`;
}

/** Who provides a line, as the Tagihan attributes it. */
export function lineProviderText(provider: LineProvider): string {
  switch (provider.kind) {
    case "lokasi_mitra":
      return provider.name;
    case "operator":
      return "Makam.co.id";
    case "pemda":
      return "Pemda (disetor sesuai biaya)";
  }
}

/** The Hak Pakai's term, as a Bukti Pemesanan states it: whole dates, and no end for a perpetual one. */
export interface MasaBuktiPemesanan {
  mulai: string;
  /** The end of a fixed term; null only for a perpetual (Selamanya) one — never for an unknown term. */
  selesai: string | null;
}

/**
 * A Bukti Pemesanan's "Masa Hak Pakai" row. A `selesai` of null means the Hak
 * Pakai is perpetual, and says so in words rather than leaving the family to
 * wonder; a fixed term names both of its dates.
 */
export function buktiPemesananMasa(masa: MasaBuktiPemesanan): string {
  return masa.selesai ? `${formatTanggal(masa.mulai)} sampai ${formatTanggal(masa.selesai)}` : `${formatTanggal(masa.mulai)} · selamanya`;
}

/**
 * The Bukti Pemesanan's own sentence, saying what the right is and for how long.
 *
 * It reads the same `masa` as `buktiPemesananMasa`, so the sentence and the row
 * above it cannot contradict each other: a fixed-term Hak Pakai is **never**
 * described as having no end, because that sentence is the one a family reads
 * when it decides whether the grave is theirs for good. "Tanpa batas waktu" is
 * printed for a perpetual Hak Pakai alone — a null `selesai` on a Bukti Pemesanan
 * means exactly that and never an unknown term, because the module issues no
 * document at all for a Hak Pakai whose term it cannot read.
 */
export function buktiPemesananHak(
  bukti: { lokasiName: string; pemegangHakName: string; petakNomor: string },
  masa: MasaBuktiPemesanan,
): string {
  const sejak = `sejak pemakaman pertama pada ${formatTanggal(masa.mulai)}`;
  return masa.selesai
    ? `Hak Pakai ini diberikan oleh ${bukti.lokasiName} kepada ${bukti.pemegangHakName} untuk Petak Makam ${bukti.petakNomor}, berlaku ${sejak} sampai ${formatTanggal(masa.selesai)}.`
    : `Hak Pakai ini diberikan oleh ${bukti.lokasiName} kepada ${bukti.pemegangHakName} untuk Petak Makam ${bukti.petakNomor}, berlaku ${sejak}, dan sah tanpa batas waktu.`;
}
