import type { GlobalTariffKey, Tenure } from "@/domain/tariffs";
import { JAKARTA_TIME_ZONE } from "@/lib/time/jakarta";

const wibDate = new Intl.DateTimeFormat("en-CA", { timeZone: JAKARTA_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** The WIB calendar date of an instant, "YYYY-MM-DD" (the earliest effective date a form offers). */
export function wibDateOf(instant: Date): string {
  return wibDate.format(instant);
}

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
