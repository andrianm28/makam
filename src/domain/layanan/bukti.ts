/**
 * A job's photo proof (spec, Layanan > Pekerjaan Layanan: "Proof is in-app camera
 * capture with a timestamp"). What a job has to show is not chosen by anybody: it
 * is what its Layanan's `jenis` requires (`buktiPerJenis`), so a Pembersihan
 * Makam always carries a photo before and after, and a Laporan Foto/Video always
 * carries a video.
 *
 * The files live in the private FileStore and are never public: a page asks for a
 * short-lived signed URL, and one that cannot be signed is shown as unreadable
 * rather than as a broken image.
 */
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { documentExtension, type DocumentContentType } from "@/lib/files/document-type";
import type { LayananDeps } from "./deps";
import { proofOf, type ProofRequirement } from "./katalog";
import { buktiPekerjaanSchema, type BuktiPekerjaan } from "./pesanan-schema";
import { pekerjaanLayananBukti, type JenisLayanan } from "./schema";

/** A proof a photo or a video is stored as. */
const BUKTI_TYPES: readonly DocumentContentType[] = ["image/jpeg", "image/png", "image/webp", "video/mp4"];

/** The largest one proof may be, 12 MB. */
export const BUKTI_MAX_BYTES = 12 * 1024 * 1024;

/** How long a proof's signed URL lives, in seconds. */
export const BUKTI_URL_SECONDS = 300;

/** What a job of this kind of Layanan has to show, as the fulfiller's screen lists it. */
export function buktiDibutuhkan(jenis: JenisLayanan): ProofRequirement {
  return proofOf(jenis);
}

/** The kinds of proof a requirement is made of, in the order they are taken. */
export function jenisBuktiDibutuhkan(requirement: ProofRequirement): BuktiPekerjaan[] {
  const jenis: BuktiPekerjaan[] = [];
  if (requirement.fotoSebelum) jenis.push("foto_sebelum");
  jenis.push("foto_sesudah");
  if (requirement.video) jenis.push("video");
  return jenis;
}

/** Whether these captured kinds are everything the requirement asks for: the gate before a job is Selesai. */
export function buktiLengkap(requirement: ProofRequirement, captured: readonly BuktiPekerjaan[]): boolean {
  return jenisBuktiDibutuhkan(requirement).every((jenis) => captured.includes(jenis));
}

/** Which proofs of a requirement a job is still missing. */
export function buktiKurang(requirement: ProofRequirement, captured: readonly BuktiPekerjaan[]): BuktiPekerjaan[] {
  return jenisBuktiDibutuhkan(requirement).filter((jenis) => !captured.includes(jenis));
}

export type SimpanBuktiResult =
  | { ok: true; kind: BuktiPekerjaan }
  /** The capture is empty, is not a photo or a video, or is over the limit. */
  | { ok: false; reason: "berkas_tidak_didukung" }
  /** No FileStore is configured here, so nothing could be kept. */
  | { ok: false; reason: "penyimpanan_belum_tersedia" };

/**
 * Keeps one captured proof in the private FileStore under the job and the kind,
 * with the moment the camera took it. Re-capturing a kind replaces the file it
 * replaces, so a staff member who took the wrong shot can take it again.
 */
export async function simpanBukti(
  deps: LayananDeps,
  pekerjaanId: string,
  diunggahOleh: string,
  rawInput: unknown,
): Promise<SimpanBuktiResult> {
  const parsed = buktiPekerjaanSchema.safeParse(rawInput);
  if (!parsed.success || parsed.data.pekerjaanId !== pekerjaanId) return { ok: false, reason: "berkas_tidak_didukung" };
  const { kind, file, takenAt } = parsed.data;
  if (file.body.byteLength === 0) return { ok: false, reason: "berkas_tidak_didukung" };
  const extension = documentExtension(file, BUKTI_TYPES);
  if (!extension || file.body.byteLength > BUKTI_MAX_BYTES) return { ok: false, reason: "berkas_tidak_didukung" };

  const key = `pekerjaan-layanan/${pekerjaanId}/${kind}.${extension}`;
  try {
    await deps.files.put({ key, body: file.body, contentType: file.contentType });
  } catch {
    return { ok: false, reason: "penyimpanan_belum_tersedia" };
  }
  const [row] = await deps.db
    .insert(pekerjaanLayananBukti)
    .values({ pekerjaanId, kind, fileKey: key, contentType: file.contentType, takenAt, diunggahOleh, createdAt: deps.clock.now() })
    .onConflictDoUpdate({
      target: [pekerjaanLayananBukti.pekerjaanId, pekerjaanLayananBukti.kind],
      set: { fileKey: key, contentType: file.contentType, takenAt, diunggahOleh },
    })
    .returning({ kind: pekerjaanLayananBukti.kind });
  return { ok: true, kind: row.kind };
}

/** A short-lived signed URL for one proof, or null when the FileStore cannot serve it. */
export async function buktiUrl(deps: LayananDeps, fileKey: string): Promise<string | null> {
  try {
    return await deps.files.signedUrl(fileKey, { expiresInSeconds: BUKTI_URL_SECONDS });
  } catch {
    return null;
  }
}

/** One proof as a reader sees it: which one, when it was taken, and a link that lives for minutes. */
export interface BuktiTerbaca {
  kind: BuktiPekerjaan;
  takenAt: Date;
  url: string | null;
}

/** The kinds of proof a job has captured. */
export async function jenisBuktiOf(deps: LayananDeps, pekerjaanId: string): Promise<BuktiPekerjaan[]> {
  const rows = await deps.db
    .select({ kind: pekerjaanLayananBukti.kind })
    .from(pekerjaanLayananBukti)
    .where(eq(pekerjaanLayananBukti.pekerjaanId, pekerjaanId));
  return rows.map((row) => row.kind);
}

/** Every proof of a job, oldest capture first, each with a link to read it. */
export async function buktiUntukPekerjaan(deps: LayananDeps, pekerjaanId: string): Promise<BuktiTerbaca[]> {
  if (!z.uuid().safeParse(pekerjaanId).success) return [];
  const rows = await deps.db
    .select()
    .from(pekerjaanLayananBukti)
    .where(eq(pekerjaanLayananBukti.pekerjaanId, pekerjaanId))
    .orderBy(asc(pekerjaanLayananBukti.takenAt));
  return Promise.all(rows.map(async (row) => ({ kind: row.kind, takenAt: row.takenAt, url: await buktiUrl(deps, row.fileKey) })));
}
