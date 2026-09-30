import { z } from "zod";

/**
 * The `dari` on a Tolak link: the Nomor Pemesanan of the declined order. Anything
 * that is not shaped like one is the same as no `dari` at all (an ordinary visit),
 * never an error page. This file is nothing but `zod`.
 */
const dariSchema = z.string().trim().regex(/^[A-Za-z0-9-]{1,40}$/);

/** The `dari` of a search param, or the empty string when it is absent or malformed. */
export function dariDari(nilai: string): string {
  const parsed = dariSchema.safeParse(nilai);
  return parsed.success ? parsed.data : "";
}
