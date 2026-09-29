/**
 * The Bukti Perpanjangan (spec, Billing > Documents; CONTEXT.md: "the proof of a
 * paid Perpanjangan Makam at a Lokasi Mitra, showing the old and new end dates,
 * issued in the Lokasi Mitra's name"). Billing owns the document, its BPP number
 * and its page; the Perpanjangan module owns what it proves, and asks for one
 * inside the transaction that makes its Tagihan Lunas.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { refusable } from "@/db/unit-of-work";
import type { OperatorSettings } from "@/domain/operator-settings";
import { nextDocumentNumber } from "./numbering";
import { buktiPerpanjangan } from "./schema";
import { currentHeader, headerSchema, newDocumentLink, noHeader, type DocumentHeader } from "./shared";
import { readTagihan } from "./tagihan";

/** One Bukti Perpanjangan as it is issued, and as its document page reads it. */
export interface BuktiPerpanjangan {
  id: string;
  /** `BPP/2026/000123`. */
  nomor: string;
  /** The unguessable part of its page's link. */
  link: string;
  perpanjanganId: string;
  lokasiName: string;
  petakNomor: string;
  pemegangHakName: string;
  endDateLama: string;
  endDateBaru: string;
  terms: number;
  header: DocumentHeader;
  issuedAt: Date;
}

export const issueBuktiPerpanjanganSchema = z.object({
  tagihanId: z.uuid(),
  perpanjanganId: z.string().trim().min(1).max(64),
  lokasiName: z.string().trim().min(1).max(200),
  petakNomor: z.string().trim().min(1).max(300),
  pemegangHakName: z.string().trim().min(1).max(200),
  endDateLama: z.iso.date(),
  endDateBaru: z.iso.date(),
  terms: z.number().int().min(1).max(100),
});
export type IssueBuktiPerpanjanganInput = z.infer<typeof issueBuktiPerpanjanganSchema>;

export type IssueBuktiPerpanjanganResult =
  | { ok: true; bukti: BuktiPerpanjangan }
  | typeof noHeader
  | { ok: false; reason: "tidak_ditemukan" }
  /** The Perpanjangan already has its Bukti: a redelivered payment issues no second one. */
  | { ok: false; reason: "sudah_terbit" };

/** Issues the one Bukti Perpanjangan of a paid Perpanjangan, idempotent by the request it names. */
export async function issueBuktiPerpanjangan(
  deps: { db: Database; operatorSettings: Pick<OperatorSettings, "current"> },
  rawInput: unknown,
  now: Date,
): Promise<IssueBuktiPerpanjanganResult> {
  const parsed = issueBuktiPerpanjanganSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "tidak_ditemukan" };
  const input = parsed.data;
  const header = await currentHeader(deps.operatorSettings);
  if (!header) return noHeader;
  return refusable<IssueBuktiPerpanjanganResult>(deps.db, async (tx) => {
    const [ada] = await tx.select().from(buktiPerpanjangan).where(eq(buktiPerpanjangan.perpanjanganId, input.perpanjanganId));
    if (ada) return { ok: false, reason: "sudah_terbit" };
    if (!(await readTagihan(tx, input.tagihanId))) return { ok: false, reason: "tidak_ditemukan" };
    const nomor = await nextDocumentNumber(tx, "BPP", now);
    const [row] = await tx
      .insert(buktiPerpanjangan)
      .values({ ...input, nomor, link: newDocumentLink(), header, issuedAt: now })
      .returning();
    return { ok: true, bukti: toBukti(row) };
  });
}

/** One Bukti Perpanjangan by its id, or null. */
export async function buktiPerpanjanganById(db: Database, id: string): Promise<BuktiPerpanjangan | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const [row] = await db.select().from(buktiPerpanjangan).where(eq(buktiPerpanjangan.id, id));
  return row ? toBukti(row) : null;
}

/** The Bukti Perpanjangan behind an unguessable link, or null. */
export async function buktiPerpanjanganByLink(db: Database, link: string): Promise<BuktiPerpanjangan | null> {
  const [row] = await db.select().from(buktiPerpanjangan).where(eq(buktiPerpanjangan.link, link));
  return row ? toBukti(row) : null;
}

function toBukti(row: typeof buktiPerpanjangan.$inferSelect): BuktiPerpanjangan {
  return {
    id: row.id,
    nomor: row.nomor,
    link: row.link,
    perpanjanganId: row.perpanjanganId,
    lokasiName: row.lokasiName,
    petakNomor: row.petakNomor,
    pemegangHakName: row.pemegangHakName,
    endDateLama: row.endDateLama,
    endDateBaru: row.endDateBaru,
    terms: row.terms,
    header: headerSchema.parse(row.header),
    issuedAt: row.issuedAt,
  };
}
