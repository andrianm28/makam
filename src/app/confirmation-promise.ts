import type { JamOperasionalBelumDiisi, WorkingTimeResult } from "@/domain/lokasi";
import { addWibDays, formatWibHariTanggal, wibDate, wibTime } from "@/lib/time/jakarta";

export type ConfirmationPromise = { ok: true; text: string } | JamOperasionalBelumDiisi;

/**
 * The pre-submission promise on the order card, in WIB, for the calculator's
 * confirmation deadline: "dikonfirmasi paling lambat pukul 08:00" (today),
 * "… besok pukul 08:00", or "… Senin, 5 Oktober pukul 10:00". No promise is
 * made when the Lokasi's Jam Operasional is belum diisi: the caller shows why.
 */
export function confirmationPromise(due: WorkingTimeResult, now: Date): ConfirmationPromise {
  if (!due.ok) return due;
  const time = `pukul ${wibTime(due.at)}`;
  if (wibDate(due.at) === wibDate(now)) return { ok: true, text: `dikonfirmasi paling lambat ${time}` };
  if (wibDate(due.at) === wibDate(addWibDays(now, 1))) return { ok: true, text: `dikonfirmasi paling lambat besok ${time}` };
  return { ok: true, text: `dikonfirmasi paling lambat ${formatWibHariTanggal(due.at)} ${time}` };
}
