/**
 * Ending a Hak Pakai by hand (spec, Inventory > Hak Pakai; story 129): from the
 * Petak / Hak Pakai page the Admin Lokasi ends a right as Berakhir, with a
 * reason. Ending is final; a resale creates a new Hak Pakai, never reopens this
 * one. An Aktif right may be ended, and so may a Kedaluwarsa one still in its
 * Masa Tenggang (story 130: the Admin Lokasi decides whether to end it).
 *
 * Like every staff write the rule lives here, not in the action: the caller
 * validates nothing and records nothing itself.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { InventoryDeps } from "./deps";
import { inventoryHakPakai } from "./schema";

export const berakhirHakPakaiSchema = z.object({
  hakPakaiId: z.uuid(),
  alasan: z.string().trim().min(1).max(300),
});
export type BerakhirHakPakaiInput = z.infer<typeof berakhirHakPakaiSchema>;

export type BerakhirHakPakaiResult =
  | { ok: true; hakPakaiId: string }
  | WriteRefusal
  | { ok: false; reason: "input_tidak_valid" | "hak_pakai_tidak_ditemukan" | "hak_pakai_sudah_berakhir" };

export async function berakhirkanHakPakai(
  deps: InventoryDeps,
  by: Actor,
  lokasiId: string,
  rawInput: unknown,
): Promise<BerakhirHakPakaiResult> {
  const refusal = writeRefusal(by, "hak_pakai.berakhir", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  const parsed = berakhirHakPakaiSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };

  const [hakPakai] = await deps.db
    .select()
    .from(inventoryHakPakai)
    .where(and(eq(inventoryHakPakai.id, parsed.data.hakPakaiId), eq(inventoryHakPakai.lokasiId, lokasiId)));
  if (!hakPakai) return { ok: false, reason: "hak_pakai_tidak_ditemukan" };
  if (hakPakai.status === "berakhir" || hakPakai.status === "dibatalkan") return { ok: false, reason: "hak_pakai_sudah_berakhir" };

  const alasan = parsed.data.alasan;
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    await tx
      .update(inventoryHakPakai)
      .set({ status: "berakhir", endReason: alasan })
      .where(eq(inventoryHakPakai.id, hakPakai.id));
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "hak_pakai.berakhir",
      entity: { kind: "hak_pakai", id: hakPakai.id },
      lokasiId,
      before: { status: hakPakai.status },
      after: { status: "berakhir" },
      reason: alasan,
    });
    return { ok: true as const, hakPakaiId: hakPakai.id };
  });
}
