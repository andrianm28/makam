/**
 * A Keluhan on a TPU job (spec, Layanan > Keluhan; stories 94, 158; ticket 57). The Pemesan files it
 * on a Selesai job inside the 3×24 h window that opened when Admin Platform approved the proof; the
 * job becomes Keluhan, which holds the Mitra Jasa's Pencairan (the window-close tick only looks at
 * Selesai jobs). Admin Platform then rejects it (the job is Selesai again and the tick releases the
 * Pencairan once the window is over) or has the job redone by a Mitra Jasa it names (`kerjaUlangTpu`,
 * whose pay rules then apply). A refund is not offered here.
 */
import { and, asc, eq } from "drizzle-orm";
import type { Actor } from "@/domain/identity";
import { normaliseEmail, pekerjaanTpuSemuaResource, writeRefusal, type WriteRefusal } from "@/domain/identity";
import { kerjaUlangTpu } from "./bukti-tpu";
import type { LayananDeps, PemesanLayanan } from "./deps";
import { JENDELA_KELUHAN_JAM } from "./keluhan";
import { keluhanLayananTpu, pekerjaanLayananTpu } from "./schema";
import { ajukanKeluhanTpuSchema, putuskanKeluhanTpuSchema } from "./tpu-skema";

const JAM_MS = 3_600_000;

export type AjukanKeluhanTpuResult =
  | { ok: true; keluhanId: string }
  | { ok: false; reason: "input_tidak_valid" | "bukan_pemesan" | "tidak_ditemukan" | "belum_selesai" | "jendela_tertutup" | "sudah_ada" };

export async function ajukanKeluhanTpu(deps: LayananDeps, pemesan: PemesanLayanan, rawInput: unknown): Promise<AjukanKeluhanTpuResult> {
  const parsed = ajukanKeluhanTpuSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const { pekerjaanId, alasan } = parsed.data;
  const email = normaliseEmail(pemesan.email);
  const akun = email === null ? null : await deps.identity.accountByEmail(email);
  if (!akun || akun.id !== pemesan.accountId) return { ok: false, reason: "bukan_pemesan" };
  const now = deps.clock.now();

  return deps.db.transaction(async (tx) => {
    const [job] = await tx.select().from(pekerjaanLayananTpu).where(eq(pekerjaanLayananTpu.id, pekerjaanId)).for("update");
    // Somebody else's order is "not found", as everywhere a family reads an order.
    if (!job || job.pemesanAccountId !== pemesan.accountId) return { ok: false as const, reason: "tidak_ditemukan" as const };
    const [ada] = await tx.select({ id: keluhanLayananTpu.id }).from(keluhanLayananTpu).where(eq(keluhanLayananTpu.pekerjaanId, pekerjaanId));
    if (ada) return { ok: false as const, reason: "sudah_ada" as const };
    if (job.status !== "selesai" || !job.buktiDitunjukkanAt) return { ok: false as const, reason: "belum_selesai" as const };
    if (now.getTime() > job.buktiDitunjukkanAt.getTime() + JENDELA_KELUHAN_JAM * JAM_MS) return { ok: false as const, reason: "jendela_tertutup" as const };
    const [ditulis] = await tx.insert(keluhanLayananTpu).values({ pekerjaanId, alasan, diajukanAt: now }).returning({ id: keluhanLayananTpu.id });
    await tx.update(pekerjaanLayananTpu).set({ status: "keluhan" }).where(eq(pekerjaanLayananTpu.id, pekerjaanId));
    return { ok: true as const, keluhanId: ditulis.id };
  });
}

export type PutuskanKeluhanTpuResult =
  | { ok: true }
  | WriteRefusal
  | { ok: false; reason: "input_tidak_valid" | "tidak_ditemukan" | "sudah_diputuskan" | "mitra_jasa_tidak_tersedia" };

export async function putuskanKeluhanTpu(deps: LayananDeps, by: Actor, rawInput: unknown): Promise<PutuskanKeluhanTpuResult> {
  const refusal = writeRefusal(by, "pekerjaan_tpu.kelola", pekerjaanTpuSemuaResource());
  if (refusal) return refusal;
  const parsed = putuskanKeluhanTpuSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const { keluhanId, keputusan, catatan, mitraJasaId } = parsed.data;
  if (keputusan === "kerjakan_ulang" && !mitraJasaId) return { ok: false, reason: "input_tidak_valid" };
  const now = deps.clock.now();

  // The Keluhan is claimed first, so two decisions on it take turns and the second finds it decided.
  const status = keputusan === "tolak" ? ("ditolak" as const) : ("kerjakan_ulang" as const);
  const diklaim = await deps.db
    .update(keluhanLayananTpu)
    .set({ status, diputuskanAt: now, diputuskanOleh: by.accountId, catatanKeputusan: catatan })
    .where(and(eq(keluhanLayananTpu.id, keluhanId), eq(keluhanLayananTpu.status, "terbuka")))
    .returning({ pekerjaanId: keluhanLayananTpu.pekerjaanId });
  if (diklaim.length === 0) {
    const [ada] = await deps.db.select({ id: keluhanLayananTpu.id }).from(keluhanLayananTpu).where(eq(keluhanLayananTpu.id, keluhanId));
    return { ok: false, reason: ada ? "sudah_diputuskan" : "tidak_ditemukan" };
  }
  const { pekerjaanId } = diklaim[0];

  if (keputusan === "kerjakan_ulang" && mitraJasaId) {
    const ulang = await kerjaUlangTpu(deps, by, { pekerjaanId, mitraJasaId }, true);
    if (!ulang.ok) {
      // Nothing was redone: the Keluhan is open again for Admin Platform to decide differently.
      await deps.db.update(keluhanLayananTpu).set({ status: "terbuka", diputuskanAt: null, diputuskanOleh: null, catatanKeputusan: null }).where(eq(keluhanLayananTpu.id, keluhanId));
      return { ok: false, reason: ulang.reason === "mitra_jasa_tidak_tersedia" ? "mitra_jasa_tidak_tersedia" : "input_tidak_valid" };
    }
  } else {
    await deps.db.update(pekerjaanLayananTpu).set({ status: "selesai" }).where(and(eq(pekerjaanLayananTpu.id, pekerjaanId), eq(pekerjaanLayananTpu.status, "keluhan")));
  }
  await deps.audit.staffWrite(deps.db, async (_tx, record) => {
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "layanan.putuskan_keluhan_tpu",
      entity: { kind: "keluhan_layanan_tpu", id: keluhanId },
      lokasiId: null,
      before: { status: "terbuka" },
      after: { status, pekerjaanId },
      reason: catatan,
    });
    return { ok: true as const };
  });
  return { ok: true };
}

export interface KeluhanTpuTerbuka {
  id: string;
  pekerjaanId: string;
  alasan: string;
  diajukanAt: Date;
}

/** Every Keluhan on a TPU job still waiting for Admin Platform, oldest first. */
export async function keluhanTpuTerbuka(deps: Pick<LayananDeps, "db">, by: Actor): Promise<KeluhanTpuTerbuka[]> {
  if (writeRefusal(by, "pekerjaan_tpu.kelola", pekerjaanTpuSemuaResource())) return [];
  const rows = await deps.db.select().from(keluhanLayananTpu).where(eq(keluhanLayananTpu.status, "terbuka")).orderBy(asc(keluhanLayananTpu.diajukanAt));
  return rows.map((row) => ({ id: row.id, pekerjaanId: row.pekerjaanId, alasan: row.alasan, diajukanAt: row.diajukanAt }));
}
