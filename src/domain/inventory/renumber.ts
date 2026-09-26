/**
 * Renumbering a Petak Makam (spec, Inventory > Denah; story 169): Admin
 * Platform only, audited with the old and new number, the old number kept as
 * a hidden alias so a lookup by it still finds the Petak.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { InventoryDeps } from "./deps";
import { foldKey } from "./ids";
import { lockLokasiInventory } from "./locks";
import { conflictingNomorMakam } from "./uniqueness";
import { inventoryPetak, inventoryPetakAlias } from "./schema";

export type RenumberPetakResult =
  | { ok: true; nomorMakam: string }
  | WriteRefusal
  | { ok: false; reason: "petak_tidak_ditemukan" }
  | { ok: false; reason: "nomor_wajib" }
  | { ok: false; reason: "nomor_sudah_dipakai"; conflicts: string[] };

const nomorSchema = z.string().trim().min(1).max(60);

/** Admin Platform renumbers a Petak Makam. Its earlier Nomor Makam is kept as a hidden alias: `findPetakByNomor` still resolves it, but it is never shown and only ever appears in the Audit Log. */
export async function renumberPetak(deps: InventoryDeps, by: Actor, lokasiId: string, petakId: string, rawNomorMakam: string): Promise<RenumberPetakResult> {
  const refusal = writeRefusal(by, "petak.nomor_ulang", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  const parsed = nomorSchema.safeParse(rawNomorMakam);
  if (!parsed.success) return { ok: false, reason: "nomor_wajib" };
  const nomorMakam = parsed.data.replace(/\s+/g, " ");

  const [petak] = await deps.db
    .select()
    .from(inventoryPetak)
    .where(eq(inventoryPetak.id, petakId));
  if (!petak || petak.lokasiId !== lokasiId || petak.kind !== "petak") return { ok: false, reason: "petak_tidak_ditemukan" };
  if (foldKey(nomorMakam) === petak.nomorMakamKey) return { ok: true, nomorMakam: petak.nomorMakam! };

  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    await lockLokasiInventory(tx, lokasiId);
    const conflicts = await conflictingNomorMakam(tx, lokasiId, [nomorMakam], [petakId]);
    if (conflicts.length) return { ok: false as const, reason: "nomor_sudah_dipakai" as const, conflicts };

    await tx.insert(inventoryPetakAlias).values({
      lokasiId,
      petakId,
      nomorMakam: petak.nomorMakam!,
      nomorMakamKey: petak.nomorMakamKey!,
      createdAt: now,
    });
    await tx.update(inventoryPetak).set({ nomorMakam, nomorMakamKey: foldKey(nomorMakam) }).where(eq(inventoryPetak.id, petakId));
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "petak.nomor_ulang",
      entity: { kind: "denah_petak", id: petakId },
      lokasiId,
      before: { nomorMakam: petak.nomorMakam },
      after: { nomorMakam },
      reason: null,
    });
    return { ok: true as const, nomorMakam };
  });
}
