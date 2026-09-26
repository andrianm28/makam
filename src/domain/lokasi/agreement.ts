import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { documentExtension } from "@/lib/files/document-type";
import type { FileStore } from "@/ports/file-store";
import { isLokasiId, writeLokasiMitra, type LokasiDeps, type NotFound, type WriteResult } from "./lokasi-mitra";
import { lokasiMitra } from "./schema";

/** The largest agreement scan accepted, 10 MB (the Server Action body limit is 11 MB). */
export const AGREEMENT_SCAN_MAX_BYTES = 10 * 1024 * 1024;
/** How long a signed URL to the agreement scan works. */
export const AGREEMENT_SCAN_URL_SECONDS = 5 * 60;

export interface AgreementDeps extends LokasiDeps {
  files: FileStore;
}

export type UploadAgreementResult =
  | WriteResult
  | { ok: false; reason: "berkas_tidak_didukung" | "tanggal_tidak_valid" | "berkas_gagal_disimpan" };

/**
 * Admin Platform uploads the signed agreement scan (PDF, JPG or PNG, checked
 * by its bytes, at most 10 MB) with its signing date. The file goes to the
 * private FileStore first; only once it is stored does the record change, with
 * its Entri Audit (the file key, never the file). A replaced scan stays in the
 * FileStore, so every earlier entry still names a file that exists.
 */
export async function uploadAgreement(
  deps: AgreementDeps,
  by: Actor,
  lokasiId: string,
  input: { scan: { body: Uint8Array; contentType: string }; signedOn: string },
): Promise<UploadAgreementResult> {
  const refusal = writeRefusal(by, "lokasi.ubah", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  const extension = documentExtension(input.scan, ["application/pdf", "image/jpeg", "image/png"]);
  if (!extension || input.scan.body.byteLength > AGREEMENT_SCAN_MAX_BYTES) {
    return { ok: false, reason: "berkas_tidak_didukung" };
  }
  if (!isCalendarDate(input.signedOn)) return { ok: false, reason: "tanggal_tidak_valid" };
  if (!isLokasiId(lokasiId)) return { ok: false, reason: "tidak_ditemukan" };

  const key = `perjanjian/${lokasiId}/${randomUUID()}.${extension}`;
  try {
    await deps.files.put({ key, body: input.scan.body, contentType: input.scan.contentType });
  } catch {
    return { ok: false, reason: "berkas_gagal_disimpan" };
  }
  const written = await writeLokasiMitra(deps, by, lokasiId, "lokasi.unggah_perjanjian", (row) => ({
    values: { agreementSignedOn: input.signedOn, agreementScanFileKey: key },
    before: { agreement: { signedOn: row.agreementSignedOn, scanFileKey: row.agreementScanFileKey } },
    after: { agreement: { signedOn: input.signedOn, scanFileKey: key } },
  }));
  if (!written.ok) await deps.files.delete(key).catch(() => undefined);
  return written;
}

export type AgreementScanUrlResult =
  | { ok: true; url: string; expiresAt: Date }
  | WriteRefusal
  | NotFound
  | { ok: false; reason: "belum_ada_berkas" };

/** A short-lived signed URL (5 minutes) to the agreement scan, for Admin Platform only (not the Lokasi's Admin Lokasi). */
export async function agreementScanUrl(deps: AgreementDeps, by: Actor, lokasiId: string): Promise<AgreementScanUrlResult> {
  const refusal = writeRefusal(by, "lokasi.lihat_perjanjian", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  if (!isLokasiId(lokasiId)) return { ok: false, reason: "tidak_ditemukan" };
  const [row] = await deps.db
    .select({ key: lokasiMitra.agreementScanFileKey })
    .from(lokasiMitra)
    .where(eq(lokasiMitra.id, lokasiId));
  if (!row) return { ok: false, reason: "tidak_ditemukan" };
  if (!row.key) return { ok: false, reason: "belum_ada_berkas" };
  const expiresAt = new Date(deps.clock.now().getTime() + AGREEMENT_SCAN_URL_SECONDS * 1000);
  const url = await deps.files.signedUrl(row.key, { expiresInSeconds: AGREEMENT_SCAN_URL_SECONDS });
  return { ok: true, url, expiresAt };
}

/** A real calendar date written YYYY-MM-DD. */
function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
