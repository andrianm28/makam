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
 * tariffs), and re-checks `authorize` itself. Reads need no actor: prices are public.
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
  jenisMakamVersions,
  setJenisMakamTariff,
  type CreateJenisMakamResult,
  type JenisMakamTariffInput,
  type JenisMakamTariffVersion,
  type NewJenisMakam,
  type SetJenisMakamTariffResult,
} from "./jenis-makam";
import { lokasiTariffs, type LokasiTariffs } from "./lokasi-tariffs";
import { quote, type QuoteLine, type QuoteResult } from "./quote";
import {
  markTariffsChecked,
  tariffsChecked,
  type MarkTariffsCheckedResult,
  type TariffsChecked,
} from "./tariffs-checked";
import {
  biayaPemakamanVersions,
  setBiayaPemakaman,
  type BiayaPemakamanVersion,
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
/** Every global tariff, each its own price book. */
export { globalTariffKeys as GLOBAL_TARIFF_KEYS } from "./schema";
export type {
  BiayaPemakaman,
  BiayaPemakamanVersion,
  SetBiayaPemakamanInput,
  SetBiayaPemakamanResult,
} from "./biaya-pemakaman";

export interface Tariffs {
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
  /** Every tariff version of a Jenis Makam, in entry order. */
  jenisMakamTariffHistory(jenisMakamId: string): Promise<JenisMakamTariffVersion[]>;
  /** A Lokasi Mitra's tariffs as in force at `at`, each with its scheduled change. */
  lokasiTariffs(lokasiId: string, at: Date): Promise<LokasiTariffs>;
  /** Admin Platform enters a new version of a Lokasi Mitra's Biaya Pemakaman (+ tumpang amount); audited on that Lokasi. */
  setBiayaPemakaman(by: Actor, lokasiId: string, input: SetBiayaPemakamanInput): Promise<SetBiayaPemakamanResult>;
  /** Every Biaya Pemakaman version of a Lokasi Mitra, in entry order. */
  biayaPemakamanHistory(lokasiId: string): Promise<BiayaPemakamanVersion[]>;
  /** The all-in price of a set of lines at `at`: each line priced and attributed, plus the total. */
  quote(lines: readonly QuoteLine[], at: Date): Promise<QuoteResult>;
  /** Admin Platform marks a Lokasi Mitra's tariffs "diperiksa" for the publish gate; audited on that Lokasi. */
  markTariffsChecked(by: Actor, lokasiId: string, input: { reason: string | null }): Promise<MarkTariffsCheckedResult>;
  /** The latest "tarif diperiksa" mark of a Lokasi Mitra, or null when it was never set. */
  tariffsChecked(lokasiId: string): Promise<TariffsChecked | null>;
}

export function createTariffs(deps: TariffDeps): Tariffs {
  return {
    setGlobalTariff: (by, input) => setGlobalTariff(deps, by, input),
    globalTariff: (key, at) => globalTariff(deps, key, at),
    globalTariffHistory: (key) => globalTariffVersions(deps.db, key),
    createJenisMakam: (by, lokasiId, input) => createJenisMakam(deps, by, lokasiId, input),
    setJenisMakamTariff: (by, jenisMakamId, input) => setJenisMakamTariff(deps, by, jenisMakamId, input),
    jenisMakamTariffHistory: (jenisMakamId) => jenisMakamVersions(deps.db, jenisMakamId),
    lokasiTariffs: (lokasiId, at) => lokasiTariffs(deps.db, lokasiId, at),
    setBiayaPemakaman: (by, lokasiId, input) => setBiayaPemakaman(deps, by, lokasiId, input),
    biayaPemakamanHistory: (lokasiId) => biayaPemakamanVersions(deps.db, lokasiId),
    quote: (lines, at) => quote(deps.db, lines, at),
    markTariffsChecked: (by, lokasiId, input) => markTariffsChecked(deps, by, lokasiId, input),
    tariffsChecked: (lokasiId) => tariffsChecked(deps.db, lokasiId),
  };
}
