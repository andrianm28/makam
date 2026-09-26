import { formatWibHariTanggal, wibDate, wibTime, addWibDays } from "@/lib/time/jakarta";

/**
 * The pre-submission promise on the order card, in WIB: "dikonfirmasi paling
 * lambat pukul 08:00" (today), "… besok pukul 08:00", or "… Senin, 5 Oktober
 * pukul 10:00".
 */
export function confirmationPromise(due: Date, now: Date): string {
  const time = `pukul ${wibTime(due)}`;
  if (wibDate(due) === wibDate(now)) return `dikonfirmasi paling lambat ${time}`;
  if (wibDate(due) === wibDate(addWibDays(now, 1))) return `dikonfirmasi paling lambat besok ${time}`;
  return `dikonfirmasi paling lambat ${formatWibHariTanggal(due)} ${time}`;
}
