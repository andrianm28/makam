/** The refund of a TPU job's own line, asked of Refunds (ticket 57): shared by a refunded Keluhan and a cancelled Terlambat job. */
import { and, asc, eq, isNull } from "drizzle-orm";
import type { Database } from "@/db/client";
import { nilaiDibayarBaris } from "@/domain/billing";
import type { LayananDeps } from "./deps";
import { pekerjaanLayananTpu } from "./schema";

export type PengembalianTpuGagal = { ok: false; reason: "pengembalian_tidak_bisa_diajukan" | "pengembalian_tertunda" };

/**
 * The line of a Tagihan one TPU job was billed on: the Nth `layanan` line carrying the job's label, N being the job's
 * rank among the Tagihan's original jobs of that label. A Saat Duka Tagihan holds other lines before the Layanan, so
 * the job's position alone does not find it; a redo is its original's line again. Null when the Tagihan holds none.
 * One rule for every refund of a TPU job (a refunded Keluhan, a cancelled Terlambat job, a cancelled Saat Duka order).
 */
export async function barisTagihanPekerjaanTpu<L extends { kind: string; label: string }>(
  tx: Database,
  lines: readonly L[],
  job: Pick<typeof pekerjaanLayananTpu.$inferSelect, "id" | "tagihanId" | "label" | "kerjaUlangDariId">,
): Promise<L | null> {
  const kembar = await tx
    .select({ id: pekerjaanLayananTpu.id })
    .from(pekerjaanLayananTpu)
    .where(and(eq(pekerjaanLayananTpu.tagihanId, job.tagihanId), eq(pekerjaanLayananTpu.label, job.label), isNull(pekerjaanLayananTpu.kerjaUlangDariId)))
    .orderBy(asc(pekerjaanLayananTpu.nomor), asc(pekerjaanLayananTpu.posisi));
  const asalId = job.kerjaUlangDariId ?? job.id;
  const urutan = kembar.findIndex((satu) => satu.id === asalId);
  if (urutan < 0) return null;
  return lines.filter((satu) => satu.kind === "layanan" && satu.label === job.label)[urutan] ?? null;
}

/**
 * Asks Refunds, on the caller's transaction, for the job's own line of the Tagihan in force (`barisTagihanPekerjaanTpu`),
 * the Mitra Jasa at fault (so the Biaya Layanan Platform follows Refunds' own fault rule). After a Harga Khusus the line
 * is the job's own share of what was paid (ticket 95).
 */
export async function mintaPengembalianTpu(
  deps: LayananDeps,
  tx: Database,
  job: typeof pekerjaanLayananTpu.$inferSelect,
): Promise<{ ok: true; permintaanId: string | null } | PengembalianTpuGagal> {
  const gagal: PengembalianTpuGagal = { ok: false, reason: "pengembalian_tidak_bisa_diajukan" };
  const tagihan = await deps.billing.within(tx).tagihanBerlaku(job.tagihanId);
  if (!tagihan) return gagal;
  const line = await barisTagihanPekerjaanTpu(tx, tagihan.lines, job);
  if (!line) return gagal;
  const diajukan = await deps.refunds.ajukanBaris(tagihan.id, { pihakBersalah: "mitra_jasa", lines: [{ label: line.label, amount: nilaiDibayarBaris(tagihan.lines, line), lokasiId: null }] }, tx);
  if (diajukan.ok) return { ok: true, permintaanId: diajukan.permintaanId };
  return { ok: false, reason: diajukan.reason === "sudah_ada_permintaan_terbuka" ? "pengembalian_tertunda" : "pengembalian_tidak_bisa_diajukan" };
}
