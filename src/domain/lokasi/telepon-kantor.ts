import { normalisePhoneNumber } from "@/domain/identity";

/**
 * "Nomor telepon kantor atau HP" (owner decision 2026-10-02): the pengelola's
 * contact shown to families, never messaged. An Indonesian mobile is stored
 * as +62812…; an office landline as "+62 <area code> <number>", e.g.
 * "+62 21 12345678". Other input is refused.
 */
export type TeleponKantorResult = { ok: true; telepon: string } | { ok: false };

/** Two-digit area codes (Jakarta, Bandung/Cirebon-Priangan, Semarang, Surabaya); all others have three. */
const TWO_DIGIT_AREA = new Set(["21", "22", "24", "31"]);
const SEPARATORS = /[\s\-.()]/g;

export function parseTeleponKantorAtauHp(typed: string): TeleponKantorResult {
  const compact = typed.trim().replace(SEPARATORS, "");
  if (!/^\+?\d+$/.test(compact)) return { ok: false };

  const mobile = normalisePhoneNumber(typed);
  if (mobile.ok) return { ok: true, telepon: mobile.phoneNumber };

  const national = compact.startsWith("+62") ? compact.slice(3) : compact.startsWith("+") ? null : compact.startsWith("62") ? compact.slice(2) : compact.startsWith("0") ? compact.slice(1) : null;
  if (national === null || !/^[2-79]/.test(national)) return { ok: false };

  const areaLength = TWO_DIGIT_AREA.has(national.slice(0, 2)) ? 2 : 3;
  const subscriber = national.slice(areaLength);
  if (!/^\d{5,8}$/.test(subscriber)) return { ok: false };
  return { ok: true, telepon: `+62 ${national.slice(0, areaLength)} ${subscriber}` };
}
