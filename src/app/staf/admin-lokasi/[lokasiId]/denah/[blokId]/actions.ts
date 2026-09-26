"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { lokasiMitraResource, type Actor } from "@/domain/identity";
import { denahEdges, inventoryPetakKinds, kavlingClearingSchema, petakClearingSchema } from "@/domain/inventory";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import { denahRefusalMessage } from "../denah-messages";

export type DenahActionResult<T = undefined> = { ok: true; data: T } | { ok: false; message: string };

const scopeSchema = z.object({ lokasiId: z.uuid(), blokId: z.uuid() });

/** Every action here: `guarded()` on `denah.ubah` for the named Lokasi, then one Inventory write, then a refresh. */
async function denahWrite<S extends z.ZodType<{ lokasiId: string; blokId: string }>, R extends { ok: boolean }>(options: {
  schema: S;
  input: unknown;
  run: (actor: Actor, data: z.infer<S>) => Promise<R>;
}): Promise<DenahActionResult<Exclude<R, { ok: false }>>> {
  const result = await guarded({
    action: "denah.ubah",
    resource: () => lokasiMitraResource((options.input as { lokasiId: string }).lokasiId),
    schema: options.schema,
    input: options.input,
    run: options.run,
  });
  if (!result.ok) return { ok: false, message: denahRefusalMessage(result.error) };
  const written = result.value;
  if (!written.ok) {
    const refusal = written as { ok: false; reason: string } & Record<string, unknown>;
    const extra: Record<string, unknown> = { ...refusal };
    delete extra.ok;
    delete extra.reason;
    return { ok: false, message: denahRefusalMessage(refusal.reason, extra) };
  }
  const { lokasiId, blokId } = options.input as { lokasiId: string; blokId: string };
  revalidatePath(`/staf/admin-lokasi/${lokasiId}/denah/${blokId}`);
  return { ok: true, data: written as Exclude<R, { ok: false }> };
}

const setCellKindSchema = scopeSchema.extend({
  cellIds: z.array(z.uuid()).min(1),
  kind: z.enum(inventoryPetakKinds),
  jenisMakamId: z.uuid().optional(),
});

export async function setCellKindAction(input: z.input<typeof setCellKindSchema>) {
  return denahWrite({
    schema: setCellKindSchema,
    input,
    run: (actor, data) =>
      serverRuntime().inventory.setCellKind(actor, data.lokasiId, data.blokId, {
        cellIds: data.cellIds,
        kind: data.kind,
        jenisMakamId: data.jenisMakamId,
      }),
  });
}

const setJenisMakamSchema = scopeSchema.extend({ cellIds: z.array(z.uuid()).min(1), jenisMakamId: z.uuid() });

export async function setJenisMakamAction(input: z.input<typeof setJenisMakamSchema>) {
  return denahWrite({
    schema: setJenisMakamSchema,
    input,
    run: (actor, data) => serverRuntime().inventory.setJenisMakam(actor, data.lokasiId, data.blokId, { cellIds: data.cellIds, jenisMakamId: data.jenisMakamId }),
  });
}

const renumberSchema = scopeSchema.extend({
  cellIds: z.array(z.uuid()).min(1),
  pattern: z.string().trim().min(1).max(60),
  startAt: z.coerce.number().int().min(1).max(100_000).optional(),
});

export async function renumberCellsAction(input: z.input<typeof renumberSchema>) {
  return denahWrite({
    schema: renumberSchema,
    input,
    run: (actor, data) => serverRuntime().inventory.renumberCells(actor, data.lokasiId, data.blokId, { cellIds: data.cellIds, pattern: data.pattern, startAt: data.startAt }),
  });
}

const setSingleNumberSchema = scopeSchema.extend({ cellId: z.uuid(), nomorMakam: z.string().trim().min(1).max(60) });

export async function setSingleNumberAction(input: z.input<typeof setSingleNumberSchema>) {
  return denahWrite({
    schema: setSingleNumberSchema,
    input,
    run: (actor, data) => serverRuntime().inventory.setSingleNumber(actor, data.lokasiId, data.blokId, data.cellId, data.nomorMakam),
  });
}

const createKavlingSchema = scopeSchema.extend({
  cellIds: z.array(z.uuid()).min(2),
  jenisMakamId: z.uuid(),
  nomorKavling: z.string().trim().max(60).optional(),
});

export async function createKavlingAction(input: z.input<typeof createKavlingSchema>) {
  return denahWrite({
    schema: createKavlingSchema,
    input,
    run: (actor, data) =>
      serverRuntime().inventory.createKavling(actor, data.lokasiId, data.blokId, {
        cellIds: data.cellIds,
        jenisMakamId: data.jenisMakamId,
        nomorKavling: data.nomorKavling || undefined,
      }),
  });
}

const splitKavlingSchema = z.object({ lokasiId: z.uuid(), blokId: z.uuid(), kavlingId: z.uuid() });

export async function splitKavlingAction(input: z.input<typeof splitKavlingSchema>) {
  return denahWrite({
    schema: splitKavlingSchema,
    input,
    run: (actor, data) => serverRuntime().inventory.splitKavling(actor, data.lokasiId, data.kavlingId),
  });
}

const addEdgeSchema = scopeSchema.extend({ edge: z.enum(denahEdges) });

export async function addEdgeAction(input: z.input<typeof addEdgeSchema>) {
  return denahWrite({
    schema: addEdgeSchema,
    input,
    run: (actor, data) => serverRuntime().inventory.addEdge(actor, data.lokasiId, data.blokId, data.edge),
  });
}

const removeRowsOrColsSchema = scopeSchema.extend({ axis: z.enum(["baris", "kolom"]), indices: z.array(z.number().int().min(0)).min(1) });

export async function removeRowsOrColsAction(input: z.input<typeof removeRowsOrColsSchema>) {
  return denahWrite({
    schema: removeRowsOrColsSchema,
    input,
    run: (actor, data) => serverRuntime().inventory.removeRowsOrCols(actor, data.lokasiId, data.blokId, { axis: data.axis, indices: data.indices }),
  });
}

const clearPetakSchema = scopeSchema.extend({ petakId: z.uuid(), input: petakClearingSchema });

/** Clears one Petak Makam: Tersedia, Tidak Tersedia (with a reason) or occupied (spec, story 128). */
export async function clearPetakAction(input: z.input<typeof clearPetakSchema>) {
  return denahWrite({
    schema: clearPetakSchema,
    input,
    run: (actor, data) => serverRuntime().inventory.clearPetak(actor, data.lokasiId, data.petakId, data.input),
  });
}

const clearKavlingSchema = z.object({ lokasiId: z.uuid(), blokId: z.uuid(), kavlingId: z.uuid(), input: kavlingClearingSchema });

/** Clears a whole Kavling Keluarga the same way. */
export async function clearKavlingAction(input: z.input<typeof clearKavlingSchema>) {
  return denahWrite({
    schema: clearKavlingSchema,
    input,
    run: (actor, data) => serverRuntime().inventory.clearKavling(actor, data.lokasiId, data.kavlingId, data.input),
  });
}

/** The site-plan photo upload: needs FormData for the file itself. */
export async function uploadBlokPhotoAction(formData: FormData) {
  const lokasiId = formData.get("lokasiId");
  const blokId = formData.get("blokId");
  const file = formData.get("file");
  return denahWrite({
    schema: scopeSchema.extend({ file: z.instanceof(File).refine((f) => f.size > 0 && f.size <= 10 * 1024 * 1024) }),
    input: { lokasiId, blokId, file },
    run: async (actor, data) =>
      serverRuntime().inventory.uploadBlokPhoto(actor, data.lokasiId, data.blokId, {
        body: new Uint8Array(await data.file.arrayBuffer()),
        contentType: data.file.type,
      }),
  });
}
