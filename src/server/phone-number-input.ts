import { z } from "zod";

/**
 * The phone number field of any Server Action form (Akun Saya, Undangan Staf,
 * Pengaturan Operator, and the Data & kirim step of the booking wizards). Only
 * its shape is checked here; the identity module normalises the number and
 * decides whether it is valid (+62 only in v1). It is a contact, never a login.
 */

/** The most characters a phone number may be typed in: +62 and the national form both fit. */
export const PHONE_NUMBER_MAX = 32;

export const phoneNumberInput = z.string().trim().min(1).max(PHONE_NUMBER_MAX);
