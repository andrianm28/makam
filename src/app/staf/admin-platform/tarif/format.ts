import type { GlobalTariffKey, Tenure } from "@/domain/tariffs";

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
