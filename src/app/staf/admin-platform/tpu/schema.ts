import { z } from "zod";
import { TPU_NAME_MAX } from "@/domain/lokasi";

/**
 * The TPU shapes the Server Actions check and the forms hold, in one place: a
 * "use server" file may only export async functions, so the schemas live here
 * (the same split as `pengaturan-operator/schema.ts`).
 *
 * These are the shapes a *form* types, not the module's: the pin is two text
 * fields (a decimal comma is as good as a dot) that are both empty for a TPU
 * without one, and the new-plot flag is "ya" or "tidak". The Lokasi module
 * re-checks the profile and the flag itself, so these only have to say what the
 * form said; its own refusals name the field that caused them.
 */

/** How long each value may be typed, so a field's length is written once. */
export const tpuLimits = {
  name: TPU_NAME_MAX,
  address: 300,
  city: 120,
  dataSource: 200,
} as const;

/** One coordinate as a form types it: a number, or nothing. */
const koordinat = z
  .string()
  .trim()
  .refine((value) => value === "" || Number.isFinite(Number(value.replace(",", "."))), { message: "pin" });

export const tpuProfileFormSchema = z.object({
  name: z.string().trim().min(1).max(tpuLimits.name),
  address: z.string().trim().min(1).max(tpuLimits.address),
  city: z.string().trim().min(1).max(tpuLimits.city),
  dataSource: z.string().trim().min(1).max(tpuLimits.dataSource),
  pinLat: koordinat,
  pinLng: koordinat,
});
export type TpuProfileForm = z.infer<typeof tpuProfileFormSchema>;

/** The new-plot flag as a form types it: "ya" or "tidak", kept as typed (the action turns it into a boolean). */
export const tpuFlagFormSchema = z.enum(["ya", "tidak"]);
export type TpuFlagForm = z.infer<typeof tpuFlagFormSchema>;

/** A whole TPU, added: its profile and the status found today. */
export const newTpuFormSchema = tpuProfileFormSchema.extend({ menerimaMakamBaru: tpuFlagFormSchema });

/** One TPU's profile, edited: the same fields plus which TPU this is. */
export const tpuProfileEditSchema = tpuProfileFormSchema.extend({ tpuId: z.uuid() });

/** The new-plot status on its own. `nama` only names the TPU in the result message. */
export const tpuStatusEditSchema = z.object({
  tpuId: z.uuid(),
  menerimaMakamBaru: tpuFlagFormSchema,
  nama: z.string().trim().max(tpuLimits.name),
});

/** Whether a TPU takes new plots, as a form's own choice spells it. */
export const menerimaMakamBaruOf = (choice: TpuFlagForm): boolean => choice === "ya";
