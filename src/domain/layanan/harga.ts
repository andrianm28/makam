import { withinPaymentCap } from "@/domain/billing";
import type { HargaLayananVersion, QuoteLine, QuoteResult } from "@/domain/tariffs";
import type { LayananDeps } from "./deps";
import { katalog, type LayananTerbaca, type ProofRequirement } from "./katalog";
import { findPaketById } from "./paket";
import { penawaranOfLokasi, varianDenganLayanan, type VarianDenganLayanan } from "./varian";
import { hargaLayananPartLabel, type HargaLayananPart } from "@/lib/layanan-labels";

/**
 * What a place offers, priced (spec, Layanan): the Layanan a Lokasi Mitra
 * switched on, and the Layanan variants Admin Platform marked "boleh di TPU
 * DKI", each with that place's all-in price at `at` from `quote()`.
 *
 * A variant with no price in force is not offered — that is what "no free
 * pricing" means here — and a Paket Layanan is offered only where every one of
 * its items is, at the sum of its items' prices there.
 *
 * The names in a price come from the catalog, read with the variant: the quote
 * line itself carries only the variant's id, so no page and no Tagihan can show
 * a name that belongs to another variant.
 */

/** Where a price is asked for: a Lokasi Mitra, or any DKI TPU (the price is the same in every one). */
export type Tempat = { kind: "lokasi_mitra"; lokasiId: string } | { kind: "tpu_dki" };

/**
 * One all-in price as the Layanan pages show it: the total, when it holds, when
 * it changes, and the parts with the name each carries (a Layanan variant from the
 * catalog, or the Operator's platform fee).
 */
export interface HargaLayanan {
  total: number;
  inForceSince: string;
  scheduledChange: { effectiveOn: string; total: number } | null;
  parts: HargaLayananPart[];
}

/** One offered variant, with the place's all-in price for it. */
export type VarianDitawarkan = VarianDenganLayanan & { harga: HargaLayanan };

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
  const [semua, offers, prices] = await Promise.all([
    katalog(deps.db),
    penawaranOfLokasi(deps.db, lokasiId),
    deps.tariffs.hargaLayananLokasiSemua(lokasiId, at),
  ]);
  // A variant with a price but no offering, or an offering with no price, shows
  // as it is: that half-finished state is what Admin Platform comes here to finish.
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
 * The Layanan a Lokasi Mitra offers at `at`, each variant with that place's
 * all-in price. Empty for a Lokasi Mitra that is not listed (a public read
 * serves a Terverifikasi Lokasi Mitra only).
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
export async function hargaPaket(deps: LayananDeps, paketId: string, di: Tempat, at: Date): Promise<HargaLayanan | null> {
  const paket = await findPaketById(deps.db, paketId);
  if (!paket || !(await ditawarkanSemua(deps, paket.item, di, at))) return null;
  const quoted = await deps.tariffs.quote(paket.item.map((one) => quoteLineFor(one, di)), at);
  if (!quoted.ok || !withinPaymentCap(quoted.total)) return null;
  return allInOf(quoted, paket.item);
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

/**
 * One quote line for a variant at a place. The variant comes from the catalog, so
 * the line names nothing: the only thing that travels is the variant's id.
 */
function quoteLineFor(varian: VarianDenganLayanan, di: Tempat): QuoteLine {
  return di.kind === "lokasi_mitra"
    ? { kind: "layanan_lokasi", lokasiId: di.lokasiId, layananVariantId: varian.id }
    : { kind: "layanan_dki", layananVariantId: varian.id };
}

/**
 * Prices each variant at the place and keeps only the ones it can price: no price
 * in force means not offered, never a free one, and a total above the QRIS cap is
 * left out of the listing, as on every other listing.
 *
 * One variant is quoted on its own, not with the rest: each is a separate order,
 * so each all-in total carries its own Biaya Layanan Platform. That is why a
 * listing costs one quote per variant.
 */
async function priced(deps: LayananDeps, varian: readonly VarianDenganLayanan[], di: Tempat, at: Date): Promise<VarianDitawarkan[]> {
  const quoted = await Promise.all(
    varian.map(async (one) => {
      const result = await deps.tariffs.quote([quoteLineFor(one, di)], at);
      if (!result.ok) return null;
      const harga = allInOf(result, [one]);
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

/**
 * A quote as the Layanan pages show it. Every Layanan line names the variant it
 * belongs to, from the catalog read beside it, and every other line names itself
 * (`quoteLineLabel`).
 */
function allInOf(quoted: Extract<QuoteResult, { ok: true }>, item: readonly VarianDenganLayanan[]): HargaLayanan {
  return {
    total: quoted.total,
    inForceSince: quoted.inForceSince,
    scheduledChange: quoted.scheduledChange,
    parts: quoted.lines.map((line) => {
      const own = line.kind === "layanan_lokasi" || line.kind === "layanan_dki" ? item.find((one) => one.id === line.layananVariantId) : undefined;
      return {
        label: hargaLayananPartLabel(line, own),
        amount: line.amount,
        inForceSince: line.inForceSince,
        scheduledChange: line.scheduledChange,
      };
    }),
  };
}

/**
 * The Layanan a Lokasi Mitra offers, as the standalone order's checkout lists
 * them: the whole catalog entry (so the family sees the lead time, the text it
 * asks for and the proof the work must carry) and each variant with **that
 * variant's own price only**.
 *
 * The price here is deliberately not an all-in total. One order may hold several
 * Layanan, and a Tagihan carries exactly one Biaya Layanan Platform however many
 * items it has, so the only honest total is the one `hargaPesananLayanan` prices
 * for the set actually chosen. A per-variant all-in total would add that fee once
 * per item, and the bill would not match the screen.
 */
export interface VarianUntukPesanan {
  id: string;
  layananId: string;
  name: string;
  /** That place's price for this variant alone, in whole rupiah. */
  harga: number;
  /** "Harga berlaku sejak". */
  inForceSince: string;
}

export interface LayananUntukPesanan {
  /** The whole catalog entry: its name, its kind's proof, its lead time and its text field. */
  layanan: LayananTerbaca;
  varian: VarianUntukPesanan[];
}

/** The Layanan a Lokasi Mitra offers at `at`, in catalog order, with each variant's own price. */
export async function penawaranUntukPesanan(deps: LayananDeps, lokasiId: string, at: Date): Promise<LayananUntukPesanan[]> {
  if (!(await deps.lokasi.isTerverifikasi(lokasiId))) return [];
  const [semua, prices] = await Promise.all([katalog(deps.db), deps.tariffs.hargaLayananLokasiSemua(lokasiId, at)]);
  const ditawarkan = new Set((await penawaranOfLokasi(deps.db, lokasiId)).map((offer) => offer.layananVariantId));
  return semua
    .map((entry) => ({
      layanan: entry,
      // A variant with no price in force is not offered, never a free one.
      varian: entry.varian.flatMap((varian) => {
        const version = prices.get(varian.id);
        return version && ditawarkan.has(varian.id)
          ? [{ id: varian.id, layananId: entry.id, name: varian.name, harga: version.amount, inForceSince: version.effectiveOn }]
          : [];
      }),
    }))
    .filter((grup) => grup.varian.length > 0);
}

/** One line of a set's price, in the words a Tagihan and a checkout both show. */
export interface BarisHargaPesanan {
  /** The Layanan variant this line is for, or null for the Operator's own fee. */
  layananVariantId: string | null;
  label: string;
  amount: number;
}

/** The all-in price of exactly the variants one order holds, from `quote()`. */
export interface HargaPesananLayanan {
  total: number;
  inForceSince: string;
  parts: BarisHargaPesanan[];
  /** The Operator's own fee, named apart, because it is charged once per Tagihan. */
  platformFee: number;
}

/**
 * One offered variant with everything an order of it needs: its price, and the
 * facts that belong to the **Layanan** rather than the variant — the minimum lead
 * time, the text field it asks for, and the proof the work must carry.
 *
 * Those three are what make a date or a form checkable, and they live on the
 * catalog entry, so a variant on its own is not enough to place an order with.
 */
export interface VarianUntukOrder extends VarianDenganLayanan {
  harga: HargaLayanan;
  leadTimeDays: number;
  teksLabel: string | null;
  /** What the work has to show, derived from the Layanan's own kind. */
  proof: ProofRequirement;
}

/**
 * Every Layanan variant this Lokasi Mitra offers at `at`, each with its price and
 * its Layanan's own lead time, text field and proof. Empty for a Lokasi Mitra that
 * is not listed, so a checkout is only ever offered a place that takes orders.
 */
export async function offeringsUntukOrder(deps: LayananDeps, lokasiId: string, at: Date): Promise<VarianUntukOrder[]> {
  const [ditawarkan, semua] = await Promise.all([offerings(deps, { kind: "lokasi_mitra", lokasiId }, at), katalog(deps.db)]);
  const entryOf = new Map(semua.map((entry) => [entry.id, entry] as const));
  return ditawarkan.flatMap((varian) => {
    const entry = entryOf.get(varian.layananId);
    return entry ? [{ ...varian, leadTimeDays: entry.leadTimeDays, teksLabel: entry.teksLabel, proof: entry.proof }] : [];
  });
}

/**
 * What one order of these variants costs, all in: the items at that place's price
 * plus the one Biaya Layanan Platform a Tagihan at a Lokasi Mitra carries. Null
 * when a variant is not offered there, has no price in force, or the total is
 * past the QRIS cap — a price that cannot be quoted is not a price.
 */
export async function hargaPesananLayanan(
  deps: LayananDeps,
  lokasiId: string,
  layananVariantIds: readonly string[],
  at: Date,
): Promise<HargaPesananLayanan | null> {
  if (layananVariantIds.length === 0) return null;
  const tersedia = new Set((await offerings(deps, { kind: "lokasi_mitra", lokasiId }, at)).map((one) => one.id));
  if (layananVariantIds.some((id) => !tersedia.has(id))) return null;
  const quoted = await deps.tariffs.quote(
    layananVariantIds.map((id) => ({ kind: "layanan_lokasi" as const, lokasiId, layananVariantId: id })),
    at,
  );
  if (!quoted.ok || !withinPaymentCap(quoted.total)) return null;
  const catalog = new Map((await katalog(deps.db)).flatMap((entry) => entry.varian.map((varian) => [varian.id, { namaLayanan: entry.name, name: varian.name }] as const)));
  const parts: BarisHargaPesanan[] = quoted.lines.map((line) => ({
    layananVariantId: line.kind === "layanan_lokasi" ? line.layananVariantId : null,
    label: hargaLayananPartLabel(line, line.kind === "layanan_lokasi" ? catalog.get(line.layananVariantId) : undefined),
    amount: line.amount,
  }));
  return { total: quoted.total, inForceSince: quoted.inForceSince, parts, platformFee: parts.find((part) => part.layananVariantId === null)?.amount ?? 0 };
}
