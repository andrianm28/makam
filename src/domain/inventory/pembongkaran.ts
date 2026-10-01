/**
 * Recording a Pembongkaran (spec, Inventory > Pembongkaran; story 129): the
 * remains were removed from a Petak Makam offline, and the Admin Lokasi records
 * it. Only an ended (Berakhir) Hak Pakai's grave can be demolished — a
 * Dibatalkan one never held the plot and an Aktif or Kedaluwarsa one still
 * does — and only once: a plot is empty from that moment, so it may be sold or
 * cleared again.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { InventoryDeps } from "./deps";
import { inventoryHakPakai } from "./schema";

export const pembongkaranSchema = z.object({
  hakPakaiId: z.uuid(),
  alasan: z.string().trim().max(300).optional(),
});
export type PembongkaranInput = z.infer<typeof pembongkaranSchema>;

export type PembongkaranResult =
  | { ok: true; hakPakaiId: string }
  | WriteRefusal
  | { ok: false; reason: "input_tidak_valid" | "hak_pakai_tidak_ditemukan" | "belum_berakhir" | "sudah_dibongkar" };

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
  if (hakPakai.pembongkaranAt) return { ok: false, reason: "sudah_dibongkar" };

  const alasan = parsed.data.alasan ?? null;
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    await tx
      .update(inventoryHakPakai)
      .set({ pembongkaranAt: deps.clock.now(), pembongkaranReason: alasan })
      .where(eq(inventoryHakPakai.id, hakPakai.id));
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "hak_pakai.pembongkaran",
      entity: { kind: "hak_pakai", id: hakPakai.id },
      lokasiId,
      before: { pembongkaranAt: null },
      after: { pembongkaranAt: deps.clock.now().toISOString() },
      reason: alasan,
    });
    return { ok: true as const, hakPakaiId: hakPakai.id };
  });
}
