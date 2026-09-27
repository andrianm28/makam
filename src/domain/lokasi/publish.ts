import { eq } from "drizzle-orm";
import { lokasiMitraResource, writeRefusal, type Actor, type Identity, type WriteRefusal } from "@/domain/identity";
import { kontakSiagaOf } from "./kontak-siaga";
import { actingRole, isLokasiId, type LokasiDeps, type LokasiMitraStatus, type NotFound } from "./lokasi-mitra";
import { publishGate, type PublishGate } from "./publish-gate";
import { lokasiMitra as lokasiMitraTable } from "./schema";

export interface PublishDeps extends LokasiDeps {
  identity: Identity;
}

/**
 * The one fact the publish gate needs that the Lokasi module does not own
 * (the Tariffs module's "tarif diperiksa" mark): given by the caller, which
 * reads it off the Tariffs module (spec, decision 2026-09-26). Every other
 * gate fact (agreement, Kunjungan Verifikasi, Jam Operasional, Kontak Siaga)
 * is this Lokasi Mitra's own, read here.
 */
export interface PublishInput {
  tariffsChecked: { changedSinceCheck: boolean } | null;
}

export type PublishLokasiMitraResult =
  | { ok: true; status: LokasiMitraStatus }
  | WriteRefusal
  | NotFound
  | { ok: false; reason: "gerbang_belum_terpenuhi"; gate: PublishGate }
  | { ok: false; reason: "status_tidak_bisa_diterbitkan" };

/**
 * Admin Platform publishes a Lokasi Mitra: Belum Tayang → Terverifikasi, only
 * once the publish gate is fully met (spec, Lokasi > publish gate; decisions
 * 2026-09-26). Re-publishing an already Terverifikasi Lokasi is a harmless
 * no-op; a Ditangguhkan or Berhenti one refuses here (their own reinstatement
 * is ticket 59's, not this one-way gate). Audited with the status before and after.
 */
export async function publishLokasiMitra(
  deps: PublishDeps,
  by: Actor,
  lokasiId: string,
  input: PublishInput,
): Promise<PublishLokasiMitraResult> {
  const refusal = writeRefusal(by, "lokasi.terbitkan", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  if (!isLokasiId(lokasiId)) return { ok: false, reason: "tidak_ditemukan" };

  // Already Terverifikasi is a harmless no-op: checked outside the staff-write
  // transaction (a staffWrite must record an Entri Audit to commit, and a
  // no-op records none). A race with another publish just repeats this check.
  const [before] = await deps.db.select({ status: lokasiMitraTable.status }).from(lokasiMitraTable).where(eq(lokasiMitraTable.id, lokasiId));
  if (!before) return { ok: false, reason: "tidak_ditemukan" } as const;
  if (before.status === "terverifikasi") return { ok: true, status: before.status };

  const kontakSiaga = await kontakSiagaOf(deps, lokasiId);
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [row] = await tx.select().from(lokasiMitraTable).where(eq(lokasiMitraTable.id, lokasiId)).for("update");
    if (!row) return { ok: false, reason: "tidak_ditemukan" } as const;
    // Not belum_tayang any more (including a race that just published it): nothing to do here, and a no-op transaction cannot commit.
    if (row.status !== "belum_tayang") return { ok: false, reason: "status_tidak_bisa_diterbitkan" } as const;

    const gate = publishGate({
      agreement: { signedOn: row.agreementSignedOn, scanUploaded: row.agreementScanFileKey !== null },
      kunjunganVerifikasiSelesai: row.dikunjungiOn !== null,
      tariffsChecked: input.tariffsChecked,
      jamOperasionalDiisi: row.jamOperasional !== null,
      kontakSiagaDipilih: kontakSiaga !== null,
    });
    if (!gate.ready) return { ok: false, reason: "gerbang_belum_terpenuhi", gate } as const;

    await tx
      .update(lokasiMitraTable)
      .set({ status: "terverifikasi", updatedAt: deps.clock.now() })
      .where(eq(lokasiMitraTable.id, lokasiId));
    await record({
      actor: { accountId: by.accountId, role: actingRole(by) },
      action: "lokasi.terbitkan",
      entity: { kind: "lokasi_mitra", id: lokasiId },
      lokasiId,
      before: { status: row.status },
      after: { status: "terverifikasi" },
      reason: null,
    });
    return { ok: true, status: "terverifikasi" } as const;
  });
}
