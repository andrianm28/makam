import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { documentExtension } from "@/lib/files/document-type";
import type { TariffDeps } from "./deps";
import { isUuid } from "./ids";
import { tariffGambarTipeKavling, tariffJenisMakam } from "./schema";

/** The largest Gambar Tipe Kavling accepted, 10 MB. */
export const GAMBAR_TIPE_KAVLING_MAX_BYTES = 10 * 1024 * 1024;
/** The longest caption (also the alt text). */
export const KETERANGAN_GAMBAR_MAX = 120;
/** How long a signed URL to a Gambar Tipe Kavling works. */
const GAMBAR_URL_SECONDS = 10 * 60;

export interface GambarTipeKavling {
  keterangan: string;
  url: string;
}

export type SetGambarTipeKavlingResult =
  | { ok: true }
  | WriteRefusal
  | {
      ok: false;
      reason:
        | "tidak_ditemukan"
        | "berkas_tidak_didukung"
        | "keterangan_wajib"
        /** The uploader did not confirm the image shows no headstones and no burial area. */
        | "pernyataan_wajib"
        | "berkas_gagal_disimpan";
    };

/**
 * Admin Platform sets (or replaces) a Jenis Makam's Gambar Tipe Kavling: an
 * illustration or plan of its size and layout, never a photo of headstones
 * or the burial area (the uploader confirms it). JPG, PNG or WebP checked by
 * its bytes, at most 10 MB. A replaced image stays in the FileStore, so the
 * earlier Entri Audit still names a file that exists.
 */
export async function setGambarTipeKavling(
  deps: TariffDeps,
  by: Actor,
  jenisMakamId: string,
  input: { gambar: { body: Uint8Array; contentType: string }; keterangan: string; tanpaMakam: boolean },
): Promise<SetGambarTipeKavlingResult> {
  const [jenis] = isUuid(jenisMakamId) ? await deps.db.select().from(tariffJenisMakam).where(eq(tariffJenisMakam.id, jenisMakamId)) : [];
  // Who may write is checked before whether the Jenis Makam exists, so a refusal says nothing about it.
  const refusal = writeRefusal(by, "tarif.ubah", lokasiMitraResource(jenis?.lokasiId ?? ""));
  if (refusal) return refusal;
  if (!jenis) return { ok: false, reason: "tidak_ditemukan" };
  const extension = documentExtension(input.gambar, ["image/jpeg", "image/png", "image/webp"]);
  if (!extension || input.gambar.body.byteLength > GAMBAR_TIPE_KAVLING_MAX_BYTES) return { ok: false, reason: "berkas_tidak_didukung" };
  const keterangan = input.keterangan.trim().replace(/\s+/g, " ");
  if (keterangan === "" || keterangan.length > KETERANGAN_GAMBAR_MAX) return { ok: false, reason: "keterangan_wajib" };
  if (!input.tanpaMakam) return { ok: false, reason: "pernyataan_wajib" };

  const key = `tipe-kavling/${jenis.lokasiId}/${jenis.id}/${randomUUID()}.${extension}`;
  try {
    await deps.files.put({ key, body: input.gambar.body, contentType: input.gambar.contentType });
  } catch {
    return { ok: false, reason: "berkas_gagal_disimpan" };
  }
  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [lama] = await tx.select().from(tariffGambarTipeKavling).where(eq(tariffGambarTipeKavling.jenisMakamId, jenis.id)).for("update");
    const values = { fileKey: key, keterangan, updatedAt: now, updatedByAccountId: by.accountId };
    await tx
      .insert(tariffGambarTipeKavling)
      .values({ jenisMakamId: jenis.id, ...values })
      .onConflictDoUpdate({ target: tariffGambarTipeKavling.jenisMakamId, set: values });
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "tarif.ubah_gambar_jenis_makam",
      entity: { kind: "jenis_makam", id: jenis.id },
      lokasiId: jenis.lokasiId,
      before: lama ? { gambarFileKey: lama.fileKey, gambarKeterangan: lama.keterangan } : null,
      after: { gambarFileKey: key, gambarKeterangan: keterangan, tanpaMakam: true },
      reason: null,
    });
    return { ok: true } as const;
  });
}

/** Admin Platform takes a Jenis Makam's Gambar Tipe Kavling off, audited. */
export async function hapusGambarTipeKavling(
  deps: TariffDeps,
  by: Actor,
  jenisMakamId: string,
): Promise<{ ok: true } | WriteRefusal | { ok: false; reason: "tidak_ditemukan" }> {
  const [jenis] = isUuid(jenisMakamId) ? await deps.db.select().from(tariffJenisMakam).where(eq(tariffJenisMakam.id, jenisMakamId)) : [];
  const refusal = writeRefusal(by, "tarif.ubah", lokasiMitraResource(jenis?.lokasiId ?? ""));
  if (refusal) return refusal;
  if (!jenis) return { ok: false, reason: "tidak_ditemukan" };
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [lama] = await tx.delete(tariffGambarTipeKavling).where(eq(tariffGambarTipeKavling.jenisMakamId, jenis.id)).returning();
    if (!lama) return { ok: false, reason: "tidak_ditemukan" } as const;
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "tarif.ubah_gambar_jenis_makam",
      entity: { kind: "jenis_makam", id: jenis.id },
      lokasiId: jenis.lokasiId,
      before: { gambarFileKey: lama.fileKey, gambarKeterangan: lama.keterangan },
      after: null,
      reason: null,
    });
    return { ok: true } as const;
  });
}

async function gambarOf(deps: TariffDeps, jenisMakamIds: readonly string[]): Promise<Map<string, { lokasiId: string; gambar: GambarTipeKavling }>> {
  const ids = jenisMakamIds.filter(isUuid);
  const out = new Map<string, { lokasiId: string; gambar: GambarTipeKavling }>();
  if (ids.length === 0) return out;
  const rows = await deps.db
    .select({ id: tariffJenisMakam.id, lokasiId: tariffJenisMakam.lokasiId, fileKey: tariffGambarTipeKavling.fileKey, keterangan: tariffGambarTipeKavling.keterangan })
    .from(tariffGambarTipeKavling)
    .innerJoin(tariffJenisMakam, eq(tariffJenisMakam.id, tariffGambarTipeKavling.jenisMakamId))
    .where(inArray(tariffGambarTipeKavling.jenisMakamId, ids));
  await Promise.all(
    rows.map(async (row) => {
      const url = await deps.files.signedUrl(row.fileKey, { expiresInSeconds: GAMBAR_URL_SECONDS }).catch(() => null);
      if (url) out.set(row.id, { lokasiId: row.lokasiId, gambar: { keterangan: row.keterangan, url } });
    }),
  );
  return out;
}

/** The Gambar Tipe Kavling of each Jenis Makam that has one, at a Terverifikasi Lokasi Mitra only (no actor, public pages and the wizard). */
export async function publicGambarTipeKavling(deps: TariffDeps, jenisMakamIds: readonly string[]): Promise<Record<string, GambarTipeKavling>> {
  const found = await gambarOf(deps, jenisMakamIds);
  const listed = new Map<string, boolean>();
  const out: Record<string, GambarTipeKavling> = {};
  for (const [id, { lokasiId, gambar }] of found) {
    if (!listed.has(lokasiId)) listed.set(lokasiId, await deps.lokasi.isTerverifikasi(lokasiId));
    if (listed.get(lokasiId)) out[id] = gambar;
  }
  return out;
}

/** The same, for staff screens (any Lokasi status); the caller has already checked the actor may see that Lokasi. */
export async function staffGambarTipeKavling(deps: TariffDeps, jenisMakamIds: readonly string[]): Promise<Record<string, GambarTipeKavling>> {
  const found = await gambarOf(deps, jenisMakamIds);
  return Object.fromEntries([...found].map(([id, { gambar }]) => [id, gambar]));
}
