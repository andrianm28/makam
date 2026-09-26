import type { WorkingTimeResult } from "@/domain/lokasi";
import { addWibDays, formatWibHariTanggal, wibDateOf, wibTime } from "@/lib/time/jakarta";

export type ConfirmationPromise = { ok: true; text: string } | Extract<WorkingTimeResult, { ok: false }>;

/**
 * The pre-submission promise on the order card, in WIB, for the calculator's
 * confirmation deadline: "dikonfirmasi paling lambat pukul 08:00" (today),
 * "… besok pukul 08:00", or "… Senin, 5 Oktober pukul 10:00"; a 24:00 close
 * reads "pukul 24:00" on its own day, never "besok pukul 00:00". No promise is
 * made when the calculator gave none (Jam Operasional belum diisi, or no
 * open weekday): the caller shows why.
 */
export function confirmationPromise(due: WorkingTimeResult, now: Date): ConfirmationPromise {
  if (!due.ok) return due;
  // A deadline is always an end: one at 00:00 is a 24:00 close, so it belongs to the day before.
  const endOfDay = wibTime(due.at) === "00:00";
  const day = endOfDay ? addWibDays(due.at, -1) : due.at;
  const time = `pukul ${endOfDay ? "24:00" : wibTime(due.at)}`;
  if (wibDateOf(day) === wibDateOf(now)) return { ok: true, text: `dikonfirmasi paling lambat ${time}` };
  if (wibDateOf(day) === wibDateOf(addWibDays(now, 1))) return { ok: true, text: `dikonfirmasi paling lambat besok ${time}` };
  return { ok: true, text: `dikonfirmasi paling lambat ${formatWibHariTanggal(day)} ${time}` };
}
