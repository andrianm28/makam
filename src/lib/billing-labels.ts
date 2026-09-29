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

/**
 * The Hak Pakai's term, as a Bukti Pemesanan states it: whole dates, and no end
 * for a perpetual one. A Terencana right nobody is buried in yet has no first
 * Pemakaman: its `mulai` is null and the term is stated by its length instead.
 */
export interface MasaBuktiPemesanan {
  /** The first Pemakaman's date; null only while the term has not started (a Pemesanan Terencana, paid, no burial yet). */
  mulai: string | null;
  /** The end of a fixed term; null for a perpetual (Selamanya) one and for a term that has not started — never for an unknown term. */
  selesai: string | null;
  /** The fixed term in years, given only while `mulai` is null; null there means perpetual. */
  tahun?: number | null;
}

/**
 * A Bukti Pemesanan's "Masa Hak Pakai" row. A `selesai` of null means the Hak
 * Pakai is perpetual, and says so in words rather than leaving the family to
 * wonder; a fixed term names both of its dates. A term that has not started says
 * how long it will run and from when, never an invented date.
 */
export function buktiPemesananMasa(masa: MasaBuktiPemesanan): string {
  if (masa.mulai === null) return masa.tahun ? `${masa.tahun} tahun sejak pemakaman pertama` : "selamanya";
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
  const kepada = `Hak Pakai ini diberikan oleh ${bukti.lokasiName} kepada ${bukti.pemegangHakName} untuk Petak Makam ${bukti.petakNomor}`;
  if (masa.mulai === null) {
    return masa.tahun
      ? `${kepada}, berlaku ${masa.tahun} tahun sejak pemakaman pertama.`
      : `${kepada}, berlaku sejak pemakaman pertama dan sah tanpa batas waktu.`;
  }
  const sejak = `sejak pemakaman pertama pada ${formatTanggal(masa.mulai)}`;
  return masa.selesai
    ? `${kepada}, berlaku ${sejak} sampai ${formatTanggal(masa.selesai)}.`
    : `${kepada}, berlaku ${sejak}, dan sah tanpa batas waktu.`;
}
