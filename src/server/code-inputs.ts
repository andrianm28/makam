import { z } from "zod";

/*
 * The email and code fields of the email Server Actions (the Kode Masuk on
 * Masuk and at Kirim, Verifikasi Email). Only the shape is checked here; the
 * identity module normalises the email and checks the code.
 */

/** The most characters an email may be typed in. */
export const EMAIL_MAX = 254;

/** An email as typed: trimmed, at most `EMAIL_MAX` characters. */
export const emailInput = z.string().trim().min(3).max(EMAIL_MAX);

/** A Kode Masuk or Verifikasi Email code: 6 digits. */
export const codeInput = z.string().trim().regex(/^\d{6}$/);
