/**
 * Handing a TPU job to a Mitra Jasa, and what they answer (spec, Layanan > Mitra
 * Jasa: "Hand assignment through a hard-filtered picker. Accept deadline: 12 h or H-1
 * 18:00, whichever is sooner. No answer counts as a decline (Tidak direspons)";
 * stories 176 and 178; ticket 56).
 *
 * **One rule for who may take a job.** The picker is ticket 55's `mitraJasaTersedia`
 * (Aktif, covering that TPU and that Layanan variant, not Tidak tersedia on the date),
 * and `tugaskanMitraJasa` asks that same function again inside its own transaction, so
 * a Mitra Jasa the picker would not have offered cannot be assigned by a crafted
 * request either, and there is no second copy of the filter to drift.
 *
 * **Who holds a job** is the one open row of the assignment table, never a column of
 * the job: a decline, a "Tidak direspons" and a release stay on record for the
 * scorecard when the job goes to somebody else.
 *
 * **What a Mitra Jasa may see.** `pekerjaanTpuSaya` is an explicit projection: the grave
 * as described, the Layanan, the target date and the reference photos, and **no field
 * of the family** (no name, no email, no phone number), so a family contact cannot leak
 * by adding a column to the job row. Once an assignment has ended (declined, unanswered,
 * released) the grave is no longer shown to that Mitra Jasa at all.
 */
import { and, asc, desc, eq, inArray, lte, notExists, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { Actor } from "@/domain/identity";
import { writeRefusal, akunResource, pekerjaanTpuSemuaResource } from "@/domain/identity";
import { addWibDateDays, wib, wibDateOf } from "@/lib/time/jakarta";
import type { LayananDeps } from "./deps";
import { jendelaTarget } from "./pesanan";
import { profileOfActor } from "./mitra-jasa";
import { mitraJasaTersedia, type MitraJasaTersedia } from "./penugasan";
import {
  layananMitraJasa,
  pekerjaanLayananTpu,
  pekerjaanLayananTpuPenugasan,
  type PekerjaanTpuStatus,
  type PenugasanHasil,
} from "./schema";
import { fotoUrl } from "./tpu";
import {
  jawabPenugasanSchema,
  lepasPenugasanSchema,
  tugaskanMitraJasaSchema,
} from "./tpu-skema";

/** How long a Mitra Jasa has to answer an assignment, unless H-1 18:00 comes first: 12 hours. */
export const BATAS_JAWAB_JAM = 12;

/**
 * The accept deadline of an assignment made at `ditugaskanAt` for a job due on
 * `targetDate`: **12 hours later, or H-1 18:00 WIB, whichever is sooner** (spec).
 *
 * When H-1 18:00 has already passed at the moment of assignment (a burial tomorrow,
 * assigned this evening; or the very day), "whichever is sooner" would be a deadline
 * in the past that nobody could ever meet, so it falls back to the 12-hour rule alone.
 * That is the one reading the spec leaves open, recorded in the ticket's Comments for
 * the owner to confirm.
 */
export function batasJawabPenugasan(ditugaskanAt: Date, targetDate: string): Date {
  const duaBelasJam = new Date(ditugaskanAt.getTime() + BATAS_JAWAB_JAM * 3_600_000);
  const hMinSatu = wib(`${addWibDateDays(targetDate, -1)} 18:00`);
  return hMinSatu.getTime() > ditugaskanAt.getTime() && hMinSatu.getTime() < duaBelasJam.getTime() ? hMinSatu : duaBelasJam;
}

/** The assignment that holds a job right now, if any. */
export interface PenugasanTerbuka {
  id: string;
  mitraJasaId: string;
  namaLengkap: string;
  hasil: "menunggu" | "diterima";
  ditugaskanAt: Date;
  batasJawab: Date;
}

/** One finished assignment: how it ended and why. */
export interface RiwayatPenugasan {
  id: string;
  mitraJasaId: string;
  namaLengkap: string;
  hasil: PenugasanHasil;
  ditugaskanAt: Date;
  dijawabAt: Date | null;
  alasan: string | null;
}

/** One TPU job as Admin Platform reads it: the job, the family's name (to call), who holds it and what came before. */
export interface PekerjaanTpuStaf {
  id: string;
  nomor: string;
  status: PekerjaanTpuStatus;
  label: string;
  teks: string | null;
  targetDate: string;
  tpu: { id: string; name: string; address: string };
  makam: { blokNomor: string; almarhumName: string; keterangan: string | null; adaFoto: boolean; pin: { lat: number; lng: number } | null };
  pemesanName: string;
  penugasan: PenugasanTerbuka | null;
  riwayat: RiwayatPenugasan[];
  /** Why the job is back in the queue, when no one holds it and the last assignment ended badly. */
  alasanAntre: "belum_ditugaskan" | "ditolak" | "tidak_direspons" | "dilepas";
}

/** Jobs Admin Platform still has to place or watch: every Dijadwalkan job, soonest target date first. */
export async function pekerjaanTpuUntukStaf(deps: LayananDeps, by: Actor): Promise<PekerjaanTpuStaf[]> {
  if (writeRefusal(by, "pekerjaan_tpu.kelola", pekerjaanTpuSemuaResource())) return [];
  const rows = await deps.db
    .select()
    .from(pekerjaanLayananTpu)
    .where(eq(pekerjaanLayananTpu.status, "dijadwalkan"))
    .orderBy(asc(pekerjaanLayananTpu.targetDate), asc(pekerjaanLayananTpu.createdAt), asc(pekerjaanLayananTpu.posisi));
  return stafDari(deps.db, rows);
}

export type BacaPekerjaanTpuResult =
  | { ok: true; pekerjaan: PekerjaanTpuStaf; calon: MitraJasaTersedia[] }
  | { ok: false; reason: "tidak_ditemukan" | "tidak_berwenang" | "perlu_totp" | "belum_masuk" };

/** One TPU job with the picker's candidates for it: Aktif, covering, and free on the date. */
export async function bacaPekerjaanTpu(deps: LayananDeps, by: Actor, pekerjaanId: string): Promise<BacaPekerjaanTpuResult> {
  const refusal = writeRefusal(by, "pekerjaan_tpu.kelola", pekerjaanTpuSemuaResource());
  if (refusal) return refusal;
  const [row] = await deps.db.select().from(pekerjaanLayananTpu).where(eq(pekerjaanLayananTpu.id, pekerjaanId));
  if (!row) return { ok: false, reason: "tidak_ditemukan" };
  const [pekerjaan] = await stafDari(deps.db, [row]);
  const calon = await mitraJasaTersedia(deps, by, {
    tpuDkiId: row.tpuId,
    layananVariantId: row.layananVariantId,
    tanggal: row.targetDate,
  });
  return { ok: true, pekerjaan, calon };
}

async function stafDari(db: Database, rows: (typeof pekerjaanLayananTpu.$inferSelect)[]): Promise<PekerjaanTpuStaf[]> {
  if (rows.length === 0) return [];
  const penugasan = await db
    .select({
      id: pekerjaanLayananTpuPenugasan.id,
      pekerjaanId: pekerjaanLayananTpuPenugasan.pekerjaanId,
      mitraJasaId: pekerjaanLayananTpuPenugasan.mitraJasaId,
      namaLengkap: layananMitraJasa.namaLengkap,
      hasil: pekerjaanLayananTpuPenugasan.hasil,
      ditugaskanAt: pekerjaanLayananTpuPenugasan.ditugaskanAt,
      batasJawab: pekerjaanLayananTpuPenugasan.batasJawab,
      dijawabAt: pekerjaanLayananTpuPenugasan.dijawabAt,
      alasan: pekerjaanLayananTpuPenugasan.alasan,
    })
    .from(pekerjaanLayananTpuPenugasan)
    .innerJoin(layananMitraJasa, eq(layananMitraJasa.id, pekerjaanLayananTpuPenugasan.mitraJasaId))
    .where(inArray(pekerjaanLayananTpuPenugasan.pekerjaanId, rows.map((row) => row.id)))
    .orderBy(desc(pekerjaanLayananTpuPenugasan.ditugaskanAt));
  return rows.map((row) => {
    const punyaJob = penugasan.filter((satu) => satu.pekerjaanId === row.id);
    const terbuka = punyaJob.find((satu) => satu.hasil === "menunggu" || satu.hasil === "diterima");
    const riwayat = punyaJob.filter((satu) => satu !== terbuka);
    const terakhir = riwayat[0];
    return {
      id: row.id,
      nomor: row.nomor,
      status: row.status,
      label: row.label,
      teks: row.teks,
      targetDate: row.targetDate,
      tpu: { id: row.tpuId, name: row.tpuName, address: row.tpuAddress },
      makam: {
        blokNomor: row.makam.blokNomor,
        almarhumName: row.makam.almarhumName,
        keterangan: row.makam.keterangan,
        adaFoto: row.makam.fotoKeys.length > 0,
        pin: row.makam.pin,
      },
      pemesanName: row.pemesanName,
      penugasan: terbuka
        ? {
            id: terbuka.id,
            mitraJasaId: terbuka.mitraJasaId,
            namaLengkap: terbuka.namaLengkap,
            hasil: terbuka.hasil as "menunggu" | "diterima",
            ditugaskanAt: terbuka.ditugaskanAt,
            batasJawab: terbuka.batasJawab,
          }
        : null,
      riwayat: riwayat.map((satu) => ({
        id: satu.id,
        mitraJasaId: satu.mitraJasaId,
        namaLengkap: satu.namaLengkap,
        hasil: satu.hasil,
        ditugaskanAt: satu.ditugaskanAt,
        dijawabAt: satu.dijawabAt,
        alasan: satu.alasan,
      })),
      alasanAntre: terbuka || !terakhir ? "belum_ditugaskan" : (terakhir.hasil as "ditolak" | "tidak_direspons" | "dilepas"),
    };
  });
}

export type TugaskanMitraJasaResult =
  | { ok: true; penugasanId: string; batasJawab: Date }
  | { ok: false; reason: "tidak_berwenang" | "perlu_totp" | "belum_masuk" | "input_tidak_valid" }
  | { ok: false; reason: "tidak_ditemukan" | "bukan_dijadwalkan" | "sudah_ditugaskan" | "mitra_jasa_tidak_tersedia" };

/**
 * Admin Platform hands one job to one Mitra Jasa, who then has until the accept
 * deadline to answer. The candidate must be one the picker offers **now**: checked
 * again here, against the same filter, so a Mitra Jasa suspended or marked away since
 * the page was drawn is refused. Audited in the same transaction; the Peringatan Staf
 * (web push + email, ADR 0004) goes out once it has committed.
 */
export async function tugaskanMitraJasa(deps: LayananDeps, by: Actor, rawInput: unknown): Promise<TugaskanMitraJasaResult> {
  const refusal = writeRefusal(by, "pekerjaan_tpu.kelola", pekerjaanTpuSemuaResource());
  if (refusal) return refusal;
  const parsed = tugaskanMitraJasaSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const { pekerjaanId, mitraJasaId } = parsed.data;
  const now = deps.clock.now();

  const hasil = await deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [job] = await tx.select().from(pekerjaanLayananTpu).where(eq(pekerjaanLayananTpu.id, pekerjaanId)).for("update");
    if (!job) return { ok: false as const, reason: "tidak_ditemukan" as const };
    if (job.status !== "dijadwalkan") return { ok: false as const, reason: "bukan_dijadwalkan" as const };
    const [terbuka] = await tx
      .select({ id: pekerjaanLayananTpuPenugasan.id })
      .from(pekerjaanLayananTpuPenugasan)
      .where(and(eq(pekerjaanLayananTpuPenugasan.pekerjaanId, pekerjaanId), inArray(pekerjaanLayananTpuPenugasan.hasil, ["menunggu", "diterima"])));
    if (terbuka) return { ok: false as const, reason: "sudah_ditugaskan" as const };

    // The same filter the picker showed, asked again on this transaction.
    const calon = await mitraJasaTersedia({ ...deps, db: tx }, by, {
      tpuDkiId: job.tpuId,
      layananVariantId: job.layananVariantId,
      tanggal: job.targetDate,
    });
    const dipilih = calon.find((satu) => satu.id === mitraJasaId);
    if (!dipilih) return { ok: false as const, reason: "mitra_jasa_tidak_tersedia" as const };

    const batasJawab = batasJawabPenugasan(now, job.targetDate);
    const [dibuat] = await tx
      .insert(pekerjaanLayananTpuPenugasan)
      .values({
        pekerjaanId,
        mitraJasaId,
        ditugaskanAt: now,
        batasJawab,
        hasil: "menunggu",
        ditugaskanOlehAccountId: by.accountId,
      })
      .returning({ id: pekerjaanLayananTpuPenugasan.id });
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "layanan.tugaskan_pekerjaan_tpu",
      entity: { kind: "pekerjaan_layanan_tpu", id: pekerjaanId },
      lokasiId: null,
      before: null,
      // Ids only: a Mitra Jasa's name and email are personal data that never enter the Audit Log in plaintext.
      after: { mitraJasaId, penugasanId: dibuat.id, targetDate: job.targetDate, batasJawab: batasJawab.toISOString() },
      reason: null,
    });
    return { ok: true as const, penugasanId: dibuat.id, batasJawab, email: dipilih.email, label: job.label, tpuName: job.tpuName, targetDate: job.targetDate };
  });
  if (!hasil.ok) return hasil;

  await deps.notifikasi.pekerjaanTpuDitugaskan({
    pekerjaanId,
    mitraJasaEmail: hasil.email,
    label: hasil.label,
    tpuName: hasil.tpuName,
    targetDate: hasil.targetDate,
    batasJawab: hasil.batasJawab,
  });
  return { ok: true, penugasanId: hasil.penugasanId, batasJawab: hasil.batasJawab };
}

export type LepasPenugasanResult =
  | { ok: true }
  | { ok: false; reason: "tidak_berwenang" | "perlu_totp" | "belum_masuk" | "input_tidak_valid" | "tidak_ditemukan" | "tidak_ada_penugasan" };

/**
 * Admin Platform takes a job off the Mitra Jasa who holds it (flagged for
 * reassignment): the assignment ends as `dilepas` with the reason, the job stays
 * Dijadwalkan and reappears in the Antrean as "perlu penugasan ulang". Nothing is
 * counted against the Mitra Jasa's scorecard: a release is not a decline. Only the
 * Mitra Jasa who then does the job is paid (spec; ticket 57 enforces it). Audited.
 */
export async function lepasPenugasan(deps: LayananDeps, by: Actor, rawInput: unknown): Promise<LepasPenugasanResult> {
  const refusal = writeRefusal(by, "pekerjaan_tpu.kelola", pekerjaanTpuSemuaResource());
  if (refusal) return refusal;
  const parsed = lepasPenugasanSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const { pekerjaanId, alasan } = parsed.data;
  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [job] = await tx.select({ id: pekerjaanLayananTpu.id }).from(pekerjaanLayananTpu).where(eq(pekerjaanLayananTpu.id, pekerjaanId)).for("update");
    if (!job) return { ok: false as const, reason: "tidak_ditemukan" as const };
    const [terbuka] = await tx
      .select()
      .from(pekerjaanLayananTpuPenugasan)
      .where(and(eq(pekerjaanLayananTpuPenugasan.pekerjaanId, pekerjaanId), inArray(pekerjaanLayananTpuPenugasan.hasil, ["menunggu", "diterima"])));
    if (!terbuka) return { ok: false as const, reason: "tidak_ada_penugasan" as const };
    await tx
      .update(pekerjaanLayananTpuPenugasan)
      .set({ hasil: "dilepas", dijawabAt: now, alasan })
      .where(eq(pekerjaanLayananTpuPenugasan.id, terbuka.id));
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "layanan.lepas_penugasan_tpu",
      entity: { kind: "pekerjaan_layanan_tpu", id: pekerjaanId },
      lokasiId: null,
      before: { penugasanId: terbuka.id, mitraJasaId: terbuka.mitraJasaId, hasil: terbuka.hasil },
      after: { penugasanId: terbuka.id, hasil: "dilepas" },
      reason: alasan,
    });
    return { ok: true as const };
  });
}

export type JawabPenugasanResult =
  | { ok: true; hasil: "diterima" | "ditolak" }
  | { ok: false; reason: "tidak_berwenang" | "perlu_totp" | "belum_masuk" | "input_tidak_valid" | "tidak_ditemukan" | "sudah_dijawab" | "lewat_batas" };

/**
 * The Mitra Jasa accepts or declines the job assigned to them, in the app, by the
 * accept deadline. After the deadline the answer is refused: the assignment already
 * counts as Tidak direspons (the tick marks it) and the job is back with Admin
 * Platform. Only the assignment's own Mitra Jasa can answer it. Audited.
 */
export async function jawabPenugasan(deps: LayananDeps, by: Actor, rawInput: unknown): Promise<JawabPenugasanResult> {
  const refusal = writeRefusal(by, "pekerjaan_tpu.jawab", akunResource(by.accountId));
  if (refusal) return refusal;
  const parsed = jawabPenugasanSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const { pekerjaanId, jawaban, alasan } = parsed.data;
  const profile = await profileOfActor(deps, by);
  if (!profile) return { ok: false, reason: "tidak_ditemukan" };
  const now = deps.clock.now();

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    // Locked on the job, not on the assignment: the tick and a release write the same row.
    await tx.select({ id: pekerjaanLayananTpu.id }).from(pekerjaanLayananTpu).where(eq(pekerjaanLayananTpu.id, pekerjaanId)).for("update");
    const [terbuka] = await tx
      .select()
      .from(pekerjaanLayananTpuPenugasan)
      .where(
        and(
          eq(pekerjaanLayananTpuPenugasan.pekerjaanId, pekerjaanId),
          eq(pekerjaanLayananTpuPenugasan.mitraJasaId, profile.id),
          inArray(pekerjaanLayananTpuPenugasan.hasil, ["menunggu", "diterima"]),
        ),
      );
    if (!terbuka) return { ok: false as const, reason: "tidak_ditemukan" as const };
    if (terbuka.hasil !== "menunggu") return { ok: false as const, reason: "sudah_dijawab" as const };
    if (now.getTime() > terbuka.batasJawab.getTime()) return { ok: false as const, reason: "lewat_batas" as const };

    const hasil = jawaban === "terima" ? ("diterima" as const) : ("ditolak" as const);
    await tx
      .update(pekerjaanLayananTpuPenugasan)
      .set({ hasil, dijawabAt: now, alasan: jawaban === "tolak" ? alasan : null })
      .where(eq(pekerjaanLayananTpuPenugasan.id, terbuka.id));
    await record({
      actor: { accountId: by.accountId, role: "mitra_jasa" },
      action: "layanan.jawab_penugasan_tpu",
      entity: { kind: "pekerjaan_layanan_tpu", id: pekerjaanId },
      lokasiId: null,
      before: { penugasanId: terbuka.id, hasil: "menunggu" },
      after: { penugasanId: terbuka.id, hasil },
      reason: jawaban === "tolak" ? alasan : null,
    });
    return { ok: true as const, hasil };
  });
}

/**
 * The tick: an assignment still unanswered at its accept deadline becomes "Tidak
 * direspons" (a decline, on the scorecard) and the job returns to the queue for
 * Admin Platform. Idempotent, as every tick is: it matches on the `menunggu` status,
 * so a second run for the same `now` changes nothing. The moment recorded is the
 * deadline itself, not the tick's, so the scorecard window is measured from when the
 * Mitra Jasa ran out of time. Returns how many it marked.
 */
export async function tandaiTidakDirespons(db: Database, now: Date): Promise<number> {
  const ditandai = await db
    .update(pekerjaanLayananTpuPenugasan)
    .set({ hasil: "tidak_direspons", dijawabAt: sql`${pekerjaanLayananTpuPenugasan.batasJawab}` })
    .where(and(eq(pekerjaanLayananTpuPenugasan.hasil, "menunggu"), lte(pekerjaanLayananTpuPenugasan.batasJawab, now)))
    .returning({ id: pekerjaanLayananTpuPenugasan.id });
  return ditandai.length;
}

/* ── what a Mitra Jasa reads ── */

/** One job as the Mitra Jasa it is assigned to sees it: the grave, the Layanan, the date and the photos. Never the family. */
export interface PekerjaanTpuMitraJasa {
  id: string;
  label: string;
  teks: string | null;
  targetDate: string;
  jendela: { dari: string; sampai: string };
  tpu: { name: string; address: string };
  makam: { blokNomor: string; almarhumName: string; keterangan: string | null; pin: { lat: number; lng: number } | null; fotoUrls: string[] };
  penugasan: { hasil: "menunggu" | "diterima"; ditugaskanAt: Date; batasJawab: Date };
}

/** An assignment that has ended, as its Mitra Jasa remembers it: no grave, no family. */
export interface RiwayatPekerjaanMitraJasa {
  id: string;
  label: string;
  targetDate: string;
  tpuName: string;
  hasil: Exclude<PenugasanHasil, "menunggu" | "diterima">;
  dijawabAt: Date | null;
}

export interface PekerjaanTpuSaya {
  aktif: PekerjaanTpuMitraJasa[];
  riwayat: RiwayatPekerjaanMitraJasa[];
}

/**
 * The jobs handed to the signed-in Mitra Jasa. Any status reads it (a suspended or
 * ended one still sees what they hold and their history, story 182). Empty for anyone
 * who is not a Mitra Jasa.
 */
export async function pekerjaanTpuSaya(deps: LayananDeps, by: Actor): Promise<PekerjaanTpuSaya> {
  const kosong: PekerjaanTpuSaya = { aktif: [], riwayat: [] };
  if (writeRefusal(by, "pekerjaan_tpu.jawab", akunResource(by.accountId))) return kosong;
  const profile = await profileOfActor(deps, by);
  if (!profile) return kosong;
  const rows = await deps.db
    .select({ penugasan: pekerjaanLayananTpuPenugasan, job: pekerjaanLayananTpu })
    .from(pekerjaanLayananTpuPenugasan)
    .innerJoin(pekerjaanLayananTpu, eq(pekerjaanLayananTpu.id, pekerjaanLayananTpuPenugasan.pekerjaanId))
    .where(eq(pekerjaanLayananTpuPenugasan.mitraJasaId, profile.id))
    .orderBy(asc(pekerjaanLayananTpu.targetDate), desc(pekerjaanLayananTpuPenugasan.ditugaskanAt));

  const aktif: PekerjaanTpuMitraJasa[] = [];
  const riwayat: RiwayatPekerjaanMitraJasa[] = [];
  for (const { penugasan, job } of rows) {
    if (penugasan.hasil === "menunggu" || penugasan.hasil === "diterima") {
      aktif.push({
        id: job.id,
        label: job.label,
        teks: job.teks,
        targetDate: job.targetDate,
        jendela: jendelaTarget(job.targetDate),
        tpu: { name: job.tpuName, address: job.tpuAddress },
        makam: {
          blokNomor: job.makam.blokNomor,
          almarhumName: job.makam.almarhumName,
          keterangan: job.makam.keterangan,
          pin: job.makam.pin,
          fotoUrls: (await Promise.all(job.makam.fotoKeys.map((key) => fotoUrl(deps, key)))).filter((url): url is string => url !== null),
        },
        penugasan: { hasil: penugasan.hasil, ditugaskanAt: penugasan.ditugaskanAt, batasJawab: penugasan.batasJawab },
      });
    } else {
      riwayat.push({ id: job.id, label: job.label, targetDate: job.targetDate, tpuName: job.tpuName, hasil: penugasan.hasil, dijawabAt: penugasan.dijawabAt });
    }
  }
  return { aktif, riwayat };
}

/* ── the Antrean's two projections ── */

/** One TPU job the Antrean's rows point at. */
export interface PekerjaanTpuAntrean {
  id: string;
  nomor: string;
  label: string;
  tpuName: string;
  targetDate: string;
  /** Why a Tier 2 row exists; a Tier 1 row is always "belum_diterima". */
  alasan: "belum_diterima" | "ditolak" | "tidak_direspons" | "dilepas";
}

/**
 * Tier 1: jobs due today (or already past their date) with no Mitra Jasa who has
 * **accepted** them: nobody, or one who has not answered yet. It closes by state the
 * moment a Mitra Jasa accepts, or the job is done or cancelled.
 */
export async function pekerjaanTpuHariIniTanpaMitra(db: Database, now: Date): Promise<PekerjaanTpuAntrean[]> {
  const rows = await db
    .select()
    .from(pekerjaanLayananTpu)
    .where(
      and(
        eq(pekerjaanLayananTpu.status, "dijadwalkan"),
        lte(pekerjaanLayananTpu.targetDate, wibDateOf(now)),
        notExists(
          db
            .select({ satu: pekerjaanLayananTpuPenugasan.id })
            .from(pekerjaanLayananTpuPenugasan)
            .where(and(eq(pekerjaanLayananTpuPenugasan.pekerjaanId, pekerjaanLayananTpu.id), eq(pekerjaanLayananTpuPenugasan.hasil, "diterima"))),
        ),
      ),
    )
    .orderBy(asc(pekerjaanLayananTpu.targetDate), asc(pekerjaanLayananTpu.createdAt));
  return rows.map((job) => ({ id: job.id, nomor: job.nomor, label: job.label, tpuName: job.tpuName, targetDate: job.targetDate, alasan: "belum_diterima" as const }));
}

/**
 * Tier 2: jobs back in the queue that nobody holds because the last assignment ended
 * as Tidak direspons, Ditolak, or was released for reassignment. A job never assigned
 * at all is not here (that is new work, and Tier 1 picks it up on its day); it closes
 * the moment Admin Platform assigns it again.
 */
export async function pekerjaanTpuPerluTindakan(db: Database): Promise<PekerjaanTpuAntrean[]> {
  const rows = await db
    .select()
    .from(pekerjaanLayananTpu)
    .where(
      and(
        eq(pekerjaanLayananTpu.status, "dijadwalkan"),
        notExists(
          db
            .select({ satu: pekerjaanLayananTpuPenugasan.id })
            .from(pekerjaanLayananTpuPenugasan)
            .where(and(eq(pekerjaanLayananTpuPenugasan.pekerjaanId, pekerjaanLayananTpu.id), inArray(pekerjaanLayananTpuPenugasan.hasil, ["menunggu", "diterima"]))),
        ),
      ),
    )
    .orderBy(asc(pekerjaanLayananTpu.targetDate), asc(pekerjaanLayananTpu.createdAt));
  if (rows.length === 0) return [];
  const riwayat = await db
    .select({ pekerjaanId: pekerjaanLayananTpuPenugasan.pekerjaanId, hasil: pekerjaanLayananTpuPenugasan.hasil })
    .from(pekerjaanLayananTpuPenugasan)
    .where(inArray(pekerjaanLayananTpuPenugasan.pekerjaanId, rows.map((row) => row.id)))
    .orderBy(desc(pekerjaanLayananTpuPenugasan.ditugaskanAt));
  const hasil: PekerjaanTpuAntrean[] = [];
  for (const job of rows) {
    const terakhir = riwayat.find((satu) => satu.pekerjaanId === job.id);
    if (!terakhir) continue;
    hasil.push({
      id: job.id,
      nomor: job.nomor,
      label: job.label,
      tpuName: job.tpuName,
      targetDate: job.targetDate,
      alasan: terakhir.hasil as "ditolak" | "tidak_direspons" | "dilepas",
    });
  }
  return hasil;
}

