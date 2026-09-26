import type { Database } from "@/db/client";
import { biayaPemakamanVersions, type BiayaPemakamanVersion } from "./biaya-pemakaman";
import { jenisMakamOfLokasi, jenisMakamVersions, type JenisMakam, type JenisMakamTariffVersion } from "./jenis-makam";
import type { Visibility } from "./reads";
import { inForceAt, nextAfter, type VersionTimes } from "./versions";

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
  /** The Biaya Pemakaman (and tumpang amount) at that instant. */
  biayaPemakaman: PriceAt<BiayaPemakamanVersion>;
}

export function priceAt<V extends VersionTimes>(versions: readonly V[], at: Date): PriceAt<V> {
  return { inForce: inForceAt(versions, at), scheduledChange: nextAfter(versions, at) };
}

/** A Lokasi Mitra's tariffs at `at`; none for a Lokasi the reader may not see (as for an unknown one). */
export async function lokasiTariffs(db: Database, visible: Visibility, lokasiId: string, at: Date): Promise<LokasiTariffs> {
  if (!(await visible(lokasiId))) return { jenisMakam: [], biayaPemakaman: { inForce: null, scheduledChange: null } };
  const [jenisMakam, biayaPemakaman] = await Promise.all([
    jenisMakamOfLokasi(db, lokasiId),
    biayaPemakamanVersions(db, lokasiId),
  ]);
  const prices = await Promise.all(
    jenisMakam.map(async (one) => ({ ...one, ...priceAt(await jenisMakamVersions(db, one.id), at) })),
  );
  return { jenisMakam: prices, biayaPemakaman: priceAt(biayaPemakaman, at) };
}
