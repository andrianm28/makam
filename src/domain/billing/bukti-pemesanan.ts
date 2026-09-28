/**
 * The Bukti Pemesanan (spec, Billing > Documents: "Bukti Pemesanan (right
 * only, no amounts, in the Lokasi Mitra's name)", and CONTEXT.md: "The proof
 * of the Hak Pakai granted by a paid Pemesanan Makam (Lokasi, Petak Makam,
 * Pemegang Hak, masa Hak Pakai), issued in the Lokasi Mitra's name once payment
 * settles; it carries no amounts"). Billing owns the document, its number and
 * its page; the module that owns the order owns what it proves, and asks for one
 * inside the transaction that makes its Tagihan Lunas.
 *
 * What it proves is copied onto the document, the way a Tagihan keeps the
 * Operator's header values in force at issue: the right does not change while
 * the document is being read, and Billing never reads another module's tables.
 */
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { refusable } from "@/db/unit-of-work";
import type { OperatorSettings } from "@/domain/operator-settings";
import { nextDocumentNumber } from "./numbering";
import { buktiPemesanan } from "./schema";
import { currentHeader, headerSchema, newDocumentLink, noHeader, type DocumentHeader } from "./shared";
import { readTagihan } from "./tagihan";

/** One Bukti Pemesanan as it is issued, and as its document page reads it. */
export interface BuktiPemesanan {
  id: string;
  /** `BPM/2026/000123`. */
  nomor: string;
  /** The unguessable part of its page's link (256 random bits, base64url). */
  link: string;
  pemesananId: string;
  nomorPemesanan: string;
  /** The Lokasi Mitra the right is against, named as the order named it. */
  lokasiName: string;
  petakNomor: string;
  pemegangHakName: string;
  /** The Hak Pakai's term: the first Pemakaman's date, and the end of a fixed term (null for a Selamanya one). */
  masa: { mulai: string; selesai: string | null };
  /** The Lokasi's "Petunjuk arah" link, or null when it has nothing to map. */
  petunjukArah: string | null;
  /** The Operator's header values in force when the Bukti was issued. */
  header: DocumentHeader;
  issuedAt: Date;
}

/** What the module that owns the order hands over to have one issued. */
export const issueBuktiPemesananSchema = z.object({
  /** The Tagihan whose payment settled: the right this Bukti proves is what that payment bought. */
  tagihanId: z.uuid(),
  pemesananId: z.string().trim().min(1).max(64),
  nomorPemesanan: z.string().trim().min(1).max(50),
  lokasiName: z.string().trim().min(1).max(200),
  petakNomor: z.string().trim().min(1).max(60),
  pemegangHakName: z.string().trim().min(1).max(200),
  masa: z.object({ mulai: z.iso.date(), selesai: z.iso.date().nullable() }),
  petunjukArah: z.url().max(500).nullable().optional(),
});
export type IssueBuktiPemesananInput = z.infer<typeof issueBuktiPemesananSchema>;

export type IssueBuktiPemesananResult =
  | { ok: true; bukti: BuktiPemesanan }
  | typeof noHeader
  /** No Tagihan of that id, or an input that is not a Bukti's facts. */
  | { ok: false; reason: "tidak_ditemukan" }
  /** The order already has its Bukti: a redelivered payment issues no second one. */
  | { ok: false; reason: "sudah_terbit" };

/**
 * Issues the one Bukti Pemesanan of a paid order in `db`'s transaction at `now`
 * — numbered BPM/…, with its own unguessable link and the Operator's header as it
 * stands now. Idempotent by the order it names: a second call (a redelivered
 * webhook, a retried payment effect) finds the Bukti already there and issues
 * nothing, so a number is never spent twice and an order is never given two.
 */
export async function issueBuktiPemesanan(
  deps: { db: Database; operatorSettings: Pick<OperatorSettings, "current"> },
  rawInput: unknown,
  now: Date,
): Promise<IssueBuktiPemesananResult> {
  const parsed = issueBuktiPemesananSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "tidak_ditemukan" };
  const input = parsed.data;
  const header = await currentHeader(deps.operatorSettings);
  if (!header) return noHeader;
  return refusable<IssueBuktiPemesananResult>(deps.db, async (tx) => {
    const [ada] = await tx.select().from(buktiPemesanan).where(eq(buktiPemesanan.pemesananId, input.pemesananId));
    if (ada) return { ok: false, reason: "sudah_terbit" };
    if (!(await readTagihan(tx, input.tagihanId))) return { ok: false, reason: "tidak_ditemukan" };
    const nomor = await nextDocumentNumber(tx, "BPM", now);
    const [row] = await tx
      .insert(buktiPemesanan)
      .values({
        nomor,
        link: newDocumentLink(),
        tagihanId: input.tagihanId,
        pemesananId: input.pemesananId,
        nomorPemesanan: input.nomorPemesanan,
        lokasiName: input.lokasiName,
        petakNomor: input.petakNomor,
        pemegangHakName: input.pemegangHakName,
        masaMulai: input.masa.mulai,
        masaSelesai: input.masa.selesai,
        petunjukArah: input.petunjukArah ?? null,
        header,
        issuedAt: now,
      })
      .returning();
    return { ok: true, bukti: toBukti(row) };
  });
}

/** One Bukti Pemesanan by its id, or null. */
export async function buktiPemesananById(db: Database, id: string): Promise<BuktiPemesanan | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const [row] = await db.select().from(buktiPemesanan).where(eq(buktiPemesanan.id, id));
  return row ? toBukti(row) : null;
}

/** The Bukti Pemesanan behind an unguessable link, or null. */
export async function buktiPemesananByLink(db: Database, link: string): Promise<BuktiPemesanan | null> {
  const [row] = await db.select().from(buktiPemesanan).where(eq(buktiPemesanan.link, link));
  return row ? toBukti(row) : null;
}

/** Every Bukti Pemesanan issued, oldest first: the numbering's own proof that one order gets one number. */
export async function allBuktiPemesanan(db: Database): Promise<BuktiPemesanan[]> {
  const rows = await db.select().from(buktiPemesanan).orderBy(asc(buktiPemesanan.issuedAt), asc(buktiPemesanan.nomor));
  return rows.map(toBukti);
}

function toBukti(row: typeof buktiPemesanan.$inferSelect): BuktiPemesanan {
  return {
    id: row.id,
    nomor: row.nomor,
    link: row.link,
    pemesananId: row.pemesananId,
    nomorPemesanan: row.nomorPemesanan,
    lokasiName: row.lokasiName,
    petakNomor: row.petakNomor,
    pemegangHakName: row.pemegangHakName,
    masa: { mulai: row.masaMulai, selesai: row.masaSelesai },
    petunjukArah: row.petunjukArah,
    header: headerSchema.parse(row.header),
    issuedAt: row.issuedAt,
  };
}
