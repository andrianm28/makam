/**
 * Fulfilling a job at a Lokasi Mitra (spec, Layanan > Pekerjaan Layanan;
 * CONTEXT.md "Pekerjaan Layanan": one Layanan carried out at one Petak Makam on
 * one target date, by the Admin Lokasi at a Lokasi Mitra).
 *
 * The Admin Lokasi works down the Antrean Lokasi's rows and does three things to a
 * job, in this order and no other: **Mulai** (it is being worked on now),
 * **Unggah bukti** (the in-app camera captures what the Layanan's own kind
 * requires), and **Selesai** — which is refused until every one of those proofs is
 * there. That last refusal is the whole point of the proof: a job the Admin Lokasi
 * declares done without the photos a family is entitled to see is not done.
 *
 * The Terlambat flag is derived, never asserted: a job two days past its target
 * date with no completion is Terlambat (spec, Pekerjaan Layanan), and the tick
 * that sets it is idempotent and reads "now" from the Clock like every other.
 */
import { and, asc, eq, inArray, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { wibDateOf } from "@/lib/time/jakarta";
import {
  buktiKurang,
  buktiUntukPekerjaan,
  jenisBuktiDibutuhkan,
  simpanBukti,
  type BuktiTerbaca,
  type SimpanBuktiResult,
} from "./bukti";
import type { LayananDeps } from "./deps";
import { katalog, proofOf, type ProofRequirement } from "./katalog";
import { mulaiPekerjaanSchema } from "./pesanan-schema";
import { pesananLayanan, pesananLayananItem, pekerjaanLayanan, type BuktiPekerjaan, type PekerjaanLayananStatus } from "./schema";

/** How many days after its target date a job with no proof is Terlambat (spec, Pekerjaan Layanan). */
export const HARI_TERLAMBAT = 2;

/** The statuses a job is still open in, and therefore still on a Lokasi's list. */
const BUKA: readonly PekerjaanLayananStatus[] = ["menunggu_pembayaran", "dijadwalkan", "sedang_dikerjakan", "terlambat"];

/** The statuses the fulfiller may start a job from. */
const BISA_DIMULAI: readonly PekerjaanLayananStatus[] = ["dijadwalkan", "terlambat"];

/** The statuses a job may be finished from: waiting, already started, or already flagged late. */
const BISA_SELESAI: readonly PekerjaanLayananStatus[] = ["dijadwalkan", "sedang_dikerjakan", "terlambat"];

/** The proof of a Layanan whose kind is not in the catalog, which cannot happen for a placed order. */
const BUKTI_DEFAULT: ProofRequirement = { fotoSesudah: true, fotoSebelum: false, video: false };

/** One job as its own Lokasi's staff read it, to do the work. */
export interface PekerjaanUntukStaf {
  id: string;
  status: PekerjaanLayananStatus;
  /** The WIB date the family asked for, and the ±2 days the work may be done in. */
  targetDate: string;
  /** The last day the work may be finished without being late: the target date + 2. */
  batasTerlambat: string;
  /** True once the Terlambat tick flagged it, whatever state it is in since. */
  terlambat: boolean;
  /**
   * True when this job is held because this grave's Hak Pakai is still flagged Perlu
   * Verifikasi, so the Admin Lokasi has to complete it before the job can be
   * scheduled (AC 1). Read only for a job that is still waiting, because a job that
   * has moved on is not held by anything.
   */
  hakPakaiPerluVerifikasi: boolean;
  mulaiAt: Date | null;
  /** What this job has to show, derived from the Layanan's own kind, and what is still missing. */
  harusBukti: ProofRequirement;
  /** The proofs this job has to carry, in the order they are taken — computed here, so the screen is handed its list. */
  dibutuhkan: BuktiPekerjaan[];
  kurang: BuktiPekerjaan[];
  bukti: BuktiTerbaca[];
  /** The order it belongs to, and the Layanan as the family wrote it. */
  pesanan: { nomor: string; label: string; teks: string | null; amount: number };
  /** The grave: the Lokasi Mitra's own name for it, so the fulfiller can walk to it. */
  lokasi: { id: string; name: string };
  petak: { id: string; nomor: string };
  /** The family to call if something at the grave does not add up. */
  pemesan: { name: string; phoneNumber: string; email: string };
}

export type BacaPekerjaanResult = { ok: true; pekerjaan: PekerjaanUntukStaf } | WriteRefusal | { ok: false; reason: "tidak_ditemukan" | "input_tidak_valid" };

/** One job as staff read it, or null for a job that is not there at all. */
export async function pekerjaanUntukStaf(deps: LayananDeps, by: Actor, rawInput: unknown): Promise<BacaPekerjaanResult> {
  const parsed = z.object({ pekerjaanId: z.uuid() }).safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const { pekerjaanId } = parsed.data;
  // The row is read first so the guard can be made against the Lokasi Mitra the
  // job is really at: a staff member of another Lokasi is refused, and a job of
  // no Lokasi is simply not found.
  const pekerjaan = await baca(deps, pekerjaanId);
  if (!pekerjaan) return { ok: false, reason: "tidak_ditemukan" };
  const refusal = writeRefusal(by, "layanan.lihat_staf", lokasiMitraResource(pekerjaan.lokasi.id));
  if (refusal) return refusal;
  return { ok: true, pekerjaan };
}

/** Every open job of one Lokasi Mitra, soonest deadline first: the Antrean Lokasi works down this. */
export async function pekerjaanUntukStafTerbaru(deps: LayananDeps, by: Actor, lokasiId: string): Promise<PekerjaanUntukStaf[]> {
  const refusal = writeRefusal(by, "layanan.lihat_staf", lokasiMitraResource(lokasiId));
  if (refusal) return [];
  if (!z.uuid().safeParse(lokasiId).success) return [];
  const rows = await deps.db
    .select({ id: pekerjaanLayanan.id })
    .from(pekerjaanLayanan)
    .where(and(eq(pekerjaanLayanan.lokasiId, lokasiId), inArray(pekerjaanLayanan.status, BUKA)))
    .orderBy(asc(pekerjaanLayanan.targetDate), asc(pekerjaanLayanan.createdAt));
  const dibaca = await Promise.all(rows.map((row) => baca(deps, row.id)));
  return dibaca.filter((satu): satu is PekerjaanUntukStaf => satu !== null);
}

export type MulaiPekerjaanResult =
  | { ok: true; status: "sedang_dikerjakan" }
  | WriteRefusal
  | { ok: false; reason: "tidak_ditemukan" | "input_tidak_valid" | "sudah_dikerjakan" | "belum_dijadwalkan" | "sudah_dibatalkan" };

/**
 * The Admin Lokasi starts a job: Sedang Dikerjakan, from the moment it started.
 * Only a job that is Dijadwalkan (or already Terlambat) can be started; one still
 * waiting for its Tagihan cannot, and one already Selesai or Dibatalkan is left
 * exactly as it is.
 */
export async function mulaiPekerjaan(deps: LayananDeps, by: Actor, rawInput: unknown): Promise<MulaiPekerjaanResult> {
  const parsed = mulaiPekerjaanSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const { pekerjaanId } = parsed.data;
  const refusal = await tulisRefusal(deps, by, "layanan.kerjakan", pekerjaanId);
  if (refusal) return refusal;
  const now = deps.clock.now();
  const moved = await deps.db
    .update(pekerjaanLayanan)
    .set({ status: "sedang_dikerjakan", mulaiAt: now })
    .where(and(eq(pekerjaanLayanan.id, pekerjaanId), inArray(pekerjaanLayanan.status, BISA_DIMULAI)))
    .returning({ id: pekerjaanLayanan.id });
  if (moved.length > 0) return { ok: true, status: "sedang_dikerjakan" };
  const sekarang = await statusOf(deps, pekerjaanId);
  if (sekarang === null) return { ok: false, reason: "tidak_ditemukan" };
  if (sekarang === "sedang_dikerjakan" || sekarang === "selesai" || sekarang === "keluhan") return { ok: false, reason: "sudah_dikerjakan" };
  if (sekarang === "dibatalkan") return { ok: false, reason: "sudah_dibatalkan" };
  return { ok: false, reason: "belum_dijadwalkan" };
}

export type UnggahBuktiResult = SimpanBuktiResult | WriteRefusal | { ok: false; reason: "tidak_ditemukan" | "sudah_selesai" };

/**
 * The Admin Lokasi captures a proof in the app: the file goes to the private
 * FileStore under the job and the kind, stamped with the moment the camera took
 * it, and re-capturing a kind replaces the one it replaces.
 *
 * A job that is already Selesai takes no more proof — the family has been sent
 * the link to what it had.
 */
export async function unggahBuktiPekerjaan(deps: LayananDeps, by: Actor, rawInput: unknown): Promise<UnggahBuktiResult> {
  const parsed = z.object({ pekerjaanId: z.uuid() }).safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "berkas_tidak_didukung" };
  const { pekerjaanId } = parsed.data;
  const refusal = await tulisRefusal(deps, by, "layanan.kerjakan", pekerjaanId);
  if (refusal) return refusal;
  const status = await statusOf(deps, pekerjaanId);
  if (status === null) return { ok: false, reason: "tidak_ditemukan" };
  if (status === "selesai" || status === "dibatalkan") return { ok: false, reason: "sudah_selesai" };
  return simpanBukti(deps, pekerjaanId, by.accountId, rawInput);
}

export type SelesaikanPekerjaanResult =
  | { ok: true; status: "selesai"; bukti: BuktiTerbaca[] }
  | WriteRefusal
  | { ok: false; reason: "tidak_ditemukan" | "input_tidak_valid" | "belum_dijadwalkan" | "sudah_dibatalkan" | "bukti_belum_lengkap"; kurang?: BuktiPekerjaan[] };

/**
 * The Admin Lokasi marks a job Selesai, and the Pemesan is sent the link to its
 * proof. Refused until every proof the Layanan's kind requires is there: the photo
 * after is never optional, a photo before is required for a Pembersihan Makam and
 * a Perawatan Rumput & Taman, and a video for a Laporan Foto/Video.
 */
export async function selesaikanPekerjaan(deps: LayananDeps, by: Actor, rawInput: unknown): Promise<SelesaikanPekerjaanResult> {
  const parsed = mulaiPekerjaanSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const { pekerjaanId } = parsed.data;
  const refusal = await tulisRefusal(deps, by, "layanan.kerjakan", pekerjaanId);
  if (refusal) return refusal;
  const pekerjaan = await baca(deps, pekerjaanId);
  if (!pekerjaan) return { ok: false, reason: "tidak_ditemukan" };
  if (pekerjaan.status === "dibatalkan") return { ok: false, reason: "sudah_dibatalkan" };
  if (!BISA_SELESAI.includes(pekerjaan.status)) return { ok: false, reason: "belum_dijadwalkan" };

  const kurang = buktiKurang(pekerjaan.harusBukti, pekerjaan.bukti.map((satu) => satu.kind));
  if (kurang.length > 0) return { ok: false, reason: "bukti_belum_lengkap", kurang };

  const now = deps.clock.now();
  await deps.db
    .update(pekerjaanLayanan)
    .set({ status: "selesai", selesaiAt: now, mulaiAt: pekerjaan.mulaiAt ?? now })
    .where(and(eq(pekerjaanLayanan.id, pekerjaanId), inArray(pekerjaanLayanan.status, BISA_SELESAI)));

  // The proof link is what the family is sent, and the family is always the
  // Pemesan: they paid, whoever put the order in.
  await deps.notifikasi.pekerjaanSelesai({
    pekerjaanId,
    nomor: pekerjaan.pesanan.nomor,
    email: pekerjaan.pemesan.email,
    pemesanName: pekerjaan.pemesan.name,
    lokasi: pekerjaan.lokasi,
    petak: { nomor: pekerjaan.petak.nomor },
    label: pekerjaan.pesanan.label,
    selesaiAt: now,
    bukti: pekerjaan.bukti.map((satu) => ({ kind: satu.kind, url: satu.url })),
  });
  return { ok: true, status: "selesai", bukti: pekerjaan.bukti };
}

/** One late job, as the Tier 2 row names it. */
export interface TerlambatTerbaca {
  id: string;
  lokasi: { id: string; name: string };
  pesanan: string;
  petak: string;
  targetDate: string;
  /** When the tick first flagged it, or null while it is not flagged. */
  terlambatAt: Date | null;
}

/**
 * The Terlambat tick: every job still open whose target date is at least
 * `HARI_TERLAMBAT` days past and that is not finished becomes Terlambat and is
 * stamped with the moment it was noticed. Idempotent, and it never touches a job
 * that is Selesai or Dibatalkan, so a job that finishes late keeps its stamp.
 *
 * The stamp is why the flag and the status are both kept: a cancellation reads
 * the stamp to tell a lateness cancellation (a full refund) from a family's own
 * (the platform fee kept).
 */
export async function tandaiTerlambat(db: LayananDeps["db"], now: Date): Promise<number> {
  const batas = geserWib(wibDateOf(now), -HARI_TERLAMBAT);
  const flagged = await db
    .update(pekerjaanLayanan)
    .set({ status: "terlambat", terlambatAt: now })
    .where(
      and(
        inArray(pekerjaanLayanan.status, ["dijadwalkan", "sedang_dikerjakan"]),
        lte(pekerjaanLayanan.targetDate, batas),
        isNull(pekerjaanLayanan.selesaiAt),
      ),
    )
    .returning({ id: pekerjaanLayanan.id });
  return flagged.length;
}

/** Every job that is Terlambat, oldest target date first: the Tier 2 row's list. */
export async function pekerjaanTerlambat(deps: LayananDeps): Promise<TerlambatTerbaca[]> {
  const rows = await deps.db
    .select({
      id: pekerjaanLayanan.id,
      lokasiId: pekerjaanLayanan.lokasiId,
      targetDate: pekerjaanLayanan.targetDate,
      terlambatAt: pekerjaanLayanan.terlambatAt,
      pesananNomor: pesananLayanan.nomor,
      petakNomor: pesananLayanan.petakNomor,
      lokasiName: pesananLayanan.lokasiName,
    })
    .from(pekerjaanLayanan)
    .innerJoin(pesananLayanan, eq(pesananLayanan.id, pekerjaanLayanan.pesananId))
    .where(eq(pekerjaanLayanan.status, "terlambat"))
    .orderBy(asc(pekerjaanLayanan.targetDate), asc(pekerjaanLayanan.createdAt));
  return rows.map((row) => ({
    id: row.id,
    lokasi: { id: row.lokasiId, name: row.lokasiName },
    pesanan: row.pesananNomor,
    petak: row.petakNomor,
    targetDate: row.targetDate,
    terlambatAt: row.terlambatAt,
  }));
}

/** A WIB calendar date `hari` days from `tanggal`, without depending on the host's time zone. */
const geserWib = (tanggal: string, hari: number): string => wibDateOf(new Date(new Date(`${tanggal}T00:00:00+07:00`).getTime() + hari * 86_400_000));

/** The last day a job may be finished without being late: its target date + 2. */
export const batasTerlambat = (targetDate: string): string => geserWib(targetDate, HARI_TERLAMBAT);

/** The ±2 days around a target date: the window the work may be done in. */
export const jendelaKerja = (targetDate: string): { dari: string; sampai: string } => ({ dari: geserWib(targetDate, -HARI_TERLAMBAT), sampai: geserWib(targetDate, HARI_TERLAMBAT) });

/** Whether a job's target date is at least `HARI_TERLAMBAT` days past, at `now`. */
export function sudahLewatBatas(targetDate: string, now: Date): boolean {
  return targetDate <= geserWib(wibDateOf(now), -HARI_TERLAMBAT);
}

/** The status of a job, or null when there is no such job. */
async function statusOf(deps: LayananDeps, pekerjaanId: string): Promise<PekerjaanLayananStatus | null> {
  if (!z.uuid().safeParse(pekerjaanId).success) return null;
  const [row] = await deps.db.select({ status: pekerjaanLayanan.status }).from(pekerjaanLayanan).where(eq(pekerjaanLayanan.id, pekerjaanId));
  return row?.status ?? null;
}

/** The write guard, made against the Lokasi Mitra the job is really at. */
async function tulisRefusal(deps: LayananDeps, by: Actor, action: "layanan.kerjakan", pekerjaanId: string): Promise<WriteRefusal | null> {
  const [row] = await deps.db
    .select({ lokasiId: pekerjaanLayanan.lokasiId })
    .from(pekerjaanLayanan)
    .where(eq(pekerjaanLayanan.id, pekerjaanId));
  if (!row) return null;
  return writeRefusal(by, action, lokasiMitraResource(row.lokasiId));
}

/** One job as staff read it, with everything the fulfiller needs, or null. */
async function baca(deps: LayananDeps, pekerjaanId: string): Promise<PekerjaanUntukStaf | null> {
  if (!z.uuid().safeParse(pekerjaanId).success) return null;
  const [row] = await deps.db
    .select({ job: pekerjaanLayanan, order: pesananLayanan, item: pesananLayananItem })
    .from(pekerjaanLayanan)
    .innerJoin(pesananLayanan, eq(pesananLayanan.id, pekerjaanLayanan.pesananId))
    .innerJoin(pesananLayananItem, eq(pesananLayananItem.id, pekerjaanLayanan.pesananItemId))
    .where(eq(pekerjaanLayanan.id, pekerjaanId));
  if (!row) return null;
  const entry = (await katalog(deps.db)).find((satu) => satu.id === row.item.layananId);
  const harusBukti = entry ? proofOf(entry.jenis) : BUKTI_DEFAULT;
  const bukti = await buktiUntukPekerjaan(deps, row.job.id);
  // Only a job the gate is holding needs the grave's right read, so the Lokasi's
  // whole list does not pay for a read per row that cannot be held.
  const hakPakai = row.job.status === "menunggu_pembayaran" ? await deps.inventory.hakPakaiOfUnit({ petakId: row.job.petakId }) : null;
  return {
    id: row.job.id,
    status: row.job.status,
    targetDate: row.job.targetDate,
    batasTerlambat: batasTerlambat(row.job.targetDate),
    terlambat: row.job.terlambatAt !== null,
    hakPakaiPerluVerifikasi: hakPakai?.perluVerifikasi ?? false,
    mulaiAt: row.job.mulaiAt,
    harusBukti,
    dibutuhkan: jenisBuktiDibutuhkan(harusBukti),
    kurang: buktiKurang(harusBukti, bukti.map((satu) => satu.kind)),
    bukti,
    pesanan: { nomor: row.order.nomor, label: row.item.label, teks: row.item.teks, amount: row.item.amount },
    lokasi: { id: row.job.lokasiId, name: row.order.lokasiName },
    petak: { id: row.job.petakId, nomor: row.order.petakNomor },
    pemesan: { name: row.order.pemesanName, phoneNumber: row.order.pemesanPhone, email: row.order.pemesanEmail },
  };
}
