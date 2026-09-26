/**
 * Tariffs (spec, domain module 4): versioned price books entered only by
 * Admin Platform, each version with an effective date that may be in the
 * future; old versions are never changed or deleted.
 *
 * Owns tables: tariff_global_version, tariff_jenis_makam, tariff_jenis_makam_version,
 * tariff_biaya_pemakaman_version, tariff_check.
 *
 * Every write is a staff write: it records an Entri Audit through the Audit
 * Log module in the same transaction (with `lokasiId` for a Lokasi Mitra's
 * tariffs), and re-checks `authorize` itself.
 *
 * Reads: the public ones need no actor and serve only a Terverifikasi (listed)
 * Lokasi Mitra; any other reads as unknown. `asStaff(by)` gives the same reads
 * for Admin Platform and that Lokasi's Admin Lokasi, Belum Tayang included,
 * plus who set the "tarif diperiksa" mark. The global tariffs are public.
 */
import type { Actor } from "@/domain/identity";
import type { TariffDeps } from "./deps";
import {
  globalTariff,
  globalTariffVersions,
  setGlobalTariff,
  type GlobalTariffKey,
  type GlobalTariffVersion,
  type SetGlobalTariffInput,
  type SetGlobalTariffResult,
} from "./global-tariffs";
import {
  createJenisMakam,
  setJenisMakamTariff,
  type CreateJenisMakamResult,
  type JenisMakamTariffInput,
  type NewJenisMakam,
  type SetJenisMakamTariffResult,
} from "./jenis-makam";
import { publicVisibility, staffVisibility, tariffReads, type StaffTariffReads, type TariffReads } from "./reads";
import { markTariffsChecked, type MarkTariffsCheckedResult } from "./tariffs-checked";
import {
  setBiayaPemakaman,
  type SetBiayaPemakamanInput,
  type SetBiayaPemakamanResult,
} from "./biaya-pemakaman";

export type { TariffDeps } from "./deps";
export type { GlobalTariffKey, GlobalTariffVersion, SetGlobalTariffInput, SetGlobalTariffResult } from "./global-tariffs";
export type {
  CreateJenisMakamResult,
  JenisMakam,
  JenisMakamTariff,
  JenisMakamTariffInput,
  JenisMakamTariffVersion,
  NewJenisMakam,
  SetJenisMakamTariffResult,
  Tenure,
} from "./jenis-makam";
export type { JenisMakamPrice, LokasiTariffs, PriceAt } from "./lokasi-tariffs";
export type { Provider, Quote, QuoteLine, QuoteRefusal, QuoteResult, QuotedLine } from "./quote";
export type { MarkTariffsCheckedResult, MissingTariff, TariffsChecked } from "./tariffs-checked";
export type { StaffTariffReads, TariffReads } from "./reads";

/** The "tarif diperiksa" mark as the public sees it: when, and whether a tariff changed since; never who. */
export interface PublicTariffsChecked {
  checkedAt: Date;
  changedSinceCheck: boolean;
}
/** Every global tariff, each its own price book. */
export { globalTariffKeys as GLOBAL_TARIFF_KEYS } from "./schema";
export type {
  BiayaPemakaman,
  BiayaPemakamanVersion,
  SetBiayaPemakamanInput,
  SetBiayaPemakamanResult,
} from "./biaya-pemakaman";

/** Public reads (no actor; a Terverifikasi Lokasi Mitra only), the writes, and the staff reads. */
export interface Tariffs extends TariffReads {
  /** Admin Platform enters a new version of a global tariff, in force from its effective date; audited. */
  setGlobalTariff(by: Actor, input: SetGlobalTariffInput): Promise<SetGlobalTariffResult>;
  /** The version of a global tariff in force at `at`, or null when none was yet. */
  globalTariff(key: GlobalTariffKey, at: Date): Promise<GlobalTariffVersion | null>;
  /** Every version of a global tariff ever entered, in entry order (none is ever changed or deleted). */
  globalTariffHistory(key: GlobalTariffKey): Promise<GlobalTariffVersion[]>;
  /** Admin Platform defines a Jenis Makam of a Lokasi Mitra with its first tariff version; audited on that Lokasi. */
  createJenisMakam(by: Actor, lokasiId: string, input: NewJenisMakam): Promise<CreateJenisMakamResult>;
  /** Admin Platform enters a new tariff version of a Jenis Makam; audited on its Lokasi. */
  setJenisMakamTariff(
    by: Actor,
    jenisMakamId: string,
    input: JenisMakamTariffInput & { reason: string | null },
  ): Promise<SetJenisMakamTariffResult>;
  /** Admin Platform enters a new version of a Lokasi Mitra's Biaya Pemakaman (+ tumpang amount); audited on that Lokasi. */
  setBiayaPemakaman(by: Actor, lokasiId: string, input: SetBiayaPemakamanInput): Promise<SetBiayaPemakamanResult>;
  /** Admin Platform marks a Lokasi Mitra's tariffs "diperiksa" for the publish gate; audited on that Lokasi. */
  markTariffsChecked(by: Actor, lokasiId: string, input: { reason: string | null }): Promise<MarkTariffsCheckedResult>;
  /** The latest "tarif diperiksa" mark of a Terverifikasi Lokasi Mitra (when, never who), or null. */
  tariffsChecked(lokasiId: string): Promise<PublicTariffsChecked | null>;
  /** The same reads for staff: Admin Platform and that Lokasi's Admin Lokasi also see a Belum Tayang Lokasi, and who marked it. */
  asStaff(by: Actor): StaffTariffReads;
}

export function createTariffs(deps: TariffDeps): Tariffs {
  const { tariffsChecked, ...publicReads } = tariffReads(deps, publicVisibility(deps));
  return {
    ...publicReads,
    tariffsChecked: async (lokasiId) => {
      const mark = await tariffsChecked(lokasiId);
      return mark && { checkedAt: mark.checkedAt, changedSinceCheck: mark.changedSinceCheck };
    },
    asStaff: (by) => tariffReads(deps, staffVisibility(deps, by)),
    setGlobalTariff: (by, input) => setGlobalTariff(deps, by, input),
    globalTariff: (key, at) => globalTariff(deps, key, at),
    globalTariffHistory: (key) => globalTariffVersions(deps.db, key),
    createJenisMakam: (by, lokasiId, input) => createJenisMakam(deps, by, lokasiId, input),
    setJenisMakamTariff: (by, jenisMakamId, input) => setJenisMakamTariff(deps, by, jenisMakamId, input),
    setBiayaPemakaman: (by, lokasiId, input) => setBiayaPemakaman(deps, by, lokasiId, input),
    markTariffsChecked: (by, lokasiId, input) => markTariffsChecked(deps, by, lokasiId, input),
  };
}
