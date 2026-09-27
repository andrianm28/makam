import { sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { GlobalTariffKey } from "./global-tariffs";

/**
 * One tariff entry per price book at a time (a transaction-scoped advisory
 * lock), so each Entri Audit's "before" is exactly the version it replaces.
 */
async function lockTariffs(tx: Database, name: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`tariffs.${name}`}))`);
}

/** Every tariff of one Lokasi Mitra: its Jenis Makam, their versions, its Biaya Pemakaman, its "tarif diperiksa" mark. */
export function lockLokasiTariffs(tx: Database, lokasiId: string): Promise<void> {
  return lockTariffs(tx, `lokasi.${lokasiId}`);
}

/** One global tariff's price book. */
export function lockGlobalTariff(tx: Database, key: GlobalTariffKey): Promise<void> {
  return lockTariffs(tx, `global.${key}`);
}

/** One Layanan variant's price book (its Lokasi Mitra's price, the DKI price or the Mitra Jasa rate). */
export function lockLayananHarga(tx: Database, name: string): Promise<void> {
  return lockTariffs(tx, `layanan.${name}`);
}
