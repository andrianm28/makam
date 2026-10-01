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
  targetDate: z.string().trim().min(1).max(10),
  teks: z.string().max(2000).nullish(),
});
export const itemCheckoutListSchema = z.array(itemCheckoutSchema).max(20);
export type ItemCheckout = z.infer<typeof itemCheckoutSchema>;
