import { withinPaymentCap } from "@/domain/billing";
import type { AllInPrice, HargaLayananVersion, QuoteLine, QuoteResult } from "@/domain/tariffs";
import type { LayananDeps } from "./deps";
import { katalog, type LayananTerbaca } from "./katalog";
import { findPaketById } from "./paket";
import { penawaranOfLokasi, varianDenganLayanan, type VarianDenganLayanan } from "./varian";

/**
 * What a place offers, priced (spec, Layanan): the Layanan a Lokasi Mitra
 * switched on, and the Layanan variants Admin Platform marked "boleh di TPU
 * DKI", each with that place's all-in price at `at` from `quote()`.
 *
 * A variant with no price in force is not offered — that is what "no free
 * pricing" means here — and a Paket Layanan is offered only where every one of
 * its items is, at the sum of its items' prices there.
 */

/** Where a price is asked for: a Lokasi Mitra, or any DKI TPU (the price is the same in every one). */
export type Tempat = { kind: "lokasi_mitra"; lokasiId: string } | { kind: "tpu_dki" };

/** One offered variant, with the place's all-in price for it. */
export type VarianDitawarkan = VarianDenganLayanan & { harga: AllInPrice };

/** One Layanan as a place offers it, with every offered variant and its price. */
export interface LayananDiTempat {
  /** The Layanan itself, as the catalog carries it, with the proof it requires. */
  layanan: LayananTerbaca;
  varian: VarianDitawarkan[];
}

/**
 * One Layanan as one Lokasi Mitra stands: every variant of it, whether this place
 * offers that variant, and the price this place charges at `at` (null when none
 * is in force). What Admin Platform reads while it is still arranging a Lokasi
 * Mitra, so it can switch a variant on and give it a price.
 */
export interface LayananDiLokasi {
  layanan: LayananTerbaca;
  varian: (VarianDenganLayanan & { ditawarkan: boolean; harga: HargaLayananVersion | null })[];
}

/** Which Layanan one Lokasi Mitra offers and what it charges, for Admin Platform: any Lokasi, listed or not. */
export async function layananDiLokasi(deps: LayananDeps, lokasiId: string, at: Date): Promise<LayananDiLokasi[]> {
  const [semua, offers] = await Promise.all([katalog(deps.db), penawaranOfLokasi(deps.db, lokasiId)]);
  const prices = new Map(
    await Promise.all(
      semua.flatMap((entry) =>
        entry.varian.map(async (varian) => [varian.id, await deps.tariffs.hargaLayananLokasi(lokasiId, varian.id, at)] as const),
      ),
    ),
  );
  return semua.map((entry) => ({
    layanan: entry,
    varian: entry.varian.map((varian) => ({
      ...varian,
      namaLayanan: entry.name,
      ditawarkan: offers.some((offer) => offer.layananVariantId === varian.id),
      harga: prices.get(varian.id) ?? null,
    })),
  }));
}

/**
 * The Layanan a Lokasi Mitra offers at `at`, each variant with its all-in price.
 * Empty for a Lokasi Mitra that is not listed (a public read serves a Terverifikasi
 * Lokasi Mitra only).
 */
export async function penawaranLokasi(deps: LayananDeps, lokasiId: string, at: Date): Promise<LayananDiTempat[]> {
  if (!(await deps.lokasi.isTerverifikasi(lokasiId))) return [];
  return groupByLayanan(deps, await offerings(deps, { kind: "lokasi_mitra", lokasiId }, at));
}

/** The Layanan offered at every DKI TPU at `at`, each variant with its price. */
export async function penawaranTpu(deps: LayananDeps, at: Date): Promise<LayananDiTempat[]> {
  return groupByLayanan(deps, await offerings(deps, { kind: "tpu_dki" }, at));
}

/**
 * A Paket Layanan's price at a place: the sum of its items' prices there, from
 * `quote()`. Null when the Paket is not offered there, which is every place where
 * one of its items is not.
 */
export async function hargaPaket(deps: LayananDeps, paketId: string, di: Tempat, at: Date): Promise<AllInPrice | null> {
  const paket = await findPaketById(deps.db, paketId);
  if (!paket || !(await ditawarkanSemua(deps, paket.item, di, at))) return null;
  const quoted = await deps.tariffs.quote(paket.item.map((one) => quoteLineFor(one, di)), at);
  return quoted.ok && withinPaymentCap(quoted.total) ? allInOf(quoted) : null;
}

/** Whether every one of these variants is offered at `di` at `at`: a Paket is offered only then. */
export async function ditawarkanSemua(deps: LayananDeps, item: readonly VarianDenganLayanan[], di: Tempat, at: Date): Promise<boolean> {
  if (item.length === 0) return false;
  const tersedia = new Set((await offerings(deps, di, at)).map((one) => one.id));
  return item.every((one) => tersedia.has(one.id));
}

/** Every Layanan variant offered at `di` at `at`, priced all-in. */
export async function offerings(deps: LayananDeps, di: Tempat, at: Date): Promise<VarianDitawarkan[]> {
  if (di.kind === "lokasi_mitra") {
    const offers = await penawaranOfLokasi(deps.db, di.lokasiId);
    const semua = await varianDenganLayanan(deps.db);
    return priced(deps, semua.filter((one) => offers.some((offer) => offer.layananVariantId === one.id)), di, at);
  }
  return priced(deps, (await varianDenganLayanan(deps.db)).filter((one) => one.bolehDiTpu), di, at);
}

/** One quote line for a variant at a place: the names come from the catalog, which owns them. */
function quoteLineFor(varian: VarianDenganLayanan, di: Tempat): QuoteLine {
  return di.kind === "lokasi_mitra"
    ? { kind: "layanan_lokasi", lokasiId: di.lokasiId, layananVariantId: varian.id, namaLayanan: varian.namaLayanan, namaVarian: varian.name }
    : { kind: "layanan_dki", layananVariantId: varian.id, namaLayanan: varian.namaLayanan, namaVarian: varian.name };
}

/**
 * Prices each variant at the place and keeps only the ones it can price: no price
 * in force means not offered, never a free one, and a total above the QRIS cap
 * is left out of the listing, as on every other listing.
 */
async function priced(deps: LayananDeps, varian: readonly VarianDenganLayanan[], di: Tempat, at: Date): Promise<VarianDitawarkan[]> {
  const quoted = await Promise.all(
    varian.map(async (one) => {
      const result = await deps.tariffs.quote([quoteLineFor(one, di)], at);
      if (!result.ok) return null;
      const harga = allInOf(result);
      return withinPaymentCap(harga.total) ? { ...one, harga } : null;
    }),
  );
  return quoted.filter((one): one is VarianDitawarkan => one !== null);
}

/** Groups the priced variants under the Layanan they belong to, in catalog order. */
async function groupByLayanan(deps: LayananDeps, varian: readonly VarianDitawarkan[]): Promise<LayananDiTempat[]> {
  const semua = await katalog(deps.db);
  return semua
    .map((entry) => ({ layanan: entry, varian: varian.filter((one) => one.layananId === entry.id) }))
    .filter((group) => group.varian.length > 0);
}

/** A quote as a page shows it: the total, its parts, and when each changes. */
function allInOf(quoted: Extract<QuoteResult, { ok: true }>): AllInPrice {
  return {
    total: quoted.total,
    lines: quoted.lines,
    inForceSince: quoted.inForceSince,
    scheduledChange: quoted.scheduledChange,
  };
}
