/** The documents of a Pengajuan Wakaf: checked (type, content, size) and stored only in the private FileStore. */
import { randomUUID } from "node:crypto";
import { documentExtension, type DocumentContentType } from "@/lib/files/document-type";
import type { WakafDeps } from "./deps";
import type { BerkasWakaf } from "./schema";
import { BERKAS_WAKAF_MAX_BYTES, type BerkasWakafInput } from "./skema";

const JENIS_BERKAS: readonly DocumentContentType[] = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export type SimpanBerkasResult = { ok: true; berkas: BerkasWakaf[] } | { ok: false; reason: "berkas_tidak_didukung" | "penyimpanan_belum_tersedia" };

/** Deletes stored documents, best-effort: a file that cannot be deleted is left for the operator, never a reason to fail. */
export async function hapusBerkasWakaf(deps: Pick<WakafDeps, "files">, berkas: readonly BerkasWakaf[]): Promise<void> {
  await Promise.all(berkas.map((satu) => deps.files.delete(satu.fileKey).catch(() => undefined)));
}

/** Stores every document that came in, or none: a refusal leaves no private file behind. Empty bodies are skipped (an untouched file field). */
export async function simpanBerkasWakaf(
  deps: Pick<WakafDeps, "files">,
  pengajuanId: string,
  masuk: readonly BerkasWakafInput[],
  oleh: BerkasWakaf["oleh"],
  now: Date,
  kunciTetap?: string,
): Promise<SimpanBerkasResult> {
  const ada = masuk.filter((satu) => satu.body.byteLength > 0);
  for (const satu of ada) {
    if (!documentExtension(satu, JENIS_BERKAS) || satu.body.byteLength > BERKAS_WAKAF_MAX_BYTES) return { ok: false, reason: "berkas_tidak_didukung" };
  }
  const hasil: BerkasWakaf[] = [];
  for (const satu of ada) {
    const id = randomUUID();
    const extension = documentExtension(satu, JENIS_BERKAS)!;
    const kunci = kunciTetap ?? satu.kunci;
    const fileKey = `wakaf/${pengajuanId}/${kunci}-${id}.${extension}`;
    try {
      await deps.files.put({ key: fileKey, body: satu.body, contentType: satu.contentType });
    } catch {
      await hapusBerkasWakaf(deps, hasil);
      return { ok: false, reason: "penyimpanan_belum_tersedia" };
    }
    hasil.push({ id, kunci, fileKey, contentType: satu.contentType, oleh, diunggahPada: now.toISOString() });
  }
  return { ok: true, berkas: hasil };
}
