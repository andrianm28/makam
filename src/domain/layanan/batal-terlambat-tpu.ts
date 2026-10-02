/**
 * Cancelling a Terlambat TPU job (spec, Layanan > Pekerjaan Layanan and Mitra Jasa pay: "Cancelled for lateness: no
 * Pencairan"; ticket 57). The Pemesan may, and Admin Platform may on the family's behalf. The whole Tagihan comes
 * back, the Biaya Layanan Platform too when it carries one (the lateness is the Mitra Jasa's, as `batalkanPekerjaan` does for a late
 * Lokasi job). A Terlambat job was never sent for approval, so it has no Pencairan item to cancel. One transaction:
 * the status, the refund request and the audit entry stand or fall together.
 */
import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { Actor } from "@/domain/identity";
import { normaliseEmail, pekerjaanTpuSemuaResource, writeRefusal, type WriteRefusal } from "@/domain/identity";
import type { LayananDeps, PemesanLayanan } from "./deps";
import { mintaPengembalianTpu } from "./pengembalian-tpu";
import { pekerjaanLayananTpu } from "./schema";
import { batalkanPekerjaanTerlambatTpuSchema, pekerjaanTpuIdSchema } from "./tpu-skema";

export type BatalkanPekerjaanTerlambatTpuResult =
  | { ok: true }
  | { ok: false; reason: "input_tidak_valid" | "tidak_ditemukan" | "bukan_terlambat" | "pengembalian_tidak_bisa_diajukan" | "pengembalian_tertunda" };

class PembatalanGagal extends Error {
  constructor(readonly reason: "pengembalian_tidak_bisa_diajukan" | "pengembalian_tertunda") {
    super(reason);
  }
}

async function batalkan(
  deps: LayananDeps,
  pekerjaanId: string,
  izin: (job: typeof pekerjaanLayananTpu.$inferSelect) => boolean,
  catatAudit: ((tx: Database) => Promise<unknown>) | null,
): Promise<BatalkanPekerjaanTerlambatTpuResult> {
  const now = deps.clock.now();
  try {
    return await deps.db.transaction(async (tx): Promise<BatalkanPekerjaanTerlambatTpuResult> => {
      const [job] = await tx.select().from(pekerjaanLayananTpu).where(eq(pekerjaanLayananTpu.id, pekerjaanId)).for("update");
      // Somebody else's order is "not found", as everywhere a family reads an order.
      if (!job || !izin(job)) return { ok: false, reason: "tidak_ditemukan" };
      if (job.status !== "terlambat") return { ok: false, reason: "bukan_terlambat" };
      const diminta = await mintaPengembalianTpu({ ...deps, db: tx }, tx, job);
      if (!diminta.ok) throw new PembatalanGagal(diminta.reason);
      await tx
        .update(pekerjaanLayananTpu)
        .set({ status: "dibatalkan", dibatalkanAt: now })
        .where(and(eq(pekerjaanLayananTpu.id, pekerjaanId), eq(pekerjaanLayananTpu.status, "terlambat")));
      if (catatAudit) await catatAudit(tx);
      return { ok: true };
    });
  } catch (error) {
    if (error instanceof PembatalanGagal) return { ok: false, reason: error.reason };
    throw error;
  }
}

/** The Pemesan cancels a Terlambat job of their own order. */
export async function batalkanPekerjaanTerlambatTpuOlehPemesan(deps: LayananDeps, pemesan: PemesanLayanan, rawInput: unknown): Promise<BatalkanPekerjaanTerlambatTpuResult> {
  const parsed = pekerjaanTpuIdSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const email = normaliseEmail(pemesan.email);
  const akun = email === null ? null : await deps.identity.accountByEmail(email);
  if (!akun || akun.id !== pemesan.accountId) return { ok: false, reason: "tidak_ditemukan" };
  return batalkan(deps, parsed.data.pekerjaanId, (job) => job.pemesanAccountId === pemesan.accountId, null);
}

/** Admin Platform cancels a Terlambat job on the family's behalf, with a reason. Audited. */
export async function batalkanPekerjaanTerlambatTpu(deps: LayananDeps, by: Actor, rawInput: unknown): Promise<BatalkanPekerjaanTerlambatTpuResult | WriteRefusal> {
  const refusal = writeRefusal(by, "pekerjaan_tpu.kelola", pekerjaanTpuSemuaResource());
  if (refusal) return refusal;
  const parsed = batalkanPekerjaanTerlambatTpuSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const { pekerjaanId, catatan } = parsed.data;
  return batalkan(deps, pekerjaanId, () => true, (tx) =>
    deps.audit.staffWrite(tx, async (_tx, record) => {
      await record({
        actor: { accountId: by.accountId, role: "admin_platform" },
        action: "layanan.batalkan_pekerjaan_terlambat_tpu",
        entity: { kind: "pekerjaan_layanan_tpu", id: pekerjaanId },
        lokasiId: null,
        before: { status: "terlambat" },
        after: { status: "dibatalkan" },
        reason: catatan,
      });
      return { ok: true as const };
    }),
  );
}
