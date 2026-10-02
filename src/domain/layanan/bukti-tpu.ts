/**
 * The photo proof of a TPU job, its approval by Admin Platform, and what the approval
 * pays (spec, Layanan > Pekerjaan Layanan and Mitra Jasa pay; Work Queues Tier 2 "foto
 * bukti approval (24 h)"; stories 91, 92, 157, 179, 181; ticket 57).
 *
 * The Mitra Jasa captures the shots the Layanan's catalog setting requires with the
 * in-app camera (`takenAt` is the camera's own moment) and sends them: the job is
 * **Menunggu Verifikasi**. Admin Platform approves (the job is Selesai, the proof is
 * shown to the Pemesan and the 3×24 h Keluhan window opens: `bukti_ditunjukkan_at`) or
 * rejects with a reason (the job is back to Sedang Dikerjakan). Only an approved proof is
 * ever shown to the Pemesan.
 *
 * **The pay rules live here, in one place, and run when the proof is approved** (that is
 * when the Mitra Jasa has done the job; nothing is recorded for a job that was cancelled
 * or never finished, so "cancelled for lateness: no Pencairan" needs no branch):
 * - the Mitra Jasa who holds the job when it is approved is the one paid ("reassigned: only
 *   the one who does the job is paid"), at the tariff in force, whether the job was
 *   Terlambat or not ("Terlambat but done: full rate");
 * - a redo by **the same** Mitra Jasa as the original is unpaid, and the original's
 *   Pencairan is released (made due) by this approval;
 * - a redo by **another** Mitra Jasa is paid at the normal rate, and the original's
 *   Pencairan is cancelled;
 * - a Potongan is never applied: Payouts has nowhere to name one for a Mitra Jasa.
 *
 * A TPU job's Tagihan does not enter into it: the item exists from the approval, so a
 * hari-H Layanan on a Saat Duka Tagihan pays the Mitra Jasa when the Keluhan window closes
 * whether or not the family has paid, and a Tidak Tertagih Tagihan is the Operator's loss.
 */
import { and, asc, desc, eq, isNotNull, isNull, lte, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { Actor } from "@/domain/identity";
import { akunResource, pekerjaanTpuSemuaResource, writeRefusal } from "@/domain/identity";
import { documentExtension, type DocumentContentType } from "@/lib/files/document-type";
import { BUKTI_MAX_BYTES, buktiKurang, jenisBuktiDibutuhkan } from "./bukti";
import type { LayananDeps } from "./deps";
import { JENDELA_KELUHAN_JAM } from "./keluhan";
import { proofOf } from "./katalog";
import { profileOfActor } from "./mitra-jasa";
import { buktiPekerjaanSchema, type BuktiPekerjaan } from "./pesanan-schema";
import {
  layananLayanan,
  layananMitraJasa,
  pekerjaanLayananTpu,
  pekerjaanLayananTpuBukti,
  pekerjaanLayananTpuPenugasan,
} from "./schema";
import { kerjaUlangTpuSchema, pekerjaanTpuIdSchema, tolakBuktiTpuSchema } from "./tpu-skema";
import { buktiTpuPerPekerjaan, type BuktiTpuTerbaca } from "./bukti-tpu-baca";
import { tugaskanMitraJasa, type TugaskanMitraJasaResult } from "./penugasan-tpu";

const BUKTI_TYPES: readonly DocumentContentType[] = ["image/jpeg", "image/png", "image/webp", "video/mp4"];
const JAM_MS = 3_600_000;

/** Admin Platform has this long to approve or reject a proof (the Tier 2 row's deadline). */
export const BATAS_VERIFIKASI_BUKTI_JAM = 24;

type Penolakan = { ok: false; reason: "tidak_berwenang" | "perlu_totp" | "belum_masuk" };

/* ── the Mitra Jasa captures and sends ── */

export type SimpanBuktiTpuResult =
  | { ok: true; kind: BuktiPekerjaan }
  | Penolakan
  | { ok: false; reason: "berkas_tidak_didukung" | "penyimpanan_belum_tersedia" | "tidak_ditemukan" | "tidak_bisa_diubah" };

/**
 * One shot of the proof, kept in the private FileStore. Only the Mitra Jasa who holds the job
 * (accepted it) may; the first shot makes the job Sedang Dikerjakan. A job waiting for
 * approval, done or cancelled takes no more shots. Taking a kind again replaces it.
 */
export async function simpanBuktiTpu(deps: LayananDeps, by: Actor, rawInput: unknown): Promise<SimpanBuktiTpuResult> {
  const refusal = writeRefusal(by, "pekerjaan_tpu.jawab", akunResource(by.accountId));
  if (refusal) return refusal;
  const parsed = buktiPekerjaanSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "berkas_tidak_didukung" };
  const { pekerjaanId, kind, file, takenAt } = parsed.data;
  const extension = documentExtension(file, BUKTI_TYPES);
  if (file.body.byteLength === 0 || !extension || file.body.byteLength > BUKTI_MAX_BYTES) return { ok: false, reason: "berkas_tidak_didukung" };
  const profile = await profileOfActor(deps, by);
  if (!profile) return { ok: false, reason: "tidak_ditemukan" };
  const sekarang = deps.clock.now();
  // A camera in the future is not a witness of anything.
  if (takenAt.getTime() > sekarang.getTime() + 5 * 60_000) return { ok: false, reason: "berkas_tidak_didukung" };

  const pegang = await bacaPegangan(deps.db, pekerjaanId, profile.id);
  if (!pegang) return { ok: false, reason: "tidak_ditemukan" };
  if (!["dijadwalkan", "sedang_dikerjakan", "terlambat"].includes(pegang.status)) return { ok: false, reason: "tidak_bisa_diubah" };

  const key = `pekerjaan-layanan-tpu/${pekerjaanId}/${kind}.${extension}`;
  try {
    await deps.files.put({ key, body: file.body, contentType: file.contentType });
  } catch {
    return { ok: false, reason: "penyimpanan_belum_tersedia" };
  }
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [job] = await tx.select().from(pekerjaanLayananTpu).where(eq(pekerjaanLayananTpu.id, pekerjaanId)).for("update");
    if (!job || !(await bacaPegangan(tx, pekerjaanId, profile.id))) return { ok: false as const, reason: "tidak_ditemukan" as const };
    if (!["dijadwalkan", "sedang_dikerjakan", "terlambat"].includes(job.status)) return { ok: false as const, reason: "tidak_bisa_diubah" as const };
    await tx
      .insert(pekerjaanLayananTpuBukti)
      .values({ pekerjaanId, kind, fileKey: key, contentType: file.contentType, takenAt, diunggahOleh: by.accountId, createdAt: sekarang, diperbaruiAt: sekarang })
      .onConflictDoUpdate({
        target: [pekerjaanLayananTpuBukti.pekerjaanId, pekerjaanLayananTpuBukti.kind],
        set: { fileKey: key, contentType: file.contentType, takenAt, diunggahOleh: by.accountId, diperbaruiAt: sekarang },
      });
    if (job.status === "dijadwalkan") {
      await tx.update(pekerjaanLayananTpu).set({ status: "sedang_dikerjakan", mulaiAt: sekarang }).where(eq(pekerjaanLayananTpu.id, pekerjaanId));
    }
    await record({
      actor: { accountId: by.accountId, role: "mitra_jasa" },
      action: "layanan.unggah_bukti_tpu",
      entity: { kind: "pekerjaan_layanan_tpu", id: pekerjaanId },
      lokasiId: null,
      before: null,
      after: { kind, takenAt: takenAt.toISOString(), contentType: file.contentType },
      reason: null,
    });
    return { ok: true as const, kind };
  });
}

/** The job and its status when `mitraJasaId` holds it (accepted), or null. */
async function bacaPegangan(db: Database, pekerjaanId: string, mitraJasaId: string) {
  const [row] = await db
    .select({ status: pekerjaanLayananTpu.status })
    .from(pekerjaanLayananTpuPenugasan)
    .innerJoin(pekerjaanLayananTpu, eq(pekerjaanLayananTpu.id, pekerjaanLayananTpuPenugasan.pekerjaanId))
    .where(
      and(
        eq(pekerjaanLayananTpuPenugasan.pekerjaanId, pekerjaanId),
        eq(pekerjaanLayananTpuPenugasan.mitraJasaId, mitraJasaId),
        eq(pekerjaanLayananTpuPenugasan.hasil, "diterima"),
      ),
    );
  return row ?? null;
}

async function jenisTerambil(db: Database, pekerjaanId: string): Promise<BuktiPekerjaan[]> {
  const rows = await db.select({ kind: pekerjaanLayananTpuBukti.kind }).from(pekerjaanLayananTpuBukti).where(eq(pekerjaanLayananTpuBukti.pekerjaanId, pekerjaanId));
  return rows.map((row) => row.kind);
}

export type KirimBuktiTpuResult =
  | { ok: true; batasVerifikasi: Date }
  | Penolakan
  | { ok: false; reason: "input_tidak_valid" | "tidak_ditemukan" | "tidak_bisa_dikirim" }
  | { ok: false; reason: "bukti_kurang"; kurang: BuktiPekerjaan[] };

/** The Mitra Jasa sends the proof for approval: every shot the catalog requires must be taken. The job is Menunggu Verifikasi. */
export async function kirimBuktiTpu(deps: LayananDeps, by: Actor, rawInput: unknown): Promise<KirimBuktiTpuResult> {
  const refusal = writeRefusal(by, "pekerjaan_tpu.jawab", akunResource(by.accountId));
  if (refusal) return refusal;
  const parsed = pekerjaanTpuIdSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const { pekerjaanId } = parsed.data;
  const profile = await profileOfActor(deps, by);
  if (!profile) return { ok: false, reason: "tidak_ditemukan" };
  const sekarang = deps.clock.now();

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [job] = await tx.select().from(pekerjaanLayananTpu).where(eq(pekerjaanLayananTpu.id, pekerjaanId)).for("update");
    if (!job || !(await bacaPegangan(tx, pekerjaanId, profile.id))) return { ok: false as const, reason: "tidak_ditemukan" as const };
    if (job.status !== "sedang_dikerjakan" && job.status !== "terlambat") return { ok: false as const, reason: "tidak_bisa_dikirim" as const };
    const [layanan] = await tx.select({ jenis: layananLayanan.jenis }).from(layananLayanan).where(eq(layananLayanan.id, job.layananId));
    const kurang = buktiKurang(proofOf(layanan.jenis), await jenisTerambil(tx, pekerjaanId));
    if (kurang.length > 0) return { ok: false as const, reason: "bukti_kurang" as const, kurang };
    await tx
      .update(pekerjaanLayananTpu)
      .set({ status: "menunggu_verifikasi", buktiDikirimAt: sekarang, buktiDitolakAlasan: null })
      .where(eq(pekerjaanLayananTpu.id, pekerjaanId));
    await record({
      actor: { accountId: by.accountId, role: "mitra_jasa" },
      action: "layanan.kirim_bukti_tpu",
      entity: { kind: "pekerjaan_layanan_tpu", id: pekerjaanId },
      lokasiId: null,
      before: { status: job.status },
      after: { status: "menunggu_verifikasi" },
      reason: null,
    });
    return { ok: true as const, batasVerifikasi: new Date(sekarang.getTime() + BATAS_VERIFIKASI_BUKTI_JAM * JAM_MS) };
  });
}

/** What the Mitra Jasa's job screen needs about the proof: what is asked, what is taken, and why it came back. */
export interface BuktiTpuMitraJasa {
  status: (typeof pekerjaanLayananTpu.$inferSelect)["status"];
  dibutuhkan: BuktiPekerjaan[];
  terambil: { kind: BuktiPekerjaan; takenAt: Date }[];
  alasanDitolak: string | null;
}

export async function buktiTpuSaya(deps: LayananDeps, by: Actor, pekerjaanId: string): Promise<BuktiTpuMitraJasa | null> {
  if (writeRefusal(by, "pekerjaan_tpu.jawab", akunResource(by.accountId))) return null;
  const profile = await profileOfActor(deps, by);
  if (!profile || !pekerjaanTpuIdSchema.safeParse({ pekerjaanId }).success) return null;
  if (!(await bacaPegangan(deps.db, pekerjaanId, profile.id))) return null;
  const [job] = await deps.db.select().from(pekerjaanLayananTpu).where(eq(pekerjaanLayananTpu.id, pekerjaanId));
  const [layanan] = await deps.db.select({ jenis: layananLayanan.jenis }).from(layananLayanan).where(eq(layananLayanan.id, job.layananId));
  const terambil = await deps.db
    .select({ kind: pekerjaanLayananTpuBukti.kind, takenAt: pekerjaanLayananTpuBukti.takenAt })
    .from(pekerjaanLayananTpuBukti)
    .where(eq(pekerjaanLayananTpuBukti.pekerjaanId, pekerjaanId))
    .orderBy(asc(pekerjaanLayananTpuBukti.takenAt));
  return { status: job.status, dibutuhkan: jenisBuktiDibutuhkan(proofOf(layanan.jenis)), terambil, alasanDitolak: job.buktiDitolakAlasan };
}

/* ── Admin Platform decides ── */

export interface BuktiTpuStaf {
  status: (typeof pekerjaanLayananTpu.$inferSelect)["status"];
  dikirimAt: Date | null;
  /** When Admin Platform has to decide by (24 h after it was sent). */
  batasVerifikasi: Date | null;
  bukti: BuktiTpuTerbaca[];
}

/** The proof of one job, for Admin Platform's approval screen (the Mitra Jasa's own shots, whether or not approved). */
export async function buktiTpuUntukStaf(deps: LayananDeps, by: Actor, pekerjaanId: string): Promise<BuktiTpuStaf | null> {
  if (writeRefusal(by, "pekerjaan_tpu.kelola", pekerjaanTpuSemuaResource())) return null;
  if (!pekerjaanTpuIdSchema.safeParse({ pekerjaanId }).success) return null;
  const [job] = await deps.db.select().from(pekerjaanLayananTpu).where(eq(pekerjaanLayananTpu.id, pekerjaanId));
  if (!job) return null;
  const bukti = (await buktiTpuPerPekerjaan(deps, [pekerjaanId])).get(pekerjaanId) ?? [];
  return {
    status: job.status,
    dikirimAt: job.buktiDikirimAt,
    batasVerifikasi: job.buktiDikirimAt ? new Date(job.buktiDikirimAt.getTime() + BATAS_VERIFIKASI_BUKTI_JAM * JAM_MS) : null,
    bukti,
  };
}

export type SetujuiBuktiTpuResult =
  | { ok: true; dibayar: boolean }
  | Penolakan
  | { ok: false; reason: "input_tidak_valid" | "tidak_ditemukan" | "bukan_menunggu_verifikasi" | "tarif_belum_ada" | "pelaksana_tidak_ada" };

/**
 * Admin Platform approves the proof: the job is Selesai, the proof is shown to the Pemesan from this
 * moment and the Keluhan window opens. The Mitra Jasa's Pencairan is recorded (or not, or the original's
 * released or cancelled) by the pay rules in this file's header, on the same transaction.
 */
export async function setujuiBuktiTpu(deps: LayananDeps, by: Actor, rawInput: unknown): Promise<SetujuiBuktiTpuResult> {
  const refusal = writeRefusal(by, "pekerjaan_tpu.kelola", pekerjaanTpuSemuaResource());
  if (refusal) return refusal;
  const parsed = pekerjaanTpuIdSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const { pekerjaanId } = parsed.data;
  const sekarang = deps.clock.now();

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [job] = await tx.select().from(pekerjaanLayananTpu).where(eq(pekerjaanLayananTpu.id, pekerjaanId)).for("update");
    if (!job) return { ok: false as const, reason: "tidak_ditemukan" as const };
    if (job.status !== "menunggu_verifikasi") return { ok: false as const, reason: "bukan_menunggu_verifikasi" as const };
    const pelaksana = await pelaksanaOf(tx, pekerjaanId);
    if (!pelaksana) return { ok: false as const, reason: "pelaksana_tidak_ada" as const };

    let pencairanItemId: string | null = null;
    let dibayar = false;
    const asal = job.kerjaUlangDariId ? await pelaksanaDan(tx, job.kerjaUlangDariId) : null;
    const samaDenganAsal = asal !== null && asal.pelaksana?.id === pelaksana.id;
    if (!samaDenganAsal) {
      // Paid at the rate in force for the variant: the normal rate, for the first job and for a redo by another Mitra Jasa.
      const tarif = await deps.tariffs.mitraJasaRate(by, job.layananVariantId, sekarang);
      if (!tarif) return { ok: false as const, reason: "tarif_belum_ada" as const };
      const akun = await deps.identity.accountByEmail(pelaksana.email);
      if (!akun) return { ok: false as const, reason: "pelaksana_tidak_ada" as const };
      const dicatat = await deps.payouts.catatItemLayananMitraJasa(tx, {
        akunId: akun.id,
        nama: pelaksana.namaLengkap,
        lokasiId: null,
        pekerjaan: `${job.label} – ${job.tpuName}`,
        layanan: job.label,
        tanggal: job.targetDate,
        tarif: tarif.amount,
        nomorPemesanan: null,
        label: job.label,
      });
      if (!dicatat.ok) return { ok: false as const, reason: "tarif_belum_ada" as const };
      pencairanItemId = dicatat.id;
      dibayar = true;
    }

    // The redo's own approval is what settles the original's Pencairan.
    if (asal) {
      if (samaDenganAsal) {
        if (asal.job.pencairanItemId) await deps.payouts.jadikanJatuhTempo(tx, asal.job.pencairanItemId);
        await tx
          .update(pekerjaanLayananTpu)
          .set({ status: "selesai", buktiDitunjukkanAt: sekarang, pencairanJatuhTempoAt: sekarang })
          .where(eq(pekerjaanLayananTpu.id, asal.job.id));
      } else if (asal.job.pencairanItemId) {
        await deps.payouts.batalkanItem(tx, { itemId: asal.job.pencairanItemId, alasan: "diganti_pelaksana" });
      }
    }

    await tx
      .update(pekerjaanLayananTpu)
      .set({ status: "selesai", selesaiAt: sekarang, buktiDitunjukkanAt: sekarang, buktiDitolakAlasan: null, pencairanItemId })
      .where(eq(pekerjaanLayananTpu.id, pekerjaanId));
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "layanan.setujui_bukti_tpu",
      entity: { kind: "pekerjaan_layanan_tpu", id: pekerjaanId },
      lokasiId: null,
      before: { status: "menunggu_verifikasi" },
      after: { status: "selesai", mitraJasaId: pelaksana.id, dibayar, kerjaUlangDariId: job.kerjaUlangDariId },
      reason: null,
    });
    return { ok: true as const, dibayar };
  });
}

export type TolakBuktiTpuResult =
  | { ok: true }
  | Penolakan
  | { ok: false; reason: "input_tidak_valid" | "tidak_ditemukan" | "bukan_menunggu_verifikasi" };

/** Admin Platform sends the proof back with a reason: the job returns to Sedang Dikerjakan with the same Mitra Jasa. */
export async function tolakBuktiTpu(deps: LayananDeps, by: Actor, rawInput: unknown): Promise<TolakBuktiTpuResult> {
  const refusal = writeRefusal(by, "pekerjaan_tpu.kelola", pekerjaanTpuSemuaResource());
  if (refusal) return refusal;
  const parsed = tolakBuktiTpuSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const { pekerjaanId, alasan } = parsed.data;
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [job] = await tx.select().from(pekerjaanLayananTpu).where(eq(pekerjaanLayananTpu.id, pekerjaanId)).for("update");
    if (!job) return { ok: false as const, reason: "tidak_ditemukan" as const };
    if (job.status !== "menunggu_verifikasi") return { ok: false as const, reason: "bukan_menunggu_verifikasi" as const };
    await tx
      .update(pekerjaanLayananTpu)
      .set({ status: "sedang_dikerjakan", buktiDikirimAt: null, buktiDitolakAlasan: alasan })
      .where(eq(pekerjaanLayananTpu.id, pekerjaanId));
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "layanan.tolak_bukti_tpu",
      entity: { kind: "pekerjaan_layanan_tpu", id: pekerjaanId },
      lokasiId: null,
      before: { status: "menunggu_verifikasi" },
      after: { status: "sedang_dikerjakan" },
      reason: alasan,
    });
    return { ok: true as const };
  });
}

/* ── who did the job, and the redo ── */

interface Pelaksana {
  id: string;
  email: string;
  namaLengkap: string;
}

/** The Mitra Jasa who holds a job now (accepted), or, for a finished job, the one who did it. */
async function pelaksanaOf(db: Database, pekerjaanId: string): Promise<Pelaksana | null> {
  const [row] = await db
    .select({ id: layananMitraJasa.id, email: layananMitraJasa.email, namaLengkap: layananMitraJasa.namaLengkap })
    .from(pekerjaanLayananTpuPenugasan)
    .innerJoin(layananMitraJasa, eq(layananMitraJasa.id, pekerjaanLayananTpuPenugasan.mitraJasaId))
    .where(and(eq(pekerjaanLayananTpuPenugasan.pekerjaanId, pekerjaanId), eq(pekerjaanLayananTpuPenugasan.hasil, "diterima")))
    .orderBy(desc(pekerjaanLayananTpuPenugasan.ditugaskanAt))
    .limit(1);
  return row ?? null;
}

async function pelaksanaDan(db: Database, pekerjaanId: string) {
  const [job] = await db.select().from(pekerjaanLayananTpu).where(eq(pekerjaanLayananTpu.id, pekerjaanId)).for("update");
  return job ? { job, pelaksana: await pelaksanaOf(db, pekerjaanId) } : null;
}

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
export async function kerjaUlangTpu(deps: LayananDeps, by: Actor, rawInput: unknown): Promise<KerjaUlangTpuResult> {
  const refusal = writeRefusal(by, "pekerjaan_tpu.kelola", pekerjaanTpuSemuaResource());
  if (refusal) return refusal;
  const parsed = kerjaUlangTpuSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const { pekerjaanId, mitraJasaId } = parsed.data;
  const sekarang = deps.clock.now();

  const dibuat = await deps.db.transaction(async (tx) => {
    const [asal] = await tx.select().from(pekerjaanLayananTpu).where(eq(pekerjaanLayananTpu.id, pekerjaanId)).for("update");
    if (!asal) return { ok: false as const, reason: "tidak_ditemukan" as const };
    if (asal.status !== "selesai") return { ok: false as const, reason: "bukan_selesai" as const };
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
      await tx.update(pekerjaanLayananTpu).set({ status: "selesai" }).where(eq(pekerjaanLayananTpu.id, pekerjaanId));
    });
    return { ok: false, reason: tugas.reason === "mitra_jasa_tidak_tersedia" ? "mitra_jasa_tidak_tersedia" : "input_tidak_valid" };
  }
  return { ok: true, pekerjaanId: dibuat.id, penugasan: tugas };
}

/* ── the window tick and the Antrean ── */

/**
 * The Keluhan-window part of the tick for TPU jobs: a Selesai job whose proof was shown more than
 * 3×24 h ago gets its window closed, and the Pencairan its approval recorded becomes due (Payouts
 * stamps the 2 Hari Kerja deadline). Never waits for the family's payment. Idempotent.
 */
export async function tutupJendelaTpu(deps: LayananDeps, now: Date): Promise<{ ditutup: number; pencairanJatuhTempo: number }> {
  const batas = new Date(now.getTime() - JENDELA_KELUHAN_JAM * JAM_MS);
  const hasil = { ditutup: 0, pencairanJatuhTempo: 0 };
  const jobs = await deps.db
    .select()
    .from(pekerjaanLayananTpu)
    .where(and(eq(pekerjaanLayananTpu.status, "selesai"), isNotNull(pekerjaanLayananTpu.buktiDitunjukkanAt), lte(pekerjaanLayananTpu.buktiDitunjukkanAt, batas)))
    .orderBy(asc(pekerjaanLayananTpu.buktiDitunjukkanAt));
  for (const job of jobs) {
    // The window is open at its last instant, so it is over only after it.
    if (!job.buktiDitunjukkanAt || job.buktiDitunjukkanAt.getTime() >= batas.getTime()) continue;
    if (job.jendelaDitutupAt && (job.pencairanJatuhTempoAt || !job.pencairanItemId)) continue;
    try {
      await deps.db.transaction(async (tx) => {
        if (!job.jendelaDitutupAt) {
          const dipindah = await tx
            .update(pekerjaanLayananTpu)
            .set({ jendelaDitutupAt: now })
            .where(and(eq(pekerjaanLayananTpu.id, job.id), isNull(pekerjaanLayananTpu.jendelaDitutupAt)))
            .returning({ id: pekerjaanLayananTpu.id });
          hasil.ditutup += dipindah.length;
        }
        if (job.pencairanItemId && !job.pencairanJatuhTempoAt) {
          await deps.payouts.jadikanJatuhTempo(tx, job.pencairanItemId);
          await tx.update(pekerjaanLayananTpu).set({ pencairanJatuhTempoAt: now }).where(eq(pekerjaanLayananTpu.id, job.id));
          hasil.pencairanJatuhTempo += 1;
        }
      });
    } catch (error) {
      deps.reportError?.(error, { tags: { module: "layanan", event: "pencairan_tpu_jatuh_tempo_gagal", pekerjaanId: job.id } });
    }
  }
  return hasil;
}

/** A TPU job whose proof waits for Admin Platform, for the Tier 2 row. */
export interface PekerjaanTpuMenungguVerifikasi {
  id: string;
  nomor: string;
  label: string;
  tpuName: string;
  targetDate: string;
  dikirimAt: Date;
  /** 24 h after it was sent: when Admin Platform has to have decided. */
  batasVerifikasi: Date;
}

export async function pekerjaanTpuMenungguVerifikasi(db: Database): Promise<PekerjaanTpuMenungguVerifikasi[]> {
  const rows = await db
    .select()
    .from(pekerjaanLayananTpu)
    .where(and(eq(pekerjaanLayananTpu.status, "menunggu_verifikasi"), isNotNull(pekerjaanLayananTpu.buktiDikirimAt)))
    .orderBy(asc(pekerjaanLayananTpu.buktiDikirimAt));
  return rows.map((job) => ({
    id: job.id,
    nomor: job.nomor,
    label: job.label,
    tpuName: job.tpuName,
    targetDate: job.targetDate,
    dikirimAt: job.buktiDikirimAt as Date,
    batasVerifikasi: new Date((job.buktiDikirimAt as Date).getTime() + BATAS_VERIFIKASI_BUKTI_JAM * JAM_MS),
  }));
}
