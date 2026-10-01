import { z } from "zod";

/**
 * The input schemas a checkout's Client Component may take from this module's own
 * file, never from the barrel (`@/domain/layanan`): a bundler keeps a module whole,
 * and the barrel reaches the database. This file is nothing but `zod`.
 */

/** Which checkout is adding the Layanan: it decides which catalog slice is offered. */
export type CheckoutJenis = "saat_duka" | "terencana" | "perpanjangan";

/** One item a checkout picked: the variant, its target date and the text the Layanan asks for. */
export const itemCheckoutSchema = z.object({
  layananVariantId: z.uuid(),
  /** The WIB calendar date the work should happen on, "YYYY-MM-DD". */
  targetDate: z.iso.date("Tanggal target harus berformat tahun-bulan-hari."),
  /** The Layanan's own free-text field (a nisan inscription), or null when it asks for none. */
  teks: z.string().trim().max(500).nullable().default(null),
});
export const itemCheckoutListSchema = z.array(itemCheckoutSchema).max(20);
export type ItemCheckout = z.infer<typeof itemCheckoutSchema>;
