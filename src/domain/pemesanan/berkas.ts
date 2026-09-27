/**
 * A family's own documents on one order (spec, Pemesanan; stories 29, 30 and
 * 120; ticket 23's AC 5): the family adds a file for a checklist item at any
 * time, and the Admin Lokasi ticks the item off when they have it in hand.
 *
 * Nothing here ever blocks a confirmation or a burial. A family may upload
 * before the burial, after it, or never (paper on the day), and a tick records
 * what the Lokasi has seen — never what a family must have.
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { documentExtension, type DocumentContentType } from "@/lib/files/document-type";
import type { Pemesan } from "./deps";
import type { PemesananDeps } from "./deps";
import { pemesananBerkas, pemesananMakam } from "./schema";

/** A family document is a photo of a paper or a scan of it. */
const BERKAS_TYPES: readonly DocumentContentType[] = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/** The largest document accepted, 10 MB (the same ceiling as every other family or staff upload). */
export const DOKUMEN_MAX_BYTES = 10 * 1024 * 1024;

/** How long a document's signed URL works, for whoever may read that one document. */
export const DOKUMEN_URL_SECONDS = 5 * 60;

export const unggahDokumenSchema = z.object({
  nomor: z.string().trim().regex(/^MKM-\d{4}-\d{6}$/),
  /** The checklist item this file is for, as the Lokasi Mitra writes it. */
  nama: z.string().trim().min(1).max(200),
  file: z.object({ body: z.instanceof(Uint8Array), contentType: z.string().trim().max(100) }),
});
export type UnggahDokumenInput = z.infer<typeof unggahDokumenSchema>;

export const centangDokumenSchema = z.object({
  nomor: z.string().trim().regex(/^MKM-\d{4}-\d{6}$/),
  nama: z.string().trim().min(1).max(200),
});
export type CentangDokumenInput = z.infer<typeof centangDokumenSchema>;

export type DokumenResult =
  | { ok: true; nama: string }
  | WriteRefusal
  | { ok: false; reason: "input_tidak_valid" }
  /** No order of that Nomor Pemesanan, or not the caller's own. */
  | { ok: false; reason: "pesanan_tidak_ditemukan" }
  /** The name is not on the Lokasi Mitra's document checklist. */
  | { ok: false; reason: "dokumen_tidak_dikenal" }
  | { ok: false; reason: "berkas_kosong" | "berkas_tidak_didukung" | "penyimpanan_belum_tersedia" };

/**
 * The family adds (or replaces) the file for one checklist item of its own
 * order, at any time. Not a staff write, so no Entri Audit: the file lands in
 * the private FileStore and the row says who put it there and when.
 */
export async function unggahDokumen(
  deps: Pick<PemesananDeps, "db" | "clock" | "files" | "lokasi">,
  pemesan: Pemesan,
  rawInput: unknown,
): Promise<DokumenResult> {
  const parsed = unggahDokumenSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;
  const order = await orderOf(deps, pemesan, input.nomor);
  if (!order) return { ok: false, reason: "pesanan_tidak_ditemukan" };
  if (!(await checklistOf(deps, order.lokasiId)).includes(input.nama)) return { ok: false, reason: "dokumen_tidak_dikenal" };
  if (input.file.body.byteLength === 0) return { ok: false, reason: "berkas_kosong" };
  const extension = documentExtension(input.file, BERKAS_TYPES);
  if (!extension || input.file.body.byteLength > DOKUMEN_MAX_BYTES) return { ok: false, reason: "berkas_tidak_didukung" };

  const now = deps.clock.now();
  const key = `pemesanan/${order.id}/${randomUUID()}.${extension}`;
  try {
    await deps.files.put({ key, body: input.file.body, contentType: input.file.contentType });
  } catch {
    return { ok: false, reason: "penyimpanan_belum_tersedia" };
  }
  await deps.db
    .insert(pemesananBerkas)
    .values({
      pemesananId: order.id,
      nama: input.nama,
      fileKey: key,
      diunggahPada: now,
      diunggahOleh: pemesan.accountId,
      dibuatPada: now,
    })
    .onConflictDoUpdate({
      target: [pemesananBerkas.pemesananId, pemesananBerkas.nama],
      set: { fileKey: key, diunggahPada: now, diunggahOleh: pemesan.accountId },
    });
  return { ok: true, nama: input.nama };
}

/**
 * The Admin Lokasi of that Lokasi Mitra ticks a checklist item off: they have it
 * in hand, whoever brought it. Audited on the Lokasi, like every staff write.
 */
export async function centangDokumen(
  deps: PemesananDeps,
  by: Actor,
  rawInput: unknown,
): Promise<DokumenResult> {
  const parsed = centangDokumenSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;
  const [order] = await deps.db.select().from(pemesananMakam).where(eq(pemesananMakam.nomor, input.nomor));
  if (!order) return { ok: false, reason: "pesanan_tidak_ditemukan" };
  const refusal = writeRefusal(by, "pemesanan.centang_dokumen", lokasiMitraResource(order.lokasiId));
  if (refusal) return refusal;
  if (!(await checklistOf(deps, order.lokasiId)).includes(input.nama)) return { ok: false, reason: "dokumen_tidak_dikenal" };

  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const ticked = await tx
      .insert(pemesananBerkas)
      .values({ pemesananId: order.id, nama: input.nama, dicentangPada: now, dicentangOleh: by.accountId, dibuatPada: now })
      .onConflictDoUpdate({
        target: [pemesananBerkas.pemesananId, pemesananBerkas.nama],
        set: { dicentangPada: now, dicentangOleh: by.accountId },
      })
      .returning({ id: pemesananBerkas.id });
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "pemesanan.centang_dokumen",
      entity: { kind: "pemesanan_berkas", id: ticked[0]!.id },
      lokasiId: order.lokasiId,
      before: null,
      after: { nama: input.nama, dicentang: true },
      reason: null,
    });
    return { ok: true as const, nama: input.nama };
  });
}

/**
 * A short-lived URL for one document, for whoever may read that one document:
 * the family that put it there, or the Admin Lokasi of the Lokasi Mitra whose
 * order it is (spec: documents are private, served by short-lived signed URLs).
 */
export async function urlDokumen(
  deps: Pick<PemesananDeps, "db" | "files">,
  pemesan: Pemesan,
  nomor: string,
  nama: string,
): Promise<string | null> {
  const order = await orderOf(deps, pemesan, nomor);
  if (!order) return null;
  return signedUrlOf(deps, order.id, nama);
}

/** The same, for that Lokasi Mitra's own Admin Lokasi (or Admin Platform); null for another Lokasi's order. */
export async function urlDokumenUntukStaf(
  deps: Pick<PemesananDeps, "db" | "files" | "lokasi">,
  by: Actor,
  nomor: string,
  nama: string,
): Promise<string | null> {
  const [order] = await deps.db.select().from(pemesananMakam).where(eq(pemesananMakam.nomor, nomor));
  if (!order) return null;
  const refusal = writeRefusal(by, "pemesanan.lihat_staf", lokasiMitraResource(order.lokasiId));
  if (refusal) return null;
  return signedUrlOf(deps, order.id, nama);
}

async function signedUrlOf(
  deps: Pick<PemesananDeps, "db" | "files">,
  pemesananId: string,
  nama: string,
): Promise<string | null> {
  const [row] = await deps.db
    .select({ fileKey: pemesananBerkas.fileKey })
    .from(pemesananBerkas)
    .where(and(eq(pemesananBerkas.pemesananId, pemesananId), eq(pemesananBerkas.nama, nama)));
  if (!row?.fileKey) return null;
  return deps.files.signedUrl(row.fileKey, { expiresInSeconds: DOKUMEN_URL_SECONDS });
}

/** The order, for its own Pemesan only, as the wizard's own orders are read. */
async function orderOf(
  deps: Pick<PemesananDeps, "db">,
  pemesan: Pemesan,
  nomor: string,
): Promise<{ id: string; lokasiId: string } | null> {
  const [row] = await deps.db
    .select({ id: pemesananMakam.id, lokasiId: pemesananMakam.lokasiId })
    .from(pemesananMakam)
    .where(and(eq(pemesananMakam.nomor, nomor), eq(pemesananMakam.pemesanAccountId, pemesan.accountId)));
  return row ?? null;
}

/** The Lokasi Mitra's document checklist, as its own record words it (empty while the record cannot be read). */
async function checklistOf(deps: Pick<PemesananDeps, "lokasi">, lokasiId: string): Promise<string[]> {
  return deps.lokasi.documentChecklistOf(lokasiId);
}
