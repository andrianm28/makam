/**
 * Calendar-month arithmetic on WIB dates ("YYYY-MM-DD"), shared by every
 * deadline that counts whole months from a date (a Perpanjangan's Masa
 * Tenggang, a Hak Pakai's end reminders). Pure: no time zone conversion, so a
 * day the target month lacks becomes that month's last day.
 */

/** "YYYY-MM-DD" plus `months` calendar months; a day the target month lacks becomes that month's last day. */
export function tambahBulan(tanggal: string, months: number): string {
  const [tahun, bulan, hari] = tanggal.split("-").map(Number);
  const target = new Date(Date.UTC(tahun, bulan - 1 + months, 1));
  const terakhir = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(hari, terakhir));
  return target.toISOString().slice(0, 10);
}
