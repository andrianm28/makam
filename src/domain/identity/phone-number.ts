/**
 * A phone number is a contact on an Akun, an Undangan Staf or an order (ADR
 * 0004: never verified, never a key). Every number is stored in one canonical
 * E.164 form: `0812…`, `62812…`, `+62812…` and `812…` are all `+62812…`.
 *
 * v1 takes only Indonesian (+62) mobile numbers (decision 2026-09-25): a
 * well-formed number from another country is refused as `nomor_bukan_indonesia`.
 */
export type PhoneNumberResult =
  | { ok: true; phoneNumber: string }
  | { ok: false; reason: "nomor_tidak_valid" | "nomor_bukan_indonesia" };

/** Why a typed number is refused: part of every result that takes a phone number. */
export type PhoneNumberRejection = Extract<PhoneNumberResult, { ok: false }>;

/** Separators people type inside a number. */
const SEPARATORS = /[\s\-.()]/g;
/** An Indonesian mobile number after the country code: 8 then 8 to 11 digits. */
const INDONESIAN_MOBILE = /^8\d{8,11}$/;
/** A number from any other country, written with its + prefix: E.164 allows up to 15 digits. */
const INTERNATIONAL = /^\+[1-9]\d{7,14}$/;

const invalid = { ok: false, reason: "nomor_tidak_valid" } as const;
const notIndonesian = { ok: false, reason: "nomor_bukan_indonesia" } as const;

export function normalisePhoneNumber(typed: string): PhoneNumberResult {
  const compact = typed.replace(SEPARATORS, "");

  const national = indonesianNationalPart(compact);
  if (national !== null) {
    return INDONESIAN_MOBILE.test(national) ? { ok: true, phoneNumber: `+62${national}` } : invalid;
  }
  return INTERNATIONAL.test(compact) ? notIndonesian : invalid;
}

/** The digits after +62 / 62 / 0 for an Indonesian number, or null for another country. */
function indonesianNationalPart(compact: string): string | null {
  if (compact.startsWith("+62")) return compact.slice(3);
  if (compact.startsWith("+")) return null;
  if (compact.startsWith("62")) return compact.slice(2);
  if (compact.startsWith("0")) return compact.slice(1);
  return compact;
}
