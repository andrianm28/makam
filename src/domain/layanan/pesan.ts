/**
 * The message thread of one Pekerjaan Layanan (spec, "Message thread per Pekerjaan
 * Layanan (text + photos). Each new message notifies the Pemesan by email with a
 * reply link. It closes when the Keluhan window ends. Admin Platform can read and
 * post."; stories 96, 131, 171, 180; ticket 52).
 *
 * **Who is in the room.** A thread belongs to one job and is read and written by
 * exactly three parties: the Pemesan who ordered it, the fulfiller of that job — the
 * Admin Lokasi of the Lokasi Mitra for a Petak Makam job, the Mitra Jasa holding the
 * open assignment for a TPU job — and Admin Platform, who may read and join every
 * thread. Nobody else may even read it.
 *
 * **Where the words stay.** The thread is the record: a message's text and photos live
 * here (the photos as private FileStore keys, shown only by a short-lived signed URL).
 * The Pemesan is told a message arrived, never what it says. A Mitra Jasa is never told
 * the Pemesan's phone number or email, and the Pemesan sees a Mitra Jasa as a first name
 * and a photo: the reader's view of a name is lowered to a first name for those two
 * parties, whatever is stored.
 *
 * **When it closes.** A job's Keluhan window is 3×24 h from the proof being shown; the
 * window-close tick stamps `jendela_ditutup_at` (ticket 51, and ticket 57 for a TPU
 * job). A thread whose job carries that stamp is read-only: the conversation ended with
 * the job.
 */
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { normaliseEmail, type Actor } from "@/domain/identity";
import { documentExtension, type DocumentContentType } from "@/lib/files/document-type";
import type { LayananDeps, PemesanLayanan } from "./deps";
import { profileOfActor } from "./mitra-jasa";
import { PESAN_FOTO_MAX_BYTES, PESAN_LAMPIRAN_TYPES, PESAN_URL_SECONDS, kirimPesanSchema } from "./pesan-skema";
import { namaDepan } from "./tpu";
import {
  layananMitraJasa,
  pekerjaanLayanan,
  pekerjaanLayananPesan,
  pekerjaanLayananPesanLampiran,
  pekerjaanLayananTpu,
  pekerjaanLayananTpuPenugasan,
  pesananLayanan,
  pesananLayananItem,
  type PesanJenis,
  type PesanPeran,
} from "./schema";

/** One job a thread may hang on, as this module needs it. */
interface JobRingkas {
  jenis: PesanJenis;
  id: string;
  nomor: string;
  label: string;
  pemesanAccountId: string | null;
  pemesanNama: string;
  pemesanEmail: string | null;
  /** Where the job is, as the family knows it: the Lokasi Mitra's name, or the TPU's. */
  tempatName: string;
  /** The Lokasi Mitra whose job it is; null for a TPU job. */
  lokasi: { id: string; name: string } | null;
  /** When the Keluhan window over it closed, or null while the thread is open. */
  ditutupAt: Date | null;
}

/** The job a thread hangs on, whichever of the two tables it lives in, or null. */
export async function jobPesan(db: Database, pekerjaanId: string): Promise<JobRingkas | null> {
  if (!z.uuid().safeParse(pekerjaanId).success) return null;
  const [lokasi] = await db
    .select({ job: pekerjaanLayanan, order: pesananLayanan, item: pesananLayananItem })
    .from(pekerjaanLayanan)
    .innerJoin(pesananLayanan, eq(pesananLayanan.id, pekerjaanLayanan.pesananId))
    .innerJoin(pesananLayananItem, eq(pesananLayananItem.id, pekerjaanLayanan.pesananItemId))
    .where(eq(pekerjaanLayanan.id, pekerjaanId));
  if (lokasi) {
    return {
      jenis: "lokasi",
      id: lokasi.job.id,
      nomor: lokasi.order.nomor,
      label: lokasi.item.label,
      pemesanAccountId: lokasi.order.pemesanAccountId,
      pemesanNama: lokasi.order.pemesanName,
      pemesanEmail: lokasi.order.pemesanEmail,
      tempatName: lokasi.order.lokasiName,
      lokasi: { id: lokasi.order.lokasiId, name: lokasi.order.lokasiName },
      ditutupAt: lokasi.job.jendelaDitutupAt,
    };
  }
  const [tpu] = await db.select().from(pekerjaanLayananTpu).where(eq(pekerjaanLayananTpu.id, pekerjaanId));
  if (!tpu) return null;
  return {
    jenis: "tpu",
    id: tpu.id,
    nomor: tpu.nomor,
    label: tpu.label,
    pemesanAccountId: tpu.pemesanAccountId,
    pemesanNama: tpu.pemesanName,
    pemesanEmail: tpu.pemesanEmail,
    tempatName: tpu.tpuName,
    lokasi: null,
    ditutupAt: tpu.jendelaDitutupAt,
  };
}

/** Whether a Mitra Jasa holds this job: it has an assignment to them that is not yet over. */
async function mitraJasaMemegang(deps: LayananDeps, pekerjaanId: string, mitraJasaId: string): Promise<boolean> {
  const [row] = await deps.db
    .select({ id: pekerjaanLayananTpuPenugasan.id })
    .from(pekerjaanLayananTpuPenugasan)
    .where(
      and(
        eq(pekerjaanLayananTpuPenugasan.pekerjaanId, pekerjaanId),
        eq(pekerjaanLayananTpuPenugasan.mitraJasaId, mitraJasaId),
        inArray(pekerjaanLayananTpuPenugasan.hasil, ["menunggu", "diterima"]),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/** How one staff reader relates to a job, or null when they may not read it at all. */
async function peranStaf(deps: LayananDeps, job: JobRingkas, by: Actor): Promise<PesanPeran | null> {
  if (by.roles.includes("admin_platform")) return "admin_platform";
  if (job.jenis === "lokasi" && job.lokasi && by.roles.includes("admin_lokasi") && by.lokasiIds.includes(job.lokasi.id)) return "admin_lokasi";
  if (job.jenis === "tpu" && by.roles.includes("mitra_jasa")) {
    const profile = await profileOfActor(deps, by);
    if (profile && (await mitraJasaMemegang(deps, job.id, profile.id))) return "mitra_jasa";
  }
  return null;
}

/** Whether this Pemesan is the one who ordered the job: the email is theirs and the Akun holds it. */
async function pemesanSah(deps: LayananDeps, pemesan: PemesanLayanan, job: JobRingkas): Promise<boolean> {
  if (job.pemesanAccountId !== pemesan.accountId) return false;
  const email = normaliseEmail(pemesan.email);
  const akun = email === null ? null : await deps.identity.accountByEmail(email);
  return akun !== null && akun.id === pemesan.accountId;
}

/** A short-lived signed URL for one thread photo, or null when the FileStore cannot serve it. */
async function fotoUrl(deps: LayananDeps, fileKey: string): Promise<string | null> {
  try {
    return await deps.files.signedUrl(fileKey, { expiresInSeconds: PESAN_URL_SECONDS });
  } catch {
    return null;
  }
}

/** One message as a reader sees it. */
export interface PesanTerbaca {
  id: string;
  pengirim: PesanPeran;
  /** A first name for the Pemesan and the Mitra Jasa; a fuller name for staff. */
  pengirimNama: string;
  teks: string;
  createdAt: Date;
  /** Photos, each by a link that lives for minutes. */
  lampiran: { url: string | null }[];
}

/** The fulfiller the Pemesan deals with, as the Pemesan may see them. */
export interface PelaksanaTerbaca {
  tipe: "admin_lokasi" | "mitra_jasa";
  /** A first name, never a surname, and never a contact. */
  nama: string;
  fotoUrl: string | null;
}

/** One job's thread as its reader sees it. */
export interface ThreadPekerjaan {
  pekerjaanId: string;
  jenis: PesanJenis;
  nomor: string;
  label: string;
  ditutupAt: Date | null;
  /** True once the Keluhan window closed: the thread is history, no new messages. */
  readOnly: boolean;
  /** The fulfiller of the job, or null while nobody has accepted a TPU job yet. */
  pelaksana: PelaksanaTerbaca | null;
  pesan: PesanTerbaca[];
}

export type BacaThreadResult = { ok: true; thread: ThreadPekerjaan } | { ok: false; reason: "tidak_ditemukan" | "bukan_peserta" };

/** How a name reads to one party: never a surname for the Pemesan or the Mitra Jasa. */
function namaUntuk(pesan: { pengirim: PesanPeran; pengirimNama: string }, pembaca: PesanPeran): string {
  if (pesan.pengirim === "admin_platform") return "Admin Platform";
  if (pembaca === "pemesan" || pembaca === "mitra_jasa") return namaDepan(pesan.pengirimNama);
  return pesan.pengirimNama;
}

/** The fulfiller of one job, as the Pemesan may see them: a first name and, for a Mitra Jasa, a photo. */
async function pelaksanaJob(deps: LayananDeps, job: JobRingkas): Promise<PelaksanaTerbaca | null> {
  if (job.jenis === "lokasi" && job.lokasi) {
    const admins = await deps.identity.adminLokasiOf(job.lokasi.id);
    const admin = admins[0];
    return admin && admin.name.trim() ? { tipe: "admin_lokasi", nama: namaDepan(admin.name), fotoUrl: null } : null;
  }
  const [tugas] = await deps.db
    .select({ mitraJasaId: pekerjaanLayananTpuPenugasan.mitraJasaId })
    .from(pekerjaanLayananTpuPenugasan)
    .where(and(eq(pekerjaanLayananTpuPenugasan.pekerjaanId, job.id), inArray(pekerjaanLayananTpuPenugasan.hasil, ["menunggu", "diterima"])))
    .orderBy(desc(pekerjaanLayananTpuPenugasan.ditugaskanAt))
    .limit(1);
  if (!tugas) return null;
  const [mitra] = await deps.db
    .select({ nama: layananMitraJasa.namaLengkap, foto: layananMitraJasa.fotoFileKey })
    .from(layananMitraJasa)
    .where(eq(layananMitraJasa.id, tugas.mitraJasaId));
  if (!mitra) return null;
  return { tipe: "mitra_jasa", nama: namaDepan(mitra.nama), fotoUrl: mitra.foto ? await fotoUrl(deps, mitra.foto) : null };
}

/** One job's thread as `pembaca` sees it, with the names lowered to what that party may see. */
async function bacaThread(deps: LayananDeps, job: JobRingkas, pembaca: PesanPeran): Promise<ThreadPekerjaan> {
  const rows = await deps.db
    .select()
    .from(pekerjaanLayananPesan)
    .where(eq(pekerjaanLayananPesan.pekerjaanId, job.id))
    .orderBy(asc(pekerjaanLayananPesan.createdAt), asc(pekerjaanLayananPesan.id));
  const lampiran = rows.length
    ? await deps.db
        .select()
        .from(pekerjaanLayananPesanLampiran)
        .where(inArray(pekerjaanLayananPesanLampiran.pesanId, rows.map((row) => row.id)))
        .orderBy(asc(pekerjaanLayananPesanLampiran.createdAt))
    : [];
  const perPesan = new Map<string, { url: string | null }[]>();
  for (const satu of lampiran) {
    const daftar = perPesan.get(satu.pesanId) ?? [];
    daftar.push({ url: await fotoUrl(deps, satu.fileKey) });
    perPesan.set(satu.pesanId, daftar);
  }
  return {
    pekerjaanId: job.id,
    jenis: job.jenis,
    nomor: job.nomor,
    label: job.label,
    ditutupAt: job.ditutupAt,
    readOnly: job.ditutupAt !== null,
    pelaksana: await pelaksanaJob(deps, job),
    pesan: rows.map((row) => ({
      id: row.id,
      pengirim: row.pengirimPeran,
      pengirimNama: namaUntuk({ pengirim: row.pengirimPeran, pengirimNama: row.pengirimNama }, pembaca),
      teks: row.teks,
      createdAt: row.createdAt,
      lampiran: perPesan.get(row.id) ?? [],
    })),
  };
}

/** One job's thread as its Pemesan reads it, or a refusal. */
export async function threadUntukPemesan(deps: LayananDeps, pemesan: { accountId: string }, pekerjaanId: string): Promise<BacaThreadResult> {
  const job = await jobPesan(deps.db, pekerjaanId);
  if (!job) return { ok: false, reason: "tidak_ditemukan" };
  if (job.pemesanAccountId !== pemesan.accountId) return { ok: false, reason: "bukan_peserta" };
  return { ok: true, thread: await bacaThread(deps, job, "pemesan") };
}

/** One job's thread as a staff member or the fulfiller reads it, or a refusal. */
export async function threadUntukStaf(deps: LayananDeps, by: Actor, pekerjaanId: string): Promise<BacaThreadResult> {
  const job = await jobPesan(deps.db, pekerjaanId);
  if (!job) return { ok: false, reason: "tidak_ditemukan" };
  const peran = await peranStaf(deps, job, by);
  if (!peran) return { ok: false, reason: "bukan_peserta" };
  return { ok: true, thread: await bacaThread(deps, job, peran) };
}

export type KirimPesanResult =
  | { ok: true; id: string }
  | { ok: false; reason: "input_tidak_valid" | "tidak_ditemukan" | "bukan_peserta" | "thread_ditutup" | "berkas_tidak_didukung" };

/** The photos a message carries, already stored, or the reason one was refused. */
async function simpanLampiran(deps: LayananDeps, job: JobRingkas, lampiran: readonly { body: Uint8Array; contentType: string }[] | undefined) {
  const disimpan: { fileKey: string; contentType: string }[] = [];
  for (const satu of lampiran ?? []) {
    const extension = documentExtension(satu, PESAN_LAMPIRAN_TYPES as readonly DocumentContentType[]);
    if (!extension || satu.body.byteLength === 0 || satu.body.byteLength > PESAN_FOTO_MAX_BYTES) return { ok: false as const };
    const fileKey = `pesan-layanan/${job.id}/${randomUUID()}.${extension}`;
    try {
      await deps.files.put({ key: fileKey, body: satu.body, contentType: satu.contentType });
    } catch {
      return { ok: false as const };
    }
    disimpan.push({ fileKey, contentType: satu.contentType });
  }
  return { ok: true as const, disimpan };
}

/**
 * Writes one message into a job's thread, with its photos already accepted, and — when
 * the writer is staff or the fulfiller — asks Notifications to tell the Pemesan a
 * message arrived. The message, its photos' rows and the announcement commit together.
 */
async function simpanPesan(
  deps: LayananDeps,
  job: JobRingkas,
  pengirim: { accountId: string; peran: PesanPeran; nama: string },
  data: { teks: string; lampiran?: { body: Uint8Array; contentType: string }[] },
): Promise<KirimPesanResult> {
  if (job.ditutupAt) return { ok: false, reason: "thread_ditutup" };
  const foto = await simpanLampiran(deps, job, data.lampiran);
  if (!foto.ok) return { ok: false, reason: "berkas_tidak_didukung" };
  const now = deps.clock.now();
  return deps.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(pekerjaanLayananPesan)
      .values({ pekerjaanId: job.id, jenis: job.jenis, pengirimAccountId: pengirim.accountId, pengirimPeran: pengirim.peran, pengirimNama: pengirim.nama, teks: data.teks, createdAt: now })
      .returning({ id: pekerjaanLayananPesan.id });
    if (foto.disimpan.length > 0) {
      await tx
        .insert(pekerjaanLayananPesanLampiran)
        .values(foto.disimpan.map((satu) => ({ pesanId: row.id, fileKey: satu.fileKey, contentType: satu.contentType, createdAt: now })));
    }
    // The Pemesan is told a message arrived, never what it says or shows. A message the
    // Pemesan wrote is not news to them, so only staff and the fulfiller announce one.
    if (pengirim.peran !== "pemesan" && job.pemesanAccountId && job.pemesanEmail) {
      await deps.notifikasi.pesanBaru(tx, {
        pekerjaanId: job.id,
        nomor: job.nomor,
        email: job.pemesanEmail,
        pemesanName: job.pemesanNama,
        pengirim: pengirim.peran === "admin_lokasi" ? "admin_lokasi" : pengirim.peran === "mitra_jasa" ? "mitra_jasa" : "admin_platform",
        label: job.label,
        tempatName: job.tempatName,
        lokasi: job.lokasi,
      });
    }
    return { ok: true as const, id: row.id };
  });
}

/** The Pemesan writes into one job's thread; the email has to prove the Akun. */
export async function kirimPesanPemesan(deps: LayananDeps, pemesan: PemesanLayanan, rawInput: unknown): Promise<KirimPesanResult> {
  const parsed = kirimPesanSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const job = await jobPesan(deps.db, parsed.data.pekerjaanId);
  if (!job) return { ok: false, reason: "tidak_ditemukan" };
  if (!(await pemesanSah(deps, pemesan, job))) return { ok: false, reason: "bukan_peserta" };
  return simpanPesan(deps, job, { accountId: pemesan.accountId, peran: "pemesan", nama: job.pemesanNama }, parsed.data);
}

/** A staff member or the job's fulfiller writes into its thread. */
export async function kirimPesanStaf(deps: LayananDeps, by: Actor, rawInput: unknown): Promise<KirimPesanResult> {
  const parsed = kirimPesanSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const job = await jobPesan(deps.db, parsed.data.pekerjaanId);
  if (!job) return { ok: false, reason: "tidak_ditemukan" };
  const peran = await peranStaf(deps, job, by);
  if (!peran) return { ok: false, reason: "bukan_peserta" };
  const nama = await namaPengirim(deps, by, job, peran);
  return simpanPesan(deps, job, { accountId: by.accountId, peran, nama }, parsed.data);
}

/** What one staff writer is called in the thread, as they are named on record. */
async function namaPengirim(deps: LayananDeps, by: Actor, job: JobRingkas, peran: PesanPeran): Promise<string> {
  if (peran === "admin_platform") return "Admin Platform";
  if (peran === "admin_lokasi") {
    const admins = job.lokasi ? await deps.identity.adminLokasiOf(job.lokasi.id) : [];
    return admins.find((admin) => admin.accountId === by.accountId)?.name || "Admin Lokasi";
  }
  const profile = await profileOfActor(deps, by);
  return profile ? (await deps.db.select({ nama: layananMitraJasa.namaLengkap }).from(layananMitraJasa).where(eq(layananMitraJasa.id, profile.id)))[0]?.nama ?? "Mitra Jasa" : "Mitra Jasa";
}
