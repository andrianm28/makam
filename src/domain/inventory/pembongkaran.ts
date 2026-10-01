/**
 * Recording a Pembongkaran (spec, Inventory > Pembongkaran; story 129): the
 * remains were removed from a Petak Makam offline, and the Admin Lokasi records
 * it. Only an ended (Berakhir) Hak Pakai's grave can be demolished — a
 * Dibatalkan one never held the plot and an Aktif or Kedaluwarsa one still
 * does — and only once per Petak: that plot is empty from that moment, so it may
 * be sold or cleared again, while the other Petak of a Kavling Keluarga keep
 * holding their graves.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { InventoryDeps } from "./deps";
import { inventoryHakPakai, inventoryPetak } from "./schema";

export const pembongkaranSchema = z.object({
  hakPakaiId: z.uuid(),
  petakId: z.uuid(),
  alasan: z.string().trim().max(300).optional(),
});
export type PembongkaranInput = z.infer<typeof pembongkaranSchema>;

export type PembongkaranResult =
  | { ok: true; hakPakaiId: string; petakId: string }
  | WriteRefusal
  | {
      ok: false;
      reason: "input_tidak_valid" | "hak_pakai_tidak_ditemukan" | "petak_tidak_ditemukan" | "petak_bukan_dari_hak_pakai" | "belum_berakhir" | "sudah_dibongkar";
    };

export async function catatPembongkaran(deps: InventoryDeps, by: Actor, lokasiId: string, rawInput: unknown): Promise<PembongkaranResult> {
  const refusal = writeRefusal(by, "hak_pakai.berakhir", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  const parsed = pembongkaranSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };

  const [hakPakai] = await deps.db
    .select()
    .from(inventoryHakPakai)
    .where(and(eq(inventoryHakPakai.id, parsed.data.hakPakaiId), eq(inventoryHakPakai.lokasiId, lokasiId)));
  if (!hakPakai) return { ok: false, reason: "hak_pakai_tidak_ditemukan" };
  if (hakPakai.status !== "berakhir") return { ok: false, reason: "belum_berakhir" };

  const [petak] = await deps.db
    .select()
    .from(inventoryPetak)
    .where(and(eq(inventoryPetak.id, parsed.data.petakId), eq(inventoryPetak.lokasiId, lokasiId)));
  if (!petak) return { ok: false, reason: "petak_tidak_ditemukan" };
  // The Petak must be the one this Hak Pakai covers: the Hak Pakai's own for a
  // single plot, a member for a Kavling Keluarga.
  const milikHakPakai = hakPakai.petakId ? hakPakai.petakId === petak.id : petak.kavlingId !== null && petak.kavlingId === hakPakai.kavlingId;
  if (!milikHakPakai) return { ok: false, reason: "petak_bukan_dari_hak_pakai" };
  if (petak.pembongkaranAt) return { ok: false, reason: "sudah_dibongkar" };

  const alasan = parsed.data.alasan ?? null;
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const now = deps.clock.now();
    await tx.update(inventoryPetak).set({ pembongkaranAt: now, pembongkaranReason: alasan }).where(eq(inventoryPetak.id, petak.id));
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "hak_pakai.pembongkaran",
      entity: { kind: "hak_pakai", id: hakPakai.id },
      lokasiId,
      before: { petakId: petak.id, pembongkaranAt: null },
      after: { petakId: petak.id, pembongkaranAt: now.toISOString() },
      reason: alasan,
    });
    return { ok: true as const, hakPakaiId: hakPakai.id, petakId: petak.id };
  });
}
