import { z } from "zod";

/**
 * An amount typed in a staff form, as whole rupiah: "Rp 175.000", "175.000"
 * or "175000" all read 175000 (dots and spaces group thousands). A comma
 * (sen) or anything else is refused: money is never a fraction.
 */
export const rupiahInput = z
  .string()
  .trim()
  .transform((typed) => typed.replace(/^rp\.?\s*/i, "").replace(/[.\s]/g, ""))
  .pipe(z.string().regex(/^\d{1,15}$/))
  .transform(Number);

/** The same, where an empty field means "none" (null). */
export const optionalRupiahInput = z.union([z.literal("").transform(() => null), rupiahInput]);
