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

  const dibuat = await deps.db.transaction(async (tx) => {
    const [asal] = await tx.select().from(pekerjaanLayananTpu).where(eq(pekerjaanLayananTpu.id, pekerjaanId)).for("update");
    if (!asal) return { ok: false as const, reason: "tidak_ditemukan" as const };
    if (asal.status !== statusAsal) return { ok: false as const, reason: "bukan_selesai" as const };
    const [ada] = await tx.select({ id: pekerjaanLayananTpu.id }).from(pekerjaanLayananTpu).where(eq(pekerjaanLayananTpu.kerjaUlangDariId, pekerjaanId));
    if (ada) return { ok: false as const, reason: "sudah_dikerjakan_ulang" as const };
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
    return { ok: true as const, id: baru.id };
  });
  if (!dibuat.ok) return dibuat;
  const tugas = await tugaskanMitraJasa(deps, by, { pekerjaanId: dibuat.id, mitraJasaId });
  if (!tugas.ok) {
    // Handing it over failed (the picker refused them): put the original back, and drop the unassigned redo.
    await deps.db.transaction(async (tx) => {
      await tx.delete(pekerjaanLayananTpu).where(eq(pekerjaanLayananTpu.id, dibuat.id));
      await tx.update(pekerjaanLayananTpu).set({ status: statusAsal }).where(eq(pekerjaanLayananTpu.id, pekerjaanId));
    });
    return { ok: false, reason: tugas.reason === "mitra_jasa_tidak_tersedia" ? "mitra_jasa_tidak_tersedia" : "input_tidak_valid" };
  }
  return { ok: true, pekerjaanId: dibuat.id, penugasan: tugas };
}

