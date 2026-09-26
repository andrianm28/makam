import type { GlobalTariffKey, Tenure } from "@/domain/tariffs";

const bulan = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

/** "Rp 7.500.000": whole rupiah with dots grouping thousands (no sen, ever). */
export function formatRupiah(amount: number): string {
  return `Rp ${String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

/** "1 November 2026" for an effective date "2026-11-01". */
export function formatTanggal(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return `${day} ${bulan[month - 1]} ${year}`;
}

/** "Selamanya" or "5 tahun". */
export function formatTenure(tenure: Tenure): string {
  return tenure.kind === "selamanya" ? "Selamanya" : `${tenure.years} tahun`;
}

/** How each global tariff is named on screen (CONTEXT.md). */
export const globalTariffLabels: Record<GlobalTariffKey, string> = {
  biaya_layanan_platform: "Biaya Layanan Platform",
  biaya_pengurusan_pemakaman: "Biaya Pengurusan (dengan pemakaman)",
  biaya_pengurusan_berkas: "Biaya Pengurusan (hanya berkas)",
  retribusi_pemda_iptm: "Retribusi Pemda (IPTM)",
};
