import { z } from "zod";
import { tanggalSchema } from "@/domain/lokasi";

/**
 * The Hari Libur remove shape, shared by the Server Action and the form.
 * (Moved out of `actions.ts` unchanged: a "use server" file may only export
 * async functions, so the schema lives here.) The add shape is the domain's
 * own `hariLiburNasionalSchema`, imported directly by both.
 */
export const hapusHariLiburSchema = z.object({ date: tanggalSchema, reason: z.string().trim().max(500) });

export type HapusHariLiburInput = z.infer<typeof hapusHariLiburSchema>;
