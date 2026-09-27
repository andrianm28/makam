import type { Actor } from "@/domain/identity";
import { biayaPemakamanVersions, type BiayaPemakamanVersion } from "./biaya-pemakaman";
import type { TariffDeps } from "./deps";
import { findJenisMakam, jenisMakamVersions, type JenisMakamTariffVersion } from "./jenis-makam";
import { lokasiTariffs, type LokasiTariffs } from "./lokasi-tariffs";
import { lokasiPublicPricing, type LokasiPublicPricing } from "./public-pricing";
import { quote, type QuoteLine, type QuoteResult } from "./quote";
import { tariffsChecked, type TariffsChecked } from "./tariffs-checked";
import { tpuPublicPricing, type TpuPublicPricing } from "./tpu-pricing";

/**
 * Which Lokasi Mitra a read may serve. Public reads: only a Terverifikasi
 * (listed) one. Staff reads: any the actor may see (Admin Platform, and that
 * Lokasi's Admin Lokasi), Belum Tayang included. Anything else reads as unknown.
 */
export type Visibility = (lokasiId: string) => Promise<boolean>;

export function publicVisibility(deps: TariffDeps): Visibility {
  return (lokasiId) => deps.lokasi.isTerverifikasi(lokasiId);
}

export function staffVisibility(deps: TariffDeps, by: Actor): Visibility {
  return async (lokasiId) => (await deps.lokasi.lokasiMitra(by, lokasiId)).ok;
}

/** Asks about each Lokasi once per read (a quote prices several lines, twice with its scheduled change). */
function remembered(visible: Visibility): Visibility {
  const answers = new Map<string, Promise<boolean>>();
  return (lokasiId) => {
    let answer = answers.get(lokasiId);
    if (!answer) {
      answer = visible(lokasiId);
      answers.set(lokasiId, answer);
    }
    return answer;
  };
}

/** A Lokasi Mitra's tariffs as some reader may see them. */
export interface TariffReads {
  /** A Lokasi Mitra's tariffs as in force at `at`, each with its scheduled change (none for a Lokasi this reader may not see). */
  lokasiTariffs(lokasiId: string, at: Date): Promise<LokasiTariffs>;
  /** Every tariff version of a Jenis Makam, in entry order. */
  jenisMakamTariffHistory(jenisMakamId: string): Promise<JenisMakamTariffVersion[]>;
  /** Every Biaya Pemakaman version of a Lokasi Mitra, in entry order. */
  biayaPemakamanHistory(lokasiId: string): Promise<BiayaPemakamanVersion[]>;
  /** The all-in price of a set of lines at `at`: each line priced and attributed, plus the total. */
  quote(lines: readonly QuoteLine[], at: Date): Promise<QuoteResult>;
  /**
   * Every price the public Lokasi page or a Daftar Lokasi card shows, under
   * the v1 selection rules (a Jenis Makam over the QRIS cap left out
   * entirely, "mulai Rp X", whether a Perpanjangan price shows): each an
   * all-in total from `quote()` at `at`.
   */
  lokasiPricing(lokasiId: string, at: Date): Promise<LokasiPublicPricing>;
  /**
   * Every price a TPU page or a TPU card shows, at `at`: the two Biaya
   * Pengurusan amounts, the Retribusi Pemda as its own line (Rp 0 where the
   * Pemda charges nothing) and the card's starting price. No Biaya Layanan
   * Platform: a TPU order never carries one.
   */
  tpuPricing(at: Date): Promise<TpuPublicPricing>;
}

/** The staff reads also say who set the "tarif diperiksa" mark. */
export interface StaffTariffReads extends TariffReads {
  /** The latest "tarif diperiksa" mark of a Lokasi Mitra (when, by whom), or null when never set. */
  tariffsChecked(lokasiId: string): Promise<TariffsChecked | null>;
}

export function tariffReads(deps: TariffDeps, visibility: Visibility): StaffTariffReads {
  const { db } = deps;
  return {
    lokasiTariffs: (lokasiId, at) => lokasiTariffs(db, remembered(visibility), lokasiId, at),
    jenisMakamTariffHistory: async (jenisMakamId) => {
      const jenisMakam = await findJenisMakam(db, jenisMakamId);
      if (!jenisMakam || !(await visibility(jenisMakam.lokasiId))) return [];
      return jenisMakamVersions(db, jenisMakam.id);
    },
    biayaPemakamanHistory: async (lokasiId) => ((await visibility(lokasiId)) ? biayaPemakamanVersions(db, lokasiId) : []),
    quote: (lines, at) => quote(db, remembered(visibility), lines, at),
    lokasiPricing: (lokasiId, at) => lokasiPublicPricing(db, remembered(visibility), lokasiId, at),
    tpuPricing: (at) => tpuPublicPricing(db, remembered(visibility), at),
    tariffsChecked: async (lokasiId) => ((await visibility(lokasiId)) ? tariffsChecked(db, lokasiId) : null),
  };
}
