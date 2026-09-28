/**
 * Issuing and reading the Bukti Pemesanan (CONTEXT.md: the proof of the Hak Pakai
 * a **paid** Pemesanan Makam at a Lokasi Mitra grants — Lokasi, Petak Makam or
 * Kavling Keluarga, Pemegang Hak, Masa Hak Pakai, issued in the Lokasi Mitra's
 * name and carrying **no amounts**).
 *
 * It lives in Billing because the document series, the unguessable page link and
 * the Operator's header values in force at issue are Billing's, and because the
 * order module that owns a Pemesanan must not reach into a document table. The
 * module that owns the order supplies the **right** — the plots, the Pemegang Hak,
 * the tenure — and Billing records the proof, in the caller's own transaction, so
 * the document commits with the payment that granted the right.
 *
 * One Bukti per order, forever: the unique index on `nomor_pemesanan` makes a
 * retried payment effect, a re-run settle or a second call leave the family with
 * the one document they already have. Nothing here is ever changed afterwards —
 * the table is append-only, the migration refusing UPDATE and DELETE — so a
 * changed right is a new order, not a corrected document.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { nextDocumentNumber } from "./numbering";
import { buktiPemesanan, tagihan } from "./schema";
import { headerSchema, newDocumentLink, noHeader, type DocumentHeader } from "./shared";

/** One plot the right covers, by the number the family knows it by. */
export const buktiPemesananUnitSchema = z.object({
  /** A Petak Makam, or one whole Kavling Keluarga (never its member Petak one by one). */
  jenis: z.enum(["petak", "kavling"]),
  nomor: z.string().trim().min(1).max(60),
  jenisMakamName: z.string().trim().min(1).max(200),
});
export type BuktiPemesananUnit = z.infer<typeof buktiPemesananUnitSchema>;

/** The Pemegang Hak as the Bukti names them: the right's holder, with the contact the order recorded. */
export const buktiPemesananPemegangHakSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phoneNumber: z.string().trim().min(1).max(30),
  email: z.string().trim().max(320).nullable(),
});
export type BuktiPemesananPemegangHak = z.infer<typeof buktiPemesananPemegangHakSchema>;

/**
 * The Masa Hak Pakai (CONTEXT.md): Selamanya, or a fixed term. `mulai` and `sampai`
 * are whole dates, and both are empty while the tenure clock has not started — a
 * Terencana order's Hak Pakai counts its years from the first Pemakaman, so on the
 * day it is paid there is no end date to print.
 */
export const buktiPemesananMasaSchema = z.discriminatedUnion("jenis", [
  z.object({ jenis: z.literal("selamanya") }),
  z.object({
    jenis: z.literal("tahun"),
    years: z.number().int().min(1).max(200),
    mulai: z.iso.date().nullable(),
    sampai: z.iso.date().nullable(),
  }),
]);
export type BuktiPemesananMasa = z.infer<typeof buktiPemesananMasaSchema>;

const nomorPemesananSchema = z.string().trim().regex(/^MKM-\d{4}-\d{6}$/);

/** What a Pemesanan Makam's owner hands Billing to have the right's proof issued. */
export const terbitkanBuktiPemesananSchema = z.object({
  nomorPemesanan: nomorPemesananSchema,
  /** The Lunas Tagihan whose payment granted the right; the document is about the right, not the money. */
  tagihanId: z.uuid(),
  lokasiNama: z.string().trim().min(1).max(200),
  unit: z.array(buktiPemesananUnitSchema).min(1).max(50),
  pemegangHak: buktiPemesananPemegangHakSchema,
  /** The Calon Penghuni label the plot carries; null when the order named none. */
  calonPenghuni: z.string().trim().min(1).max(200).nullable(),
  masaHakPakai: buktiPemesananMasaSchema,
  /** When the right was granted (the payment's instant), which is the document's own date. */
  issuedAt: z.date(),
});
export type TerbitkanBuktiPemesananInput = z.infer<typeof terbitkanBuktiPemesananSchema>;

export type TerbitkanBuktiPemesananResult =
  | { ok: true; nomor: string; link: string }
  | { ok: false; reason: "bukti_pemesanan_tidak_valid" }
  /** No Pengaturan Operator yet: a document cannot be issued without the Operator's header. */
  | typeof noHeader
  /** A Tagihan that does not exist, or is not the one this order was issued. */
  | { ok: false; reason: "tagihan_tidak_ditemukan" }
  /** The Tagihan is not Lunas: the right is only granted once the money is in. */
  | { ok: false; reason: "tagihan_belum_lunas" };

/** One Bukti Pemesanan as the order page and the document page read it. */
export interface BuktiPemesanan {
  nomor: string;
  link: string;
  nomorPemesanan: string;
  tagihanId: string;
  lokasiNama: string;
  unit: BuktiPemesananUnit[];
  pemegangHak: BuktiPemesananPemegangHak;
  calonPenghuni: string | null;
  masaHakPakai: BuktiPemesananMasa;
  issuedAt: Date;
  header: DocumentHeader;
}

/**
 * Issues the one Bukti Pemesanan of an order, in `tx` — the transaction that made
 * its Tagihan Lunas, or the tick that turned that payment into the order's Hak
 * Pakai. Idempotent: an order that already has one answers with that same one and
 * issues nothing, so a retried effect or a second settle never leaves a family
 * with two proofs of one right.
 */
export async function terbitkanBuktiPemesanan(
  db: Database,
  operatorSettings: { current: () => Promise<DocumentHeader | null> },
  rawInput: unknown,
): Promise<TerbitkanBuktiPemesananResult> {
  const parsed = terbitkanBuktiPemesananSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "bukti_pemesanan_tidak_valid" };
  const input = parsed.data;

  const header = await operatorSettings.current();
  if (!header) return noHeader;
  const [tagihanRow] = await db.select({ id: tagihan.id, status: tagihan.status }).from(tagihan).where(eq(tagihan.id, input.tagihanId));
  if (!tagihanRow) return { ok: false, reason: "tagihan_tidak_ditemukan" };
  if (tagihanRow.status !== "lunas") return { ok: false, reason: "tagihan_belum_lunas" };

  const nomor = await nextDocumentNumber(db, "BPM", input.issuedAt);
  const [row] = await db
    .insert(buktiPemesanan)
    .values({
      nomor,
      link: newDocumentLink(),
      nomorPemesanan: input.nomorPemesanan,
      tagihanId: input.tagihanId,
      lokasiNama: input.lokasiNama,
      unit: input.unit,
      pemegangHak: input.pemegangHak,
      calonPenghuni: input.calonPenghuni,
      masaHakPakai: input.masaHakPakai,
      issuedAt: input.issuedAt,
      header,
    })
    .onConflictDoNothing({ target: buktiPemesanan.nomorPemesanan })
    .returning({ nomor: buktiPemesanan.nomor, link: buktiPemesanan.link });
  // The conflict is this order's own: it already has its Bukti, and that is the one it keeps.
  if (row) return { ok: true, nomor: row.nomor, link: row.link };
  return { ok: true, ...(await buktiPemesananOf(db, input.nomorPemesanan))! };
}

/** The Bukti Pemesanan of one order, or null while it has none. */
export async function buktiPemesananOf(db: Database, nomorPemesanan: string): Promise<Omit<BuktiPemesanan, "nomorPemesanan"> | null> {
  const parsed = nomorPemesananSchema.safeParse(nomorPemesanan);
  if (!parsed.success) return null;
  const [row] = await db.select().from(buktiPemesanan).where(eq(buktiPemesanan.nomorPemesanan, parsed.data));
  return row ? toBukti(row) : null;
}

function toBukti(row: typeof buktiPemesanan.$inferSelect): Omit<BuktiPemesanan, "nomorPemesanan"> {
  return {
    nomor: row.nomor,
    link: row.link,
    tagihanId: row.tagihanId,
    lokasiNama: row.lokasiNama,
    unit: z.array(buktiPemesananUnitSchema).parse(row.unit),
    pemegangHak: buktiPemesananPemegangHakSchema.parse(row.pemegangHak),
    calonPenghuni: row.calonPenghuni,
    masaHakPakai: buktiPemesananMasaSchema.parse(row.masaHakPakai),
    issuedAt: row.issuedAt,
    header: headerSchema.parse(row.header),
  };
}
