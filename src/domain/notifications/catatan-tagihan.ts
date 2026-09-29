/**
 * A standalone note on a chased Tagihan's call log (spec, Billing > Chasing:
 * "the Admin Lokasi adds its notes on the same call log"; ticket 29's AC 3).
 * Unlike `catatPanggilan` it needs no open "Telepon Pemesan" row and closes
 * none, and it is never a call: `teleponPemesanTercatat` (what
 * `declareTidakTertagih` reads) does not see it. Only that Lokasi's own Admin
 * Lokasi (or Admin Platform) may write one; nobody can declare Tidak Tertagih
 * through it.
 */
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Billing } from "@/domain/billing";
import { lokasiMitraResource, antreanResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { Clock } from "@/ports/clock";
import { notificationsCatatanTagihan } from "./schema";
import { staffRoleOf } from "./telepon-pemesan";

export const tambahCatatanTagihanSchema = z.object({
  tagihanId: z.uuid(),
  catatan: z.string().trim().min(1).max(500),
});
export type TambahCatatanTagihanInput = z.infer<typeof tambahCatatanTagihanSchema>;

export interface CatatanTagihan {
  id: string;
  catatan: string;
  ditulisOleh: string;
  dibuatPada: Date;
}

export type TambahCatatanTagihanResult =
  | { ok: true; catatan: CatatanTagihan }
  | WriteRefusal
  | { ok: false; reason: "catatan_tidak_valid" | "tagihan_tidak_dikejar" };

export async function tambahCatatanTagihan(
  deps: { db: Database; clock: Clock; audit: AuditLog; tagihan: Pick<Billing, "tagihanLewatJatuhTempo"> },
  by: Actor,
  rawInput: unknown,
): Promise<TambahCatatanTagihanResult> {
  const parsed = tambahCatatanTagihanSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "catatan_tidak_valid" };
  const target = (await deps.tagihan.tagihanLewatJatuhTempo()).find((t) => t.id === parsed.data.tagihanId);
  // A caller who may write no note at all is refused before this says anything about the Tagihan.
  const refusal = writeRefusal(
    by,
    "telepon_pemesan.catat_lokasi",
    target?.lokasiId ? lokasiMitraResource(target.lokasiId) : antreanResource(),
  );
  if (refusal) return refusal;
  if (!target) return { ok: false, reason: "tagihan_tidak_dikejar" };
  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [row] = await tx
      .insert(notificationsCatatanTagihan)
      .values({
        tagihanId: target.id,
        lokasiId: target.lokasiId,
        catatan: parsed.data.catatan,
        ditulisOleh: by.accountId,
        dibuatPada: now,
      })
      .returning();
    await record({
      actor: { accountId: by.accountId, role: staffRoleOf(by) },
      action: "tagihan.catatan_ditambah",
      entity: { kind: "tagihan", id: target.id },
      lokasiId: target.lokasiId,
      before: null,
      after: { catatan: parsed.data.catatan },
      reason: null,
    });
    return { ok: true as const, catatan: { id: row!.id, catatan: row!.catatan, ditulisOleh: row!.ditulisOleh, dibuatPada: row!.dibuatPada } };
  });
}

/** Every standalone note on one Tagihan's call log, oldest first. */
export async function catatanTagihan(db: Database, tagihanId: string): Promise<CatatanTagihan[]> {
  const rows = await db
    .select()
    .from(notificationsCatatanTagihan)
    .where(eq(notificationsCatatanTagihan.tagihanId, tagihanId))
    .orderBy(asc(notificationsCatatanTagihan.dibuatPada), asc(notificationsCatatanTagihan.id));
  return rows.map((row) => ({ id: row.id, catatan: row.catatan, ditulisOleh: row.ditulisOleh, dibuatPada: row.dibuatPada }));
}
