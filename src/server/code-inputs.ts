import { z } from "zod";

/*
 * The email and code fields of the email Server Actions (Masuk dengan email,
 * Kirim lewat email, Verifikasi Email). Only the shape is checked here; the
 * identity module normalises the email and checks the code.
 */

/** An email as typed: trimmed, at most 254 characters. */
export const emailInput = z.string().trim().min(3).max(254);

/** A Kode Masuk or Verifikasi Email code: 6 digits. */
export const codeInput = z.string().trim().regex(/^\d{6}$/);
