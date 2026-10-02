/**
 * The message thread of one Pekerjaan Layanan (spec, Layanan > Message thread; stories 96,
 * 131, 171, 180): text and photos between the Pemesan and whoever does the work, the Admin
 * Lokasi at a Lokasi Mitra or the Mitra Jasa at a DKI TPU. Admin Platform reads every thread
 * and may post.
 *
 * Rules kept here and nowhere else:
 * - only the Pemesan, the fulfiller of that job and Admin Platform read or post; anyone else
 *   is refused, so a thread is never read by a stranger;
 * - each message from the fulfiller or Admin Platform tells the Pemesan by email, with a link
 *   to read and reply and **nothing of the message** (the text and the photos stay in the app);
 * - the thread closes when the Keluhan window ends: the window-close tick sets
 *   `jendela_ditutup_at` (ticket 51) and from then it is read-only;
 * - contact details are never exchanged through the platform: a phone number or an email
 *   address in a message of the Pemesan, an Admin Lokasi or a Mitra Jasa is refused, and
 *   no read of the thread returns the Pemesan's phone number or the Mitra Jasa's contact;
 * - the Pemesan sees a Mitra Jasa by first name and photo only.
 *
 * Photos go to the private FileStore and are shown by short-lived signed URLs.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { akunResource, lokasiMitraResource, normaliseEmail, pekerjaanTpuSemuaResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { documentExtension, type DocumentContentType } from "@/lib/files/document-type";
import { BUKTI_MAX_BYTES, buktiUrl } from "./bukti";
import type { LayananDeps, PemesanLayanan } from "./deps";
import { kirimPesanThreadSchema } from "./pesanan-schema";
import {
  layananMitraJasa,
  pekerjaanLayanan,
  pekerjaanLayananPesan,
  pekerjaanLayananPesanFoto,
  pekerjaanLayananTpu,
  pekerjaanLayananTpuPenugasan,
  pesananLayanan,
  pesananLayananItem,
  type PesanPengirim,
  type PesanSumber,
} from "./schema";
import { profileOfActor } from "./mitra-jasa";

const FOTO_TYPES: readonly DocumentContentType[] = ["image/jpeg", "image/png", "image/webp"];

/** One message as a reader sees it. The sender is a role (and a first name for a Mitra Jasa), never a contact. */
export interface PesanTerbaca {
  id: string;
  dari: PesanPengirim;
  /** "Anda" for the reader's own, else "Keluarga", "Admin Lokasi", "Admin Platform" or the Mitra Jasa's first name. */
  label: string;
  milikSaya: boolean;
  teks: string;
  foto: { url: string | null }[];
  at: Date;
}

export interface ThreadTerbaca {
  pekerjaanId: string;
  sumber: PesanSumber;
  label: string;
  /** Read-only: the Keluhan window ended (or the job at a TPU was cancelled). */
  tertutup: boolean;
  /** Only for the Pemesan's read, and only when a Mitra Jasa holds the job: first name and photo, nothing else. */
  mitraJasa: { namaDepan: string; fotoUrl: string | null } | null;
  pesan: PesanTerbaca[];
}

type Konteks = {
  sumber: PesanSumber;
  id: string;
  nomor: string;
  label: string;
  tempat: string;
  lokasi: { id: string; name: string } | null;
  pemesanAccountId: string | null;
  pemesanEmail: string | null;
  tertutup: boolean;
};

async function bacaKonteks(deps: Pick<LayananDeps, "db">, pekerjaanId: string): Promise<Konteks | null> {
  if (!z.uuid().safeParse(pekerjaanId).success) return null;
  const [lokasi] = await deps.db
    .select({ job: pekerjaanLayanan, order: pesananLayanan, item: pesananLayananItem })
    .from(pekerjaanLayanan)
    .innerJoin(pesananLayanan, eq(pesananLayanan.id, pekerjaanLayanan.pesananId))
    .innerJoin(pesananLayananItem, eq(pesananLayananItem.id, pekerjaanLayanan.pesananItemId))
    .where(eq(pekerjaanLayanan.id, pekerjaanId));
  if (lokasi) {
    return {
      sumber: "lokasi",
      id: lokasi.job.id,
      nomor: lokasi.order.nomor,
      label: lokasi.item.label,
      tempat: lokasi.order.lokasiName,
      lokasi: { id: lokasi.job.lokasiId, name: lokasi.order.lokasiName },
      pemesanAccountId: lokasi.order.pemesanAccountId,
      pemesanEmail: lokasi.order.pemesanEmail,
      tertutup: lokasi.job.jendelaDitutupAt !== null,
    };
  }
  const [tpu] = await deps.db.select().from(pekerjaanLayananTpu).where(eq(pekerjaanLayananTpu.id, pekerjaanId));
  if (!tpu) return null;
  return {
    sumber: "tpu",
    id: tpu.id,
    nomor: tpu.nomor,
    label: tpu.label,
    tempat: tpu.tpuName,
    lokasi: null,
    pemesanAccountId: tpu.pemesanAccountId,
    pemesanEmail: tpu.pemesanEmail,
    // The TPU's Keluhan window is ticket 57's (the proof is approved by Admin Platform); until it sets a closing
    // signal a TPU thread closes only when the job is cancelled.
    tertutup: tpu.status === "dibatalkan",
  };
}

/** The Mitra Jasa who has accepted a TPU job, or null. */
async function mitraJasaPemegang(deps: Pick<LayananDeps, "db">, pekerjaanId: string) {
  const [row] = await deps.db
    .select({ id: layananMitraJasa.id, email: layananMitraJasa.email, namaLengkap: layananMitraJasa.namaLengkap, fotoFileKey: layananMitraJasa.fotoFileKey })
    .from(pekerjaanLayananTpuPenugasan)
    .innerJoin(layananMitraJasa, eq(layananMitraJasa.id, pekerjaanLayananTpuPenugasan.mitraJasaId))
    .where(and(eq(pekerjaanLayananTpuPenugasan.pekerjaanId, pekerjaanId), eq(pekerjaanLayananTpuPenugasan.hasil, "diterima")))
    .limit(1);
  return row ?? null;
}

const namaDepanOf = (namaLengkap: string) => namaLengkap.trim().split(/\s+/)[0] ?? namaLengkap;

/**
 * Whether a message carries a contact detail: an email address, or a run of nine or more digits (a phone number written
 * with spaces, dots, dashes, brackets or a +62 prefix). A grave's number is shorter than that.
 */
export function mengandungKontak(teks: string): boolean {
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(teks)) return true;
  return /\d(?:[\s().-]*\d){8,}/.test(teks);
}

/* ── who may be in a thread ── */

type Peserta =
  | { peran: "pemesan"; accountId: string }
  | { peran: "admin_lokasi" | "admin_platform"; accountId: string }
  | { peran: "mitra_jasa"; accountId: string; mitraJasaId: string };

export type AksesThreadResult = { ok: true; konteks: Konteks; peserta: Peserta } | WriteRefusal | { ok: false; reason: "tidak_ditemukan" | "bukan_pemesan" };

async function pemesanSah(deps: LayananDeps, pemesan: PemesanLayanan): Promise<boolean> {
  const email = normaliseEmail(pemesan.email);
  const akun = email === null ? null : await deps.identity.accountByEmail(email);
  return akun !== null && akun.id === pemesan.accountId;
}

async function aksesPemesan(deps: LayananDeps, pemesan: PemesanLayanan, pekerjaanId: string): Promise<AksesThreadResult> {
  const konteks = await bacaKonteks(deps, pekerjaanId);
  // A thread that is not the Pemesan's is the same answer as one that does not exist.
  if (!konteks || konteks.pemesanAccountId !== pemesan.accountId) return { ok: false, reason: "tidak_ditemukan" };
  if (!(await pemesanSah(deps, pemesan))) return { ok: false, reason: "bukan_pemesan" };
  return { ok: true, konteks, peserta: { peran: "pemesan", accountId: pemesan.accountId } };
}

async function aksesStaf(deps: LayananDeps, by: Actor, pekerjaanId: string): Promise<AksesThreadResult> {
  const konteks = await bacaKonteks(deps, pekerjaanId);
  if (!konteks) return { ok: false, reason: "tidak_ditemukan" };
  if (konteks.sumber === "lokasi" && konteks.lokasi) {
    const resource = lokasiMitraResource(konteks.lokasi.id);
    const refusal = writeRefusal(by, "layanan.lihat_staf", resource);
    if (refusal) return refusal;
    // Admin Lokasi of this Lokasi may also fulfil; Admin Platform only reads and steps in.
    const peran = writeRefusal(by, "layanan.kerjakan", resource) === null ? "admin_lokasi" : "admin_platform";
    return { ok: true, konteks, peserta: { peran, accountId: by.accountId } };
  }
  const admin = writeRefusal(by, "pekerjaan_tpu.kelola", pekerjaanTpuSemuaResource());
  if (!admin) return { ok: true, konteks, peserta: { peran: "admin_platform", accountId: by.accountId } };
  if (!writeRefusal(by, "pekerjaan_tpu.jawab", akunResource(by.accountId))) {
    const profil = await profileOfActor(deps, by);
    const pemegang = await mitraJasaPemegang(deps, pekerjaanId);
    if (profil && pemegang && pemegang.id === profil.id) {
      return { ok: true, konteks, peserta: { peran: "mitra_jasa", accountId: by.accountId, mitraJasaId: profil.id } };
    }
  }
  return admin;
}

/* ── reading ── */

async function bacaThread(deps: LayananDeps, konteks: Konteks, peserta: Peserta): Promise<ThreadTerbaca> {
  const rows = await deps.db
    .select()
    .from(pekerjaanLayananPesan)
    .where(eq(pekerjaanLayananPesan.pekerjaanId, konteks.id))
    .orderBy(asc(pekerjaanLayananPesan.urutan));
  const fotos = rows.length
    ? await deps.db
        .select()
        .from(pekerjaanLayananPesanFoto)
        .where(inArray(pekerjaanLayananPesanFoto.pesanId, rows.map((row) => row.id)))
        .orderBy(asc(pekerjaanLayananPesanFoto.posisi))
    : [];
  const pemegang = konteks.sumber === "tpu" ? await mitraJasaPemegang(deps, konteks.id) : null;
  const namaDepanMitra = pemegang ? namaDepanOf(pemegang.namaLengkap) : null;
  const labelDari = (dari: PesanPengirim, milikSaya: boolean) => {
    if (milikSaya) return "Anda";
    if (dari === "pemesan") return "Keluarga";
    if (dari === "admin_lokasi") return "Admin Lokasi";
    if (dari === "admin_platform") return "Admin Platform";
    return peserta.peran === "pemesan" && namaDepanMitra ? namaDepanMitra : "Mitra Jasa";
  };
  const pesan: PesanTerbaca[] = await Promise.all(
    rows.map(async (row) => {
      const milikSaya = row.pengirim === peserta.peran && row.pengirimAccountId === peserta.accountId;
      return {
        id: row.id,
        dari: row.pengirim,
        label: labelDari(row.pengirim, milikSaya),
        milikSaya,
        teks: row.teks,
        foto: await Promise.all(fotos.filter((foto) => foto.pesanId === row.id).map(async (foto) => ({ url: await buktiUrl(deps, foto.fileKey) }))),
        at: row.createdAt,
      };
    }),
  );
  return {
    pekerjaanId: konteks.id,
    sumber: konteks.sumber,
    label: konteks.label,
    tertutup: konteks.tertutup,
    mitraJasa:
      peserta.peran === "pemesan" && pemegang && namaDepanMitra
        ? { namaDepan: namaDepanMitra, fotoUrl: pemegang.fotoFileKey ? await buktiUrl(deps, pemegang.fotoFileKey) : null }
        : null,
    pesan,
  };
}

export type BacaThreadResult = { ok: true; thread: ThreadTerbaca } | Extract<AksesThreadResult, { ok: false }>;

/** The Pemesan reads the thread of one of their own jobs. */
export async function bacaThreadPemesan(deps: LayananDeps, pemesan: PemesanLayanan, pekerjaanId: string): Promise<BacaThreadResult> {
  const akses = await aksesPemesan(deps, pemesan, pekerjaanId);
  if (!akses.ok) return akses;
  return { ok: true, thread: await bacaThread(deps, akses.konteks, akses.peserta) };
}

/** The Admin Lokasi of the job's Lokasi, the Mitra Jasa who holds it, or Admin Platform reads its thread. */
export async function bacaThreadStaf(deps: LayananDeps, by: Actor, pekerjaanId: string): Promise<BacaThreadResult> {
  const akses = await aksesStaf(deps, by, pekerjaanId);
  if (!akses.ok) return akses;
  return { ok: true, thread: await bacaThread(deps, akses.konteks, akses.peserta) };
}

/* ── posting ── */

export type KirimPesanResult =
  | { ok: true; pesanId: string }
  | Extract<AksesThreadResult, { ok: false }>
  | { ok: false; reason: "input_tidak_valid" | "tertutup" | "kontak_tidak_boleh" | "berkas_tidak_didukung" | "penyimpanan_belum_tersedia" };

async function kirim(deps: LayananDeps, akses: Extract<AksesThreadResult, { ok: true }>, input: z.infer<typeof kirimPesanThreadSchema>, by: Actor | null): Promise<KirimPesanResult> {
  const { konteks, peserta } = akses;
  if (konteks.tertutup) return { ok: false, reason: "tertutup" };
  // Admin Platform steps in to protect the family and may name whatever it must; everyone else may not hand over a contact.
  if (peserta.peran !== "admin_platform" && mengandungKontak(input.teks)) return { ok: false, reason: "kontak_tidak_boleh" };
  const ekstensi: string[] = [];
  for (const foto of input.foto) {
    const ext = documentExtension(foto, FOTO_TYPES);
    if (!ext || foto.body.byteLength === 0 || foto.body.byteLength > BUKTI_MAX_BYTES) return { ok: false, reason: "berkas_tidak_didukung" };
    ekstensi.push(ext);
  }
  const pesanId = crypto.randomUUID();
  const kunci = ekstensi.map((ext, index) => `pekerjaan-layanan/${konteks.id}/pesan/${pesanId}/${index + 1}.${ext}`);
  try {
    for (const [index, foto] of input.foto.entries()) {
      await deps.files.put({ key: kunci[index], body: foto.body, contentType: foto.contentType });
    }
  } catch {
    return { ok: false, reason: "penyimpanan_belum_tersedia" };
  }
  const now = deps.clock.now();
  const tulis = async (tx: LayananDeps["db"]): Promise<KirimPesanResult> => {
    // The thread is read under the job's own state so a message never lands after the window closed.
    const tertutup = (await bacaKonteks({ db: tx }, konteks.id))?.tertutup ?? true;
    if (tertutup) return { ok: false, reason: "tertutup" };
    await tx.insert(pekerjaanLayananPesan).values({
      id: pesanId,
      sumber: konteks.sumber,
      pekerjaanId: konteks.id,
      pengirim: peserta.peran,
      pengirimAccountId: peserta.accountId,
      teks: input.teks,
      createdAt: now,
    });
    if (input.foto.length > 0) {
      await tx
        .insert(pekerjaanLayananPesanFoto)
        .values(input.foto.map((foto, index) => ({ pesanId, posisi: index + 1, fileKey: kunci[index], contentType: foto.contentType })));
    }
    // Only a message from the other side tells the Pemesan, and only by a link: nothing of it goes in the email.
    if (peserta.peran !== "pemesan" && konteks.pemesanEmail) {
      await deps.notifikasi.pesanThreadBaru(tx, {
        pekerjaanId: konteks.id,
        nomor: konteks.nomor,
        email: konteks.pemesanEmail,
        label: konteks.label,
        lokasi: konteks.lokasi,
        tempat: konteks.tempat,
        dari: peserta.peran,
      });
    }
    return { ok: true, pesanId };
  };
  if (by && peserta.peran !== "pemesan") {
    // A staff write: the Entri Audit commits with the message (and records that it was posted, never what it said).
    return deps.audit.staffWrite(deps.db, async (tx, record) => {
      const hasil = await tulis(tx);
      if (!hasil.ok) return hasil;
      await record({
        actor: { accountId: by.accountId, role: peserta.peran },
        action: "layanan.kirim_pesan",
        entity: { kind: "pekerjaan_layanan", id: konteks.id },
        lokasiId: konteks.lokasi?.id ?? null,
        before: null,
        after: { foto: input.foto.length },
        reason: null,
      });
      return hasil;
    });
  }
  return deps.db.transaction(async (tx) => tulis(tx));
}

/** The Pemesan writes in the thread of one of their own jobs. */
export async function kirimPesanPemesan(deps: LayananDeps, pemesan: PemesanLayanan, rawInput: unknown): Promise<KirimPesanResult> {
  const parsed = kirimPesanThreadSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const akses = await aksesPemesan(deps, pemesan, parsed.data.pekerjaanId);
  if (!akses.ok) return akses;
  return kirim(deps, akses, parsed.data, null);
}

/** The Admin Lokasi, the Mitra Jasa who holds the job, or Admin Platform writes in the thread. */
export async function kirimPesanStaf(deps: LayananDeps, by: Actor, rawInput: unknown): Promise<KirimPesanResult> {
  const parsed = kirimPesanThreadSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const akses = await aksesStaf(deps, by, parsed.data.pekerjaanId);
  if (!akses.ok) return akses;
  return kirim(deps, akses, parsed.data, by);
}
