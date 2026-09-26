import type { LineProvider, PaymentMethod, TagihanStatus } from "@/domain/billing";

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

/** "Rp 7.500.000", or "−Rp 2.000.000" for a reduction: whole rupiah with dots grouping thousands. */
export function lineAmountText(amount: number): string {
  const grouped = String(Math.abs(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${amount < 0 ? "−" : ""}Rp ${grouped}`;
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
