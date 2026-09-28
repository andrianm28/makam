/**
 * Entering the refund's destination bank account (spec, Billing > Refunds: "The
 * refund's destination bank account is entered by the Pemesan (or recorded by
 * Admin Platform) before transfer"; ticket 31's AC 5).
 *
 * The Pemesan side is reached through the Tagihan's own unguessable link — the
 * same permission model as Bayar (AGENTS.md's exception): anyone holding that
 * link may enter the refund's own bank account, because the link is already
 * the family's proof that this refund is theirs. It skips `guarded()`'s
 * authenticate and role steps for the same reason Bayar does, and still
 * validates every field with Zod. The Admin Platform side goes through
 * `guarded()` as usual, so a family who cannot reach their email still gets a
 * refund once Admin Platform records the account by phone.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { refusable } from "@/db/unit-of-work";
import type { AuditLog } from "@/domain/audit";
import { pengembalianResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { Clock } from "@/ports/clock";
import { toPermintaan, type PermintaanPengembalian } from "./baca";
import { permintaanPengembalian } from "./schema";

export const rekeningSchema = z.object({
  bank: z.string().trim().min(1).max(100),
  nomor: z.string().trim().min(1).max(50),
  nama: z.string().trim().min(1).max(200),
});
export type RekeningInput = z.infer<typeof rekeningSchema>;

export interface RekeningDeps {
  db: Database;
  clock: Clock;
  audit: AuditLog;
}

export type IsiRekeningResult =
  | { ok: true; permintaan: PermintaanPengembalian }
  | { ok: false; reason: "tidak_ditemukan" }
  | { ok: false; reason: "sudah_ditransfer" }
  | { ok: false; reason: "input_tidak_valid" };

/**
 * The Pemesan enters the bank account on their own refund, by the Tagihan's
 * link (no actor, no role — the link is the permission, exactly like Bayar).
 * Not audited: this is the family acting on its own request, not a staff write.
 */
export async function isiRekeningPemesan(
  deps: Pick<RekeningDeps, "db" | "clock">,
  input: { tagihanId: string; rekening: RekeningInput },
): Promise<IsiRekeningResult> {
  const parsed = z.object({ tagihanId: z.string().trim().min(1).max(64), rekening: rekeningSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const now = deps.clock.now();
  return refusable<IsiRekeningResult>(deps.db, (tx) =>
    tulisRekening(tx, now, { tagihanId: parsed.data.tagihanId, rekening: parsed.data.rekening, oleh: "pemesan" }),
  );
}

export type IsiRekeningAdminResult = IsiRekeningResult | WriteRefusal;

/** Admin Platform records the bank account on a Pemesan's behalf (e.g. taken by phone). Audited. */
export async function isiRekeningAdmin(
  deps: RekeningDeps,
  by: Actor,
  input: { permintaanId: string; rekening: RekeningInput },
): Promise<IsiRekeningAdminResult> {
  const refusal = writeRefusal(by, "pengembalian.kelola", pengembalianResource());
  if (refusal) return refusal;
  const parsed = z.object({ permintaanId: z.uuid(), rekening: rekeningSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const result = await tulisRekening(tx, now, { permintaanId: parsed.data.permintaanId, rekening: parsed.data.rekening, oleh: "admin_platform" });
    if (!result.ok) return result;
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "pengembalian.isi_rekening",
      entity: { kind: "permintaan_pengembalian", id: result.permintaan.id },
      lokasiId: null,
      before: null,
      after: { bank: parsed.data.rekening.bank, nomor: parsed.data.rekening.nomor, nama: parsed.data.rekening.nama },
      reason: null,
    });
    return result;
  });
}

async function tulisRekening(
  db: Database,
  now: Date,
  input: { tagihanId?: string; permintaanId?: string; rekening: RekeningInput; oleh: "pemesan" | "admin_platform" },
): Promise<IsiRekeningResult> {
  const where = input.permintaanId
    ? eq(permintaanPengembalian.id, input.permintaanId)
    : eq(permintaanPengembalian.tagihanId, input.tagihanId!);
  const [row] = await db.select().from(permintaanPengembalian).where(where).for("update");
  if (!row) return { ok: false, reason: "tidak_ditemukan" };
  if (row.status === "ditransfer") return { ok: false, reason: "sudah_ditransfer" };
  await db
    .update(permintaanPengembalian)
    .set({
      rekeningBank: input.rekening.bank,
      rekeningNomor: input.rekening.nomor,
      rekeningNama: input.rekening.nama,
      rekeningDiisiOleh: input.oleh,
      rekeningDiisiPada: now,
    })
    .where(eq(permintaanPengembalian.id, row.id));
  const [setelah] = await db.select().from(permintaanPengembalian).where(eq(permintaanPengembalian.id, row.id));
  return { ok: true, permintaan: toPermintaan(setelah) };
}
