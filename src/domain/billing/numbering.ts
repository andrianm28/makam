import { sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { wibDateOf } from "@/lib/time/jakarta";
import { documentCounter, type documentSeries } from "./schema";

/**
 * The document types numbered per type per year (spec, Billing > Documents):
 * TGH Tagihan, BYR Bukti Pembayaran, RFD Bukti Pengembalian Dana, BKP Bukti
 * Pencairan, BPM Bukti Pemesanan, BPP Bukti Perpanjangan.
 */
export type DocumentType = Exclude<(typeof documentSeries)[number], "MKM">;

/**
 * The next number of a series in the WIB year of `at`, taken inside `db`'s
 * transaction: concurrent callers queue on the counter row, and a rolled-back
 * caller gives its number back, so the series is gap-free.
 */
async function nextInSeries(db: Database, series: (typeof documentSeries)[number], at: Date): Promise<{ year: number; number: number }> {
  const year = Number(wibDateOf(at).slice(0, 4));
  const [row] = await db
    .insert(documentCounter)
    .values({ series, year, lastNumber: 1 })
    .onConflictDoUpdate({
      target: [documentCounter.series, documentCounter.year],
      set: { lastNumber: sql`${documentCounter.lastNumber} + 1` },
    })
    .returning({ lastNumber: documentCounter.lastNumber });
  return { year, number: row.lastNumber };
}

const sixDigits = (number: number) => String(number).padStart(6, "0");

/** The next document number of a type, e.g. `TGH/2026/000123`. */
export async function nextDocumentNumber(db: Database, type: DocumentType, at: Date): Promise<string> {
  const { year, number } = await nextInSeries(db, type, at);
  return `${type}/${year}/${sixDigits(number)}`;
}

/** The next Nomor Pemesanan, `MKM-2026-000123`: one series for every order kind. */
export async function nextNomorPemesanan(db: Database, at: Date): Promise<string> {
  const { year, number } = await nextInSeries(db, "MKM", at);
  return `MKM-${year}-${sixDigits(number)}`;
}
