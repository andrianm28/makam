/**
 * The one check every family or staff document upload of a request shares (Pengembalian / Ganti Pemegang Hak
 * attachments and the Admin Lokasi's KTP check, ticket 39): JPEG, PNG or PDF whose bytes match, not empty, at most 10 MB.
 */
import { documentExtension, type DocumentContentType } from "./document-type";

export const UNGGAHAN_TYPES: readonly DocumentContentType[] = ["image/jpeg", "image/png", "application/pdf"];
export const UNGGAHAN_MAX_BYTES = 10 * 1024 * 1024;

/** The stored file's extension, or null when the upload is refused. */
export function ekstensiUnggahan(file: { body: Uint8Array; contentType: string }): string | null {
  if (file.body.byteLength === 0 || file.body.byteLength > UNGGAHAN_MAX_BYTES) return null;
  return documentExtension(file, UNGGAHAN_TYPES);
}
