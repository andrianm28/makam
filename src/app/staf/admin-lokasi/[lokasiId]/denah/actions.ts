"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { lokasiMitraResource } from "@/domain/identity";
import { MAX_BLOK_DIMENSION } from "@/domain/inventory";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import { denahRefusalMessage } from "./denah-messages";

export type DenahActionResult = { ok: true; blokId: string } | { ok: false; message: string };

const newBlokSchema = z.object({
  lokasiId: z.uuid(),
  name: z.string().trim().min(1).max(60),
  rows: z.coerce.number().int().min(1).max(MAX_BLOK_DIMENSION),
  cols: z.coerce.number().int().min(1).max(MAX_BLOK_DIMENSION),
  numberPattern: z.string().trim().max(60).optional(),
  jenisMakamId: z.uuid(),
});

/** An Admin Lokasi creates a Blok on its own Lokasi's Denah. */
export async function createBlokAction(input: z.input<typeof newBlokSchema>): Promise<DenahActionResult> {
  const result = await guarded({
    action: "denah.ubah",
    resource: () => lokasiMitraResource(input.lokasiId),
    schema: newBlokSchema,
    input,
    run: (actor, data) =>
      serverRuntime().inventory.createBlok(actor, data.lokasiId, {
        name: data.name,
        rows: data.rows,
        cols: data.cols,
        numberPattern: data.numberPattern || undefined,
        jenisMakamId: data.jenisMakamId,
      }),
  });
  if (!result.ok) return { ok: false, message: denahRefusalMessage(result.error) };
  const created = result.value;
  if (!created.ok) return { ok: false, message: denahRefusalMessage(created.reason, "conflicts" in created ? { conflicts: created.conflicts } : undefined) };
  revalidatePath(`/staf/admin-lokasi/${input.lokasiId}/denah`);
  return { ok: true, blokId: created.blok.id };
}
