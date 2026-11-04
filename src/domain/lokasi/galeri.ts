import { randomUUID } from "node:crypto";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { documentExtension } from "@/lib/files/document-type";
import type { FileStore } from "@/ports/file-store";
import { isLokasiId, type LokasiDeps } from "./lokasi-mitra";
import { publicLokasiMitra, VISIT_PHOTO_URL_SECONDS } from "./public-reads";
import { lokasiFotoGaleri, lokasiMitra } from "./schema";
import { kategoriFotoGaleri, type KategoriFotoGaleri } from "./skema-galeri";

export { kategoriFotoGaleri, type KategoriFotoGaleri };

/** The largest Galeri Lokasi photo accepted, 10 MB (the Server Action body limit is 11 MB). */
export const FOTO_GALERI_MAX_BYTES = 10 * 1024 * 1024;
/** The most photos one Lokasi Mitra's Galeri Lokasi holds at once. */
export const FOTO_GALERI_MAKS = 12;
/** The longest caption (also the photo's alt text). */
export const KETERANGAN_FOTO_MAX = 120;

export interface GaleriDeps extends LokasiDeps {
  files: FileStore;
}

export interface FotoGaleri {
  id: string;
  kategori: KategoriFotoGaleri;
  keterangan: string;
  /** A short-lived signed URL; null when the file can no longer be read. */
  url: string | null;
}

export type UnggahFotoGaleriResult =
  | { ok: true; id: string }
  | WriteRefusal
  | {
      ok: false;
      reason:
        | "tidak_ditemukan"
        | "berkas_tidak_didukung"
        | "keterangan_wajib"
        /** The uploader did not confirm the photo shows no headstones and no burial area. */
        | "pernyataan_wajib"
        | "galeri_penuh"
        | "berkas_gagal_disimpan";
    };

/**
 * Admin Platform adds a photo to a Lokasi Mitra's Galeri Lokasi, the photos the
 * public page and the wizard show: facilities and landscape only (gate,
 * garden, buildings, access), never headstones or the burial area, which the
 * uploader confirms for every photo. JPG, PNG or WebP checked by its bytes, at
 * most 10 MB, at most 12 photos. Stored in the private FileStore first, then
 * recorded with its Entri Audit (the file key, never the file).
 */
export async function unggahFotoGaleri(
  deps: GaleriDeps,
  by: Actor,
  lokasiId: string,
  input: { foto: { body: Uint8Array; contentType: string }; kategori: KategoriFotoGaleri; keterangan: string; tanpaMakam: boolean },
): Promise<UnggahFotoGaleriResult> {
  const refusal = writeRefusal(by, "lokasi.ubah", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  if (!isLokasiId(lokasiId)) return { ok: false, reason: "tidak_ditemukan" };
  const extension = documentExtension(input.foto, ["image/jpeg", "image/png", "image/webp"]);
  if (!extension || input.foto.body.byteLength > FOTO_GALERI_MAX_BYTES) return { ok: false, reason: "berkas_tidak_didukung" };
  const keterangan = input.keterangan.trim().replace(/\s+/g, " ");
  if (keterangan === "" || keterangan.length > KETERANGAN_FOTO_MAX) return { ok: false, reason: "keterangan_wajib" };
  if (!input.tanpaMakam) return { ok: false, reason: "pernyataan_wajib" };

  const key = `galeri/${lokasiId}/${randomUUID()}.${extension}`;
  try {
    await deps.files.put({ key, body: input.foto.body, contentType: input.foto.contentType });
  } catch {
    return { ok: false, reason: "berkas_gagal_disimpan" };
  }
  const now = deps.clock.now();
  const outcome = await deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [lokasi] = await tx.select({ id: lokasiMitra.id }).from(lokasiMitra).where(eq(lokasiMitra.id, lokasiId)).for("update");
    if (!lokasi) return { ok: false, reason: "tidak_ditemukan" } as const;
    const [{ jumlah }] = await tx
      .select({ jumlah: count() })
      .from(lokasiFotoGaleri)
      .where(and(eq(lokasiFotoGaleri.lokasiId, lokasiId), isNull(lokasiFotoGaleri.removedAt)));
    if (jumlah >= FOTO_GALERI_MAKS) return { ok: false, reason: "galeri_penuh" } as const;
    const [created] = await tx
      .insert(lokasiFotoGaleri)
      .values({ lokasiId, kategori: input.kategori, keterangan, fileKey: key, contentType: input.foto.contentType, createdAt: now, createdByAccountId: by.accountId })
      .returning({ id: lokasiFotoGaleri.id });
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "lokasi.tambah_foto_galeri",
      entity: { kind: "lokasi_mitra", id: lokasiId },
      lokasiId,
      before: null,
      after: { fotoGaleriId: created.id, kategori: input.kategori, keterangan, fileKey: key, tanpaMakam: true },
      reason: null,
    });
    return { ok: true, id: created.id } as const;
  });
  if (!outcome.ok) await deps.files.delete(key).catch(() => undefined);
  return outcome;
}

export type HapusFotoGaleriResult = { ok: true } | WriteRefusal | { ok: false; reason: "tidak_ditemukan" };

/** Admin Platform takes a photo off the Galeri Lokasi, audited. The file stays in the FileStore, so the Entri Audit still names one that exists. */
export async function hapusFotoGaleri(deps: GaleriDeps, by: Actor, lokasiId: string, fotoId: string): Promise<HapusFotoGaleriResult> {
  const refusal = writeRefusal(by, "lokasi.ubah", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  if (!isLokasiId(lokasiId) || !isLokasiId(fotoId)) return { ok: false, reason: "tidak_ditemukan" };
  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [foto] = await tx
      .select()
      .from(lokasiFotoGaleri)
      .where(and(eq(lokasiFotoGaleri.id, fotoId), eq(lokasiFotoGaleri.lokasiId, lokasiId), isNull(lokasiFotoGaleri.removedAt)))
      .for("update");
    if (!foto) return { ok: false, reason: "tidak_ditemukan" } as const;
    await tx.update(lokasiFotoGaleri).set({ removedAt: now, removedByAccountId: by.accountId }).where(eq(lokasiFotoGaleri.id, fotoId));
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "lokasi.hapus_foto_galeri",
      entity: { kind: "lokasi_mitra", id: lokasiId },
      lokasiId,
      before: { fotoGaleriId: foto.id, kategori: foto.kategori, keterangan: foto.keterangan, fileKey: foto.fileKey },
      after: null,
      reason: null,
    });
    return { ok: true } as const;
  });
}

async function fotoAktif(deps: GaleriDeps, lokasiId: string): Promise<FotoGaleri[]> {
  const rows = await deps.db
    .select()
    .from(lokasiFotoGaleri)
    .where(and(eq(lokasiFotoGaleri.lokasiId, lokasiId), isNull(lokasiFotoGaleri.removedAt)))
    .orderBy(asc(lokasiFotoGaleri.createdAt), asc(lokasiFotoGaleri.id));
  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      kategori: row.kategori,
      keterangan: row.keterangan,
      url: await deps.files.signedUrl(row.fileKey, { expiresInSeconds: VISIT_PHOTO_URL_SECONDS }).catch(() => null),
    })),
  );
}

/** The Galeri Lokasi as staff manage it (Admin Platform, or that Lokasi's Admin Lokasi), oldest first. */
export async function fotoGaleri(deps: GaleriDeps, by: Actor, lokasiId: string): Promise<{ ok: true; foto: FotoGaleri[] } | WriteRefusal> {
  const refusal = writeRefusal(by, "lokasi.lihat", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  if (!isLokasiId(lokasiId)) return { ok: true, foto: [] };
  return { ok: true, foto: await fotoAktif(deps, lokasiId) };
}

/** The Galeri Lokasi of a Terverifikasi Lokasi Mitra, for the public page and the wizard; empty for any other. No actor. */
export async function publicFotoGaleri(deps: GaleriDeps, lokasiId: string): Promise<FotoGaleri[]> {
  if (!isLokasiId(lokasiId)) return [];
  const profile = await publicLokasiMitra(deps, lokasiId);
  if (!profile) return [];
  return (await fotoAktif(deps, lokasiId)).filter((foto) => foto.url !== null);
}
