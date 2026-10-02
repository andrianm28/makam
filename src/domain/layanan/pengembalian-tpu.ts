/** The refund of a TPU job's own line, asked of Refunds (ticket 57): shared by a refunded Keluhan and a cancelled Terlambat job. */
import { and, asc, eq, isNull } from "drizzle-orm";
import type { Database } from "@/db/client";
import { nilaiDibayarBaris } from "@/domain/billing";
import type { LayananDeps } from "./deps";
import { pekerjaanLayananTpu } from "./schema";

export type PengembalianTpuGagal = { ok: false; reason: "pengembalian_tidak_bisa_diajukan" | "pengembalian_tertunda" };

/**
 * Asks Refunds, on the caller's transaction, for the job's own line of the Tagihan in force, the Mitra Jasa at
 * fault (so the Biaya Layanan Platform follows Refunds' own fault rule). The line is the Nth `layanan` line
 * carrying the job's label, N being the job's rank among the order's original jobs of that label: a Saat Duka
 * Tagihan holds other lines before the Layanan, so the job's position alone does not find it. After a Harga
 * Khusus the line is the job's own share of what was paid (ticket 95).
 */
export async function mintaPengembalianTpu(
  deps: LayananDeps,
  tx: Database,
  job: typeof pekerjaanLayananTpu.$inferSelect,
): Promise<{ ok: true; permintaanId: string | null } | PengembalianTpuGagal> {
  const gagal: PengembalianTpuGagal = { ok: false, reason: "pengembalian_tidak_bisa_diajukan" };
  const tagihan = await deps.billing.within(tx).tagihanBerlaku(job.tagihanId);
  if (!tagihan) return gagal;
  const kembar = await tx
    .select({ id: pekerjaanLayananTpu.id })
    .from(pekerjaanLayananTpu)
    .where(and(eq(pekerjaanLayananTpu.tagihanId, job.tagihanId), eq(pekerjaanLayananTpu.label, job.label), isNull(pekerjaanLayananTpu.kerjaUlangDariId)))
    .orderBy(asc(pekerjaanLayananTpu.nomor), asc(pekerjaanLayananTpu.posisi));
  // A redo is the original's line again.
  const asalId = job.kerjaUlangDariId ?? job.id;
  const urutan = kembar.findIndex((satu) => satu.id === asalId);
  const line = tagihan.lines.filter((satu) => satu.kind === "layanan" && satu.label === job.label)[urutan];
  if (urutan < 0 || !line) return gagal;
  const diajukan = await deps.refunds.ajukanBaris(tagihan.id, { pihakBersalah: "mitra_jasa", lines: [{ label: line.label, amount: nilaiDibayarBaris(tagihan.lines, line), lokasiId: null }] }, tx);
  if (diajukan.ok) return { ok: true, permintaanId: diajukan.permintaanId };
  return { ok: false, reason: diajukan.reason === "sudah_ada_permintaan_terbuka" ? "pengembalian_tertunda" : "pengembalian_tidak_bisa_diajukan" };
}
