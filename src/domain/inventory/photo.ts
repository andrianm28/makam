import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { documentExtension, type DocumentContentType } from "@/lib/files/document-type";
import type { InventoryDeps } from "./deps";
import { findBlok } from "./grid";
import { inventoryBlok } from "./schema";

/** A Blok's site-plan photo may be a photo (not a scan). */
const PHOTO_TYPES: readonly DocumentContentType[] = ["image/jpeg", "image/png", "image/webp"];

/** The largest site-plan photo accepted, 10 MB. */
export const BLOK_PHOTO_MAX_BYTES = 10 * 1024 * 1024;

export type UploadBlokPhotoResult =
  | { ok: true }
  | WriteRefusal
  | { ok: false; reason: "blok_tidak_ditemukan" }
  | { ok: false; reason: "berkas_wajib" }
  | { ok: false; reason: "berkas_tidak_didukung" }
  | { ok: false; reason: "penyimpanan_belum_tersedia" };

/**
 * An Admin Lokasi uploads (or replaces) a Blok's site-plan photo to the
 * private FileStore. Until ticket 60 builds the live S3 adapter, staging and
 * production have no FileStore configured, so this always refuses there
 * (`penyimpanan_belum_tersedia`); a page should check `isPortConfigured` on
 * the FileStore first and show "Unggah foto belum tersedia" instead of even
 * offering the control.
 */
export async function uploadBlokPhoto(
  deps: InventoryDeps,
  by: Actor,
  lokasiId: string,
  blokId: string,
  file: { body: Uint8Array; contentType: string },
): Promise<UploadBlokPhotoResult> {
  const refusal = writeRefusal(by, "denah.ubah", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  const blok = await findBlok(deps.db, lokasiId, blokId);
  if (!blok) return { ok: false, reason: "blok_tidak_ditemukan" };
  if (file.body.byteLength === 0) return { ok: false, reason: "berkas_wajib" };
  const extension = documentExtension(file, PHOTO_TYPES);
  if (!extension || file.body.byteLength > BLOK_PHOTO_MAX_BYTES) return { ok: false, reason: "berkas_tidak_didukung" };

  const key = `denah/${lokasiId}/${blokId}/${randomUUID()}.${extension}`;
  try {
    await deps.files.put({ key, body: file.body, contentType: file.contentType });
  } catch {
    return { ok: false, reason: "penyimpanan_belum_tersedia" };
  }
  const previousKey = blok.photoFileKey;

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    await tx
      .update(inventoryBlok)
      .set({ photoFileKey: key })
      .where(and(eq(inventoryBlok.id, blokId), eq(inventoryBlok.lokasiId, lokasiId)));
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "denah.unggah_foto_blok",
      entity: { kind: "denah_blok", id: blokId },
      lokasiId,
      before: { photoFileKey: previousKey },
      after: { photoFileKey: key },
      reason: null,
    });
    return { ok: true as const };
  }).then(async (result) => {
    // Best-effort: the old photo is no longer referenced. Never blocks the write above.
    if (result.ok && previousKey) await deps.files.delete(previousKey).catch(() => undefined);
    return result;
  });
}

/** A Blok's site-plan photo, as a short-lived signed URL; null when there is none or the FileStore can't serve it. */
export async function blokPhotoUrl(deps: InventoryDeps, lokasiId: string, blokId: string): Promise<string | null> {
  const blok = await findBlok(deps.db, lokasiId, blokId);
  if (!blok?.photoFileKey) return null;
  try {
    return await deps.files.signedUrl(blok.photoFileKey, { expiresInSeconds: 300 });
  } catch {
    return null;
  }
}
