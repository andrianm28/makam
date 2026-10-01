/**
 * The message thread's boundary, for a Client Component's import graph: the Zod
 * schema and the plain constants of one thread message, taken from this module's
 * **own** file rather than from its barrel (a bundler keeps a module whole, and the
 * barrel reaches the database). It holds nothing but `zod` and numbers, so a client
 * form may import it.
 */
import { z } from "zod";

/** The longest one message may be. */
export const PESAN_MAKS_PANJANG = 2000;
/** How many photos one message may carry. */
export const PESAN_LAMPIRAN_MAX = 3;
/** The largest one photo may be, 8 MB. */
export const PESAN_FOTO_MAX_BYTES = 8 * 1024 * 1024;
/** The image types a thread photo may be. */
export const PESAN_LAMPIRAN_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** How long a photo's signed URL lives, in seconds. */
export const PESAN_URL_SECONDS = 300;

/** One message a Pemesan or a staff member sends into a job's thread. */
export const kirimPesanSchema = z.object({
  pekerjaanId: z.uuid(),
  teks: z.string().trim().min(1, "Tulis pesan Anda.").max(PESAN_MAKS_PANJANG, "Pesan terlalu panjang."),
  /** The photos the browser captured, in the order they should read. */
  lampiran: z
    .array(z.object({ body: z.instanceof(Uint8Array), contentType: z.string().trim().min(1).max(120) }))
    .max(PESAN_LAMPIRAN_MAX)
    .optional(),
});
export type KirimPesanInput = z.infer<typeof kirimPesanSchema>;
