/**
 * The refund's destination bank account (spec, Billing > Refunds; ticket 31's
 * AC 5): entered by the Pemesan whose order it is, or recorded by Admin
 * Platform, before the transfer.
 *
 * Where a refund's money goes is the one fact here worth stealing, so:
 * - the Pemesan side is an authenticated write on the family's own order, never
 *   a bearer link (a Tagihan's link is shared with payers and relatives);
 * - it is locked once Admin Platform approves; after that only Admin Platform
 *   may change it, and only with a reason;
 * - every write is audited with the account number masked (bank and last four
 *   digits), so the Audit Log never holds a full account number.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import { pemesananResource, pengembalianResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
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
  /** Whether this Akun placed the order (Pemesanan's own `orderOf`); Refunds never reads an order itself. */
  pemilikPesanan: (nomorPemesanan: string, accountId: string) => Promise<boolean>;
}

export type IsiRekeningResult =
  | { ok: true; permintaan: PermintaanPengembalian }
  | WriteRefusal
  | { ok: false; reason: "tidak_ditemukan" }
  /** The Pemesan's side closes at approval; only Admin Platform changes it after. */
  | { ok: false; reason: "terkunci" }
  | { ok: false; reason: "sudah_ditransfer" }
  | { ok: false; reason: "input_tidak_valid" };

/** What an Entri Audit may say about an account: the bank and the last four digits. */
export function rekeningTersamar(rekening: RekeningInput | null): Record<string, unknown> | null {
  return rekening ? { bank: rekening.bank, nomor: `****${rekening.nomor.slice(-4)}` } : null;
}

const pemesanSchema = z.object({ nomorPemesanan: z.string().trim().regex(/^MKM-\d{4}-\d{6}$/), rekening: rekeningSchema });
const adminSchema = z.object({ permintaanId: z.uuid(), rekening: rekeningSchema, alasan: z.string().trim().min(1).max(500) });

type Row = typeof permintaanPengembalian.$inferSelect;

function rekeningOf(row: Row): RekeningInput | null {
  return row.rekeningBank && row.rekeningNomor && row.rekeningNama
    ? { bank: row.rekeningBank, nomor: row.rekeningNomor, nama: row.rekeningNama }
    : null;
}

async function tulis(tx: Database, row: Row, rekening: RekeningInput, oleh: "pemesan" | "admin_platform", now: Date): Promise<PermintaanPengembalian> {
  await tx
    .update(permintaanPengembalian)
    .set({ rekeningBank: rekening.bank, rekeningNomor: rekening.nomor, rekeningNama: rekening.nama, rekeningDiisiOleh: oleh, rekeningDiisiPada: now })
    .where(eq(permintaanPengembalian.id, row.id));
  const [setelah] = await tx.select().from(permintaanPengembalian).where(eq(permintaanPengembalian.id, row.id));
  return toPermintaan(setelah);
}

/** The Pemesan enters the account on the refund of their own order, until it is approved. Audited. */
export async function isiRekeningPemesan(
  deps: RekeningDeps,
  by: Actor,
  input: { nomorPemesanan: string; rekening: RekeningInput },
): Promise<IsiRekeningResult> {
  const refusal = writeRefusal(by, "pengembalian.isi_rekening", pemesananResource(by.accountId));
  if (refusal) return refusal;
  const parsed = pemesanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const { nomorPemesanan, rekening } = parsed.data;
  if (!(await deps.pemilikPesanan(nomorPemesanan, by.accountId))) return { ok: false, reason: "tidak_ditemukan" };
  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [row] = await tx
      .select()
      .from(permintaanPengembalian)
      .where(and(eq(permintaanPengembalian.nomorPemesanan, nomorPemesanan), inArray(permintaanPengembalian.status, ["diajukan", "disetujui"])))
      .orderBy(desc(permintaanPengembalian.diajukanPada))
      .for("update");
    if (!row) return { ok: false, reason: "tidak_ditemukan" } as const;
    if (row.status !== "diajukan") return { ok: false, reason: "terkunci" } as const;
    const permintaan = await tulis(tx, row, rekening, "pemesan", now);
    await record({
      actor: { accountId: by.accountId, role: "pemesan" },
      action: "pengembalian.isi_rekening_pemesan",
      entity: { kind: "permintaan_pengembalian", id: row.id },
      lokasiId: null,
      before: rekeningTersamar(rekeningOf(row)),
      after: rekeningTersamar(rekening),
      reason: null,
    });
    return { ok: true, permintaan } as const;
  });
}

/** Admin Platform records or changes the account, before or after approval, always with a reason. Audited. */
export async function isiRekeningAdmin(
  deps: RekeningDeps,
  by: Actor,
  input: { permintaanId: string; rekening: RekeningInput; alasan: string },
): Promise<IsiRekeningResult> {
  const refusal = writeRefusal(by, "pengembalian.kelola", pengembalianResource());
  if (refusal) return refusal;
  const parsed = adminSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [row] = await tx.select().from(permintaanPengembalian).where(eq(permintaanPengembalian.id, parsed.data.permintaanId)).for("update");
    if (!row) return { ok: false, reason: "tidak_ditemukan" } as const;
    if (row.status === "ditransfer") return { ok: false, reason: "sudah_ditransfer" } as const;
    const permintaan = await tulis(tx, row, parsed.data.rekening, "admin_platform", now);
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "pengembalian.isi_rekening",
      entity: { kind: "permintaan_pengembalian", id: row.id },
      lokasiId: null,
      before: rekeningTersamar(rekeningOf(row)),
      after: rekeningTersamar(parsed.data.rekening),
      reason: parsed.data.alasan,
    });
    return { ok: true, permintaan } as const;
  });
}
