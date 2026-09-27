import { eq } from "drizzle-orm";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { actingRole, isLokasiId, type LokasiDeps, type NotFound } from "./lokasi-mitra";
import { lokasiMitra as lokasiMitraTable } from "./schema";

export type TerencanaSwitchKey = "petak_dibersihkan" | "cek_denah";

export interface TerencanaSwitchGate {
  ready: boolean;
  items: { key: TerencanaSwitchKey; met: boolean }[];
}

/**
 * Whether Pemesanan Terencana can be switched on (spec, Lokasi > Terencana
 * switch; decision 2026-09-26): every Petak Makam cleared (no Perlu
 * Verifikasi Petak left, the Inventory module's own fact) and a completed Cek
 * Denah (this Lokasi's own).
 */
export function terencanaSwitchGate(facts: { hasPetakPerluVerifikasi: boolean; cekDenahDilakukan: boolean }): TerencanaSwitchGate {
  const items: TerencanaSwitchGate["items"] = [
    { key: "petak_dibersihkan", met: !facts.hasPetakPerluVerifikasi },
    { key: "cek_denah", met: facts.cekDenahDilakukan },
  ];
  return { ready: items.every((item) => item.met), items };
}

export interface ActivateTerencanaInput {
  /** The Inventory module's own fact: whether any Petak Makam here still needs the Admin Lokasi's clearing. */
  hasPetakPerluVerifikasi: boolean;
}

export type ActivateTerencanaResult =
  | { ok: true }
  | WriteRefusal
  | NotFound
  | { ok: false; reason: "gerbang_belum_terpenuhi"; gate: TerencanaSwitchGate };

/**
 * Admin Platform switches "Pemesanan Terencana aktif" on, separately from
 * publishing, only once its own gate is met. Already on is a harmless no-op.
 * Audited with the flags before and after.
 */
export async function activateTerencana(
  deps: LokasiDeps,
  by: Actor,
  lokasiId: string,
  input: ActivateTerencanaInput,
): Promise<ActivateTerencanaResult> {
  const refusal = writeRefusal(by, "lokasi.aktifkan_terencana", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  if (!isLokasiId(lokasiId)) return { ok: false, reason: "tidak_ditemukan" };

  // Already on is a harmless no-op: checked outside the staff-write
  // transaction (a staffWrite must record an Entri Audit to commit, and a
  // no-op records none).
  const [before] = await deps.db.select({ flags: lokasiMitraTable.flags }).from(lokasiMitraTable).where(eq(lokasiMitraTable.id, lokasiId));
  if (!before) return { ok: false, reason: "tidak_ditemukan" } as const;
  if (before.flags.pemesananTerencanaAktif) return { ok: true };

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [row] = await tx.select().from(lokasiMitraTable).where(eq(lokasiMitraTable.id, lokasiId)).for("update");
    if (!row) return { ok: false, reason: "tidak_ditemukan" } as const;

    // Already on (a race with another activation between the check above and this lock): nothing to change, but a
    // staff write still must record something to commit, so this records the confirmed state rather than a change.
    const gate = row.flags.pemesananTerencanaAktif
      ? { ready: true, items: [] }
      : terencanaSwitchGate({ hasPetakPerluVerifikasi: input.hasPetakPerluVerifikasi, cekDenahDilakukan: row.cekDenahAt !== null });
    if (!gate.ready) return { ok: false, reason: "gerbang_belum_terpenuhi", gate } as const;

    const flags = { ...row.flags, pemesananTerencanaAktif: true };
    await tx.update(lokasiMitraTable).set({ flags, updatedAt: deps.clock.now() }).where(eq(lokasiMitraTable.id, lokasiId));
    await record({
      actor: { accountId: by.accountId, role: actingRole(by) },
      action: "lokasi.aktifkan_terencana",
      entity: { kind: "lokasi_mitra", id: lokasiId },
      lokasiId,
      before: { flags: row.flags },
      after: { flags },
      reason: null,
    });
    return { ok: true } as const;
  });
}
