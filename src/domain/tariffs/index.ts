/**
 * Tariffs (spec, domain module 4): versioned price books entered only by
 * Admin Platform, each version with an effective date that may be in the
 * future; old versions are never changed or deleted.
 *
 * Owns tables: tariff_global_version, tariff_jenis_makam, tariff_jenis_makam_version.
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
  };
}
