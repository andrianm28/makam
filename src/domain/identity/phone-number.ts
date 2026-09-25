/**
 * One WhatsApp number is one account (ADR 0003), so every number is stored and
 * compared in one canonical E.164 form: `0812…`, `62812…`, `+62812…` and
 * `812…` are all `+62812…`.
 */
export type PhoneNumberResult =
  | { ok: true; phoneNumber: string }
  | { ok: false; reason: "nomor_tidak_valid" };

/** Separators people type inside a number. */
const SEPARATORS = /[\s\-.()]/g;
/** An Indonesian mobile number after the country code: 8 then 8 to 11 digits. */
const INDONESIAN_MOBILE = /^8\d{8,11}$/;
/** Any other country, written with its + prefix: E.164 allows up to 15 digits. */
const INTERNATIONAL = /^\+[1-9]\d{7,14}$/;

const invalid = { ok: false, reason: "nomor_tidak_valid" } as const;

export function normalisePhoneNumber(typed: string): PhoneNumberResult {
  const compact = typed.replace(SEPARATORS, "");

  const national = indonesianNationalPart(compact);
  if (national !== null) {
    return INDONESIAN_MOBILE.test(national) ? { ok: true, phoneNumber: `+62${national}` } : invalid;
  }
  return INTERNATIONAL.test(compact) ? { ok: true, phoneNumber: compact } : invalid;
}

/** The digits after +62 / 62 / 0 for an Indonesian number, or null for another country. */
function indonesianNationalPart(compact: string): string | null {
  if (compact.startsWith("+62")) return compact.slice(3);
  if (compact.startsWith("+")) return null;
  if (compact.startsWith("62")) return compact.slice(2);
  if (compact.startsWith("0")) return compact.slice(1);
  return compact;
}
