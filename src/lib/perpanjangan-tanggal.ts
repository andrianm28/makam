import { formatTanggal } from "@/lib/time/jakarta";

/** The IPTM expiry of a Perpanjangan TPU for a screen: the typed date, and the one recorded on the Makam TPU when they differ (the earlier one decides the masa tenggang). */
export function tanggalBerakhir(perpanjangan: { iptmBerakhirPada: string; iptmTercatatBerakhirPada: string | null }): string {
  const { iptmBerakhirPada: diketik, iptmTercatatBerakhirPada: tercatat } = perpanjangan;
  if (!tercatat || tercatat === diketik) return formatTanggal(diketik);
  return `${formatTanggal(diketik)} (diketik) / ${formatTanggal(tercatat)} (tercatat di makam)`;
}
