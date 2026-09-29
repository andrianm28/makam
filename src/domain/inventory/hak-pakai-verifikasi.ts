/**
 * **The exit of the Perlu Verifikasi gate** (spec, Inventory > Hak Pakai: "Imported
 * Hak Pakai without contact or end date are flagged Perlu Verifikasi … the Admin
 * Lokasi must complete it at the latest at the first Perpanjangan or Layanan on that
 * Hak Pakai"). Ticket 50 put the gate on a Layanan order — a flagged Hak Pakai may
 * be ordered for, but its job is not scheduled until the Admin Lokasi has completed
 * it — and a gate with no exit is a state a plot can never leave. This is the exit.
 *
 * The rule is the narrowest the spec states: **that Lokasi Mitra's own Admin Lokasi**
 * completes it, and nothing about a status is required beyond the flag itself being
 * set. Admin Platform is refused, for the same reason it never confirms a Saat Duka
 * order (story 117): the Operator chases a Lokasi by phone, and the record of what
 * stands at a grave is the Lokasi's own.
 *
 * What "completed" means in data — the Pemegang Hak contact and the end date that
 * ticket 41's AC puts inside the Perpanjangan review — is **not** decided here. This
 * clears the flag and audits who cleared it; ticket 41 owns the form that fills the
 * missing facts, and a caller that has them writes them through that flow. What is
 * *not* left to a later ticket is the ability to open the gate at all.
 */
import { and, eq } from "drizzle-orm";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { InventoryDeps } from "./deps";
import { hakPakaiOfUnit } from "./reads";
import { inventoryHakPakai } from "./schema";

/** The Hak Pakai to complete: by its own id, or as the current one of a Petak Makam. */
export type HakPakaiTarget = { hakPakaiId: string } | { petakId: string };

export type SelesaikanVerifikasiResult =
  | { ok: true }
  | WriteRefusal
  /** No Hak Pakai of that id at that Lokasi Mitra. */
  | { ok: false; reason: "tidak_ditemukan" }
  /** The flag was already off, so there is nothing left to complete. */
  | { ok: false; reason: "tidak_perlu_verifikasi" };

/**
 * The Admin Lokasi of that Lokasi Mitra completes one Hak Pakai flagged Perlu
 * Verifikasi, taking the flag off in its own transaction with an Entri Audit on the
 * Lokasi. Refused for another Lokasi's Admin Lokasi, for an Admin Platform, and for
 * a Hak Pakai that is not there or was never flagged — so a second call says so
 * rather than writing a second entry that claims work nobody did.
 */
export async function selesaikanVerifikasiHakPakai(
  deps: InventoryDeps,
  by: Actor,
  lokasiId: string,
  target: HakPakaiTarget,
): Promise<SelesaikanVerifikasiResult> {
  const refusal = writeRefusal(by, "hak_pakai.selesaikan_verifikasi", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  // A screen that knows only the grave names the Petak; which Hak Pakai that is now is this module's to say.
  const hakPakaiId = "hakPakaiId" in target ? target.hakPakaiId : (await hakPakaiOfUnit(deps, { petakId: target.petakId }))?.id;
  if (!hakPakaiId) return { ok: false, reason: "tidak_ditemukan" };

  const [hakPakai] = await deps.db
    .select({ id: inventoryHakPakai.id, perluVerifikasi: inventoryHakPakai.perluVerifikasi })
    .from(inventoryHakPakai)
    .where(and(eq(inventoryHakPakai.id, hakPakaiId), eq(inventoryHakPakai.lokasiId, lokasiId)));
  if (!hakPakai) return { ok: false, reason: "tidak_ditemukan" };
  if (!hakPakai.perluVerifikasi) return { ok: false, reason: "tidak_perlu_verifikasi" };

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    // Matched on the flag as well as the id, so a completion that raced another one
    // writes nothing rather than recording a second Entri Audit for the same flag.
    const ditimpa = await tx
      .update(inventoryHakPakai)
      .set({ perluVerifikasi: false })
      .where(and(eq(inventoryHakPakai.id, hakPakaiId), eq(inventoryHakPakai.lokasiId, lokasiId), eq(inventoryHakPakai.perluVerifikasi, true)))
      .returning({ id: inventoryHakPakai.id });
    if (ditimpa.length === 0) return { ok: false as const, reason: "tidak_perlu_verifikasi" as const };
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "hak_pakai.selesaikan_verifikasi",
      entity: { kind: "hak_pakai", id: hakPakaiId },
      lokasiId,
      before: { perluVerifikasi: true },
      after: { perluVerifikasi: false },
      reason: null,
    });
    return { ok: true as const };
  });
}
