/** Indonesian date formatting for public-facing copy. `date` is a WIB calendar date "YYYY-MM-DD". */

const bulanTahunFormat = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });
const tanggalPanjangFormat = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** "September 2026" ("dikunjungi <bulan tahun>"). */
export function formatBulanTahun(date: string): string {
  return bulanTahunFormat.format(new Date(`${date}T00:00:00Z`));
}

/** "5 September 2026". */
export function formatTanggalPanjang(date: string): string {
  return tanggalPanjangFormat.format(new Date(`${date}T00:00:00Z`));
}
