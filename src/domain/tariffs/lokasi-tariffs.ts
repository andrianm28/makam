import type { Database } from "@/db/client";
import { jenisMakamOfLokasi, jenisMakamVersions, type JenisMakam, type JenisMakamTariffVersion } from "./jenis-makam";
import { inForceAt, nextAfter } from "./versions";

/** A price as a page shows it: the version in force at an instant, and the next one scheduled after it. */
export interface PriceAt<V> {
  /** In force at the instant asked about, or null when none was yet ("Harga berlaku sejak <inForce.effectiveOn>"). */
  inForce: V | null;
  /** The next version, from its effective date ("Harga baru mulai <scheduledChange.effectiveOn>"), or null. */
  scheduledChange: V | null;
}

export type JenisMakamPrice = JenisMakam & PriceAt<JenisMakamTariffVersion>;

/** A Lokasi Mitra's tariffs at an instant. */
export interface LokasiTariffs {
  /** Every Jenis Makam, by name, with its price at that instant. */
  jenisMakam: JenisMakamPrice[];
}

export function priceAt<V extends Parameters<typeof inForceAt>[0][number]>(versions: readonly V[], at: Date): PriceAt<V> {
  return { inForce: inForceAt(versions, at), scheduledChange: nextAfter(versions, at) };
}

export async function lokasiTariffs(db: Database, lokasiId: string, at: Date): Promise<LokasiTariffs> {
  const jenisMakam = await jenisMakamOfLokasi(db, lokasiId);
  const prices = await Promise.all(
    jenisMakam.map(async (one) => ({ ...one, ...priceAt(await jenisMakamVersions(db, one.id), at) })),
  );
  return { jenisMakam: prices };
}
