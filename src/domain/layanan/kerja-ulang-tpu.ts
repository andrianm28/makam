/** Having a finished TPU job redone (ticket 57): a decision of Admin Platform, by the same or another Mitra Jasa. */
import { eq, sql } from "drizzle-orm";
import type { Actor } from "@/domain/identity";
import { pekerjaanTpuSemuaResource, writeRefusal } from "@/domain/identity";
import type { LayananDeps } from "./deps";
import { tugaskanMitraJasa, type TugaskanMitraJasaResult } from "./penugasan-tpu";
import { pekerjaanLayananTpu } from "./schema";
import { kerjaUlangTpuSchema } from "./tpu-skema";

type Penolakan = { ok: false; reason: "tidak_berwenang" | "perlu_totp" | "belum_masuk" };

export type KerjaUlangTpuResult =
  | { ok: true; pekerjaanId: string; penugasan: Extract<TugaskanMitraJasaResult, { ok: true }> }
  | Penolakan
  | { ok: false; reason: "input_tidak_valid" | "tidak_ditemukan" | "bukan_selesai" | "sudah_dikerjakan_ulang" | "mitra_jasa_tidak_tersedia" };

/**
 * Admin Platform has a finished job redone (the decision of an upheld Keluhan, by the same or another
 * Mitra Jasa; spec, Layanan > Keluhan outcome). The redo is a job of its own, linked to the original,
 * handed to the chosen Mitra Jasa through the same picker rule as any assignment; the original goes to
 * Keluhan and keeps its Pencairan, which the redo's approval then releases or cancels.
 */
export const kerjaUlangTpu = (deps: LayananDeps, by: Actor, rawInput: unknown): Promise<KerjaUlangTpuResult> => kerjaUlang(deps, by, rawInput, "selesai");

/** The same redo, for a job already held in Keluhan by an upheld Keluhan on it (`putuskanKeluhanTpu`). */
export const kerjaUlangDariKeluhanTpu = (deps: LayananDeps, by: Actor, rawInput: unknown): Promise<KerjaUlangTpuResult> => kerjaUlang(deps, by, rawInput, "keluhan");

async function kerjaUlang(deps: LayananDeps, by: Actor, rawInput: unknown, statusAsal: "selesai" | "keluhan"): Promise<KerjaUlangTpuResult> {
  const refusal = writeRefusal(by, "pekerjaan_tpu.kelola", pekerjaanTpuSemuaResource());
  if (refusal) return refusal;
  const parsed = kerjaUlangTpuSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const { pekerjaanId, mitraJasaId } = parsed.data;
  const sekarang = deps.clock.now();

  try {
    // One transaction: a hand-over the picker refuses rolls back the redo row and the original's Keluhan status with it.
    return await deps.db.transaction(async (tx): Promise<KerjaUlangTpuResult> => {
      const [asal] = await tx.select().from(pekerjaanLayananTpu).where(eq(pekerjaanLayananTpu.id, pekerjaanId)).for("update");
      if (!asal) return { ok: false, reason: "tidak_ditemukan" };
      if (asal.status !== statusAsal) return { ok: false, reason: "bukan_selesai" };
      const [ada] = await tx.select({ id: pekerjaanLayananTpu.id }).from(pekerjaanLayananTpu).where(eq(pekerjaanLayananTpu.kerjaUlangDariId, pekerjaanId));
      if (ada) return { ok: false, reason: "sudah_dikerjakan_ulang" };
      const [urutan] = await tx
        .select({ maks: sql<number>`coalesce(max(${pekerjaanLayananTpu.posisi}), 0)` })
        .from(pekerjaanLayananTpu)
        .where(eq(pekerjaanLayananTpu.nomor, asal.nomor));
      const salinan: Omit<typeof asal, "id"> & { id?: string } = { ...asal };
      delete salinan.id;
      const [baru] = await tx
        .insert(pekerjaanLayananTpu)
        .values({
          ...salinan,
          posisi: urutan.maks + 1,
          status: "dijadwalkan",
          dijadwalkanAt: sekarang,
          createdAt: sekarang,
          mulaiAt: null,
          buktiDikirimAt: null,
          buktiDitolakAlasan: null,
          buktiDitunjukkanAt: null,
          selesaiAt: null,
          jendelaDitutupAt: null,
          pencairanItemId: null,
          pencairanJatuhTempoAt: null,
          kerjaUlangDariId: pekerjaanId,
        })
        .returning({ id: pekerjaanLayananTpu.id });
      await tx.update(pekerjaanLayananTpu).set({ status: "keluhan" }).where(eq(pekerjaanLayananTpu.id, pekerjaanId));
      const tugas = await tugaskanMitraJasa({ ...deps, db: tx }, by, { pekerjaanId: baru.id, mitraJasaId });
      if (!tugas.ok) throw new KerjaUlangGagal(tugas.reason === "mitra_jasa_tidak_tersedia" ? "mitra_jasa_tidak_tersedia" : "input_tidak_valid");
      return { ok: true, pekerjaanId: baru.id, penugasan: tugas };
    });
  } catch (error) {
    if (error instanceof KerjaUlangGagal) return { ok: false, reason: error.reason };
    throw error;
  }
}

/** The picker refused the Mitra Jasa: thrown inside the transaction so that nothing of the redo is kept. */
class KerjaUlangGagal extends Error {
  constructor(readonly reason: "input_tidak_valid" | "mitra_jasa_tidak_tersedia") {
    super(reason);
  }
}
