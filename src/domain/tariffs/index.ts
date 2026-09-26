/**
 * Tariffs (spec, domain module 4): versioned price books entered only by
 * Admin Platform, each version with an effective date that may be in the
 * future; old versions are never changed or deleted.
 *
 * Owns tables: tariff_global_version.
 *
 * Every write is a staff write: it records an Entri Audit through the Audit
 * Log module in the same transaction, and re-checks `authorize` itself.
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

export type { TariffDeps } from "./deps";
export type { GlobalTariffKey, GlobalTariffVersion, SetGlobalTariffInput, SetGlobalTariffResult } from "./global-tariffs";

export interface Tariffs {
  /** Admin Platform enters a new version of a global tariff, in force from its effective date; audited. */
  setGlobalTariff(by: Actor, input: SetGlobalTariffInput): Promise<SetGlobalTariffResult>;
  /** The version of a global tariff in force at `at`, or null when none was yet. */
  globalTariff(key: GlobalTariffKey, at: Date): Promise<GlobalTariffVersion | null>;
  /** Every version of a global tariff ever entered, in entry order (none is ever changed or deleted). */
  globalTariffHistory(key: GlobalTariffKey): Promise<GlobalTariffVersion[]>;
}

export function createTariffs(deps: TariffDeps): Tariffs {
  return {
    setGlobalTariff: (by, input) => setGlobalTariff(deps, by, input),
    globalTariff: (key, at) => globalTariff(deps, key, at),
    globalTariffHistory: (key) => globalTariffVersions(deps.db, key),
  };
}
