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

const hapusBlokSchema = z.object({ lokasiId: z.uuid(), blokId: z.uuid(), alasan: z.string().trim().min(1).max(300) });

export type HapusBlokActionResult = { ok: true; berikutnya: string } | { ok: false; message: string };

/**
 * An Admin Lokasi removes a Blok that is empty of history. `berikutnya` is where
 * the editor goes next: the first remaining Blok, or the Denah's empty state.
 */
export async function hapusBlokAction(input: z.input<typeof hapusBlokSchema>): Promise<HapusBlokActionResult> {
  const result = await guarded({
    action: "denah.ubah",
    resource: () => lokasiMitraResource(input.lokasiId),
    schema: hapusBlokSchema,
    input,
    run: async (actor, data) => {
      const inventory = serverRuntime().inventory;
      const hasil = await inventory.hapusBlok(actor, data.lokasiId, data.blokId, data.alasan);
      if (!hasil.ok) return hasil;
      const sisa = await inventory.asStaff(actor).bloks(data.lokasiId);
      return { ok: true as const, sisaBlokId: sisa[0]?.id ?? null };
    },
  });
  if (!result.ok) return { ok: false, message: denahRefusalMessage(result.error) };
  const hapus = result.value;
  if (!hapus.ok) return { ok: false, message: denahRefusalMessage(hapus.reason) };
  revalidatePath(`/staf/admin-lokasi/${input.lokasiId}/denah`);
  const dasar = `/staf/admin-lokasi/${input.lokasiId}/denah`;
  return { ok: true, berikutnya: hapus.sisaBlokId ? `${dasar}/${hapus.sisaBlokId}` : dasar };
}
