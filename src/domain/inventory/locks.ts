import { sql } from "drizzle-orm";
import type { Database } from "@/db/client";

async function lockInventory(tx: Database, name: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`inventory.${name}`}))`);
}

/**
 * One edit of a Blok's grid at a time (a transaction-scoped advisory lock), so
 * two concurrent bulk edits (or an edge insert racing a numbering check)
 * never interleave their reads and writes of the same Blok.
 */
export function lockBlok(tx: Database, blokId: string): Promise<void> {
  return lockInventory(tx, `blok.${blokId}`);
}

/**
 * One Lokasi Mitra's Nomor Makam / Nomor Kavling namespace at a time, so two
 * concurrent writes in different Blok of the same Lokasi never both pass a
 * uniqueness check for the same number.
 */
export function lockLokasiInventory(tx: Database, lokasiId: string): Promise<void> {
  return lockInventory(tx, `lokasi.${lokasiId}`);
}
