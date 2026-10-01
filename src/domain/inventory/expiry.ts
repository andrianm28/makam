/**
 * The pure rules of a fixed-term Hak Pakai's end (spec, Inventory > Hak Pakai;
 * story 57, 129, 130): when its end reminders are due and whether it is still
 * inside its Masa Tenggang. No database, no Clock: every case is a plain unit
 * test, and the tick feeds it the facts.
 *
 * Reminders go 60, 30 and 7 days before the end date, then weekly (every 7
 * days) through the Masa Tenggang. The Masa Tenggang length is the Lokasi
 * Mitra's own policy (default 3 months), counted from the end date.
 */

/** The days before the end date a reminder goes out. */
export const HARI_PENGINGAT_SEBELUM = [60, 30, 7] as const;

/** Which reminder is due on one WIB date, or null. */
export type MacamPengingat = "h60" | "h30" | "h7" | "mingguan";

/** "YYYY-MM-DD" plus `months` calendar months; a day the target month lacks becomes that month's last day. */
export function tambahBulan(tanggal: string, months: number): string {
  const [tahun, bulan, hari] = tanggal.split("-").map(Number);
  const target = new Date(Date.UTC(tahun, bulan - 1 + months, 1));
  const terakhir = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(hari, terakhir));
  return target.toISOString().slice(0, 10);
}

/** The WIB date a Hak Pakai's Masa Tenggang ends, inclusive. */
export function masaTenggangSelesai(endDate: string, masaTenggangMonths: number): string {
  return tambahBulan(endDate, masaTenggangMonths);
}

/** Whole days from `hariIni` to `tanggal`, positive when `tanggal` is in the future (both "YYYY-MM-DD"). */
function selisihHari(hariIni: string, tanggal: string): number {
  const dari = Date.parse(`${hariIni}T00:00:00Z`);
  const ke = Date.parse(`${tanggal}T00:00:00Z`);
  return Math.round((ke - dari) / 86_400_000);
}

/**
 * Whether a fixed-term Hak Pakai's end date still leaves it inside its Masa
 * Tenggang on `hariIni`, so a Perpanjangan is still accepted and the Antrean
 * Lokasi's row still shows it.
 */
export function dalamMasaTenggang(endDate: string, masaTenggangMonths: number, hariIni: string): boolean {
  return hariIni >= endDate && hariIni <= masaTenggangSelesai(endDate, masaTenggangMonths);
}

/**
 * Which end reminder is due on the WIB date `hariIni` for a Hak Pakai ending
 * on `endDate`, or null: 60/30/7 days before the end date, then every 7 days
 * after it while still inside the Masa Tenggang. The exact day only, so a tick
 * that runs more than once a day cannot send the same reminder twice.
 */
export function pengingatHakPakaiHari(endDate: string, masaTenggangMonths: number, hariIni: string): MacamPengingat | null {
  const jarak = selisihHari(hariIni, endDate);
  if (jarak === 60) return "h60";
  if (jarak === 30) return "h30";
  if (jarak === 7) return "h7";
  if (jarak >= 0) return null;
  if (!dalamMasaTenggang(endDate, masaTenggangMonths, hariIni)) return null;
  return -jarak % 7 === 0 ? "mingguan" : null;
}

/** Whether a Hak Pakai on `endDate` has already passed its end date by `hariIni` (so it is Kedaluwarsa). */
export function sudahKedaluwarsa(endDate: string, hariIni: string): boolean {
  return endDate < hariIni;
}
