import type { Database } from "@/db/client";
import { biayaPemakamanVersions } from "./biaya-pemakaman";
import { globalTariffVersions, type GlobalTariffKey } from "./global-tariffs";
import { hargaLayananLokasiHistory, layananDkiVersionList } from "./layanan-harga";
import { z } from "zod";
import { findJenisMakam, jenisMakamVersions, tenureSchema, type JenisMakam, type Tenure } from "./jenis-makam";
import { idSchema } from "./ids";
import type { Visibility } from "./reads";
import { inForceAt, nextAfter, type VersionTimes } from "./versions";
import { sumRupiah, timesRupiah, type Rupiah } from "@/lib/rupiah";

/** One line to price. */
export type QuoteLine =
  /** A new Hak Pakai of this Jenis Makam. */
  | { kind: "harga_hak_pakai"; jenisMakamId: string }
  /** One Pemakaman at this Lokasi Mitra; `tumpang` for one under an existing Hak Pakai on an occupied Petak Makam. */
  | { kind: "biaya_pemakaman"; lokasiId: string; tumpang: boolean }
  /**
   * A Perpanjangan Makam of a Hak Pakai of this Jenis Makam by `terms` further
   * terms. `tenure` is the Hak Pakai's own Masa Hak Pakai, as snapshotted when
   * it was bought: it sets the length of a term and whether it can be extended
   * at all; the price per term is the Jenis Makam's Perpanjangan price in force at `at`.
   */
  | { kind: "perpanjangan"; jenisMakamId: string; tenure: Tenure; terms: number }
  /** The Operator's Biaya Pengurusan at a DKI TPU: one that arranges a burial, or filing only. */
  | { kind: "biaya_pengurusan"; pengurusan: "pemakaman" | "berkas" }
  /** A Retribusi Pemda, collected at cost: for an IPTM. */
  | { kind: "retribusi_pemda"; retribusi: "iptm" }
  /**
   * One Layanan variant at a Lokasi Mitra, at that place's price. The names
   * come from the Layanan catalog, which owns them, so the line (and every page
   * and Tagihan that shows it) says which Layanan and which variant it is.
   */
  | { kind: "layanan_lokasi"; lokasiId: string; layananVariantId: string; namaLayanan: string; namaVarian: string }
  /**
   * One Layanan variant at a DKI TPU, at the DKI price (the same in every TPU).
   * The names come from the Layanan catalog, as above.
   */
  | { kind: "layanan_dki"; layananVariantId: string; namaLayanan: string; namaVarian: string };

/**
 * Who provides a line: the Lokasi Mitra for its tariff lines, the Operator for
 * its own fees (Biaya Layanan Platform, Biaya Pengurusan), the Pemda for a
 * Retribusi Pemda it is paid on to.
 */
export type Provider = { kind: "lokasi_mitra"; lokasiId: string } | { kind: "operator" } | { kind: "pemda" };

/**
 * A priced line carries facts only (kind, amounts, provider, the Jenis Makam's
 * name, terms, tenure); how a page or a Tagihan words it is
 * `quoteLineLabel` (`@/lib/quote-line-label`), outside the domain.
 */
interface QuotedLineBase {
  amount: Rupiah;
  provider: Provider;
  /** The effective date of the tariff version this amount comes from ("Harga berlaku sejak"). */
  inForceSince: string;
  /** This line's amount under the next version of its tariff, from that version's date ("Harga baru mulai"), or null. */
  scheduledChange: { effectiveOn: string; amount: Rupiah } | null;
}

export type QuotedLine =
  | (QuotedLineBase & { kind: "harga_hak_pakai"; jenisMakamId: string; jenisMakamName: string; tenure: Tenure })
  | (QuotedLineBase & { kind: "biaya_pemakaman"; lokasiId: string; tumpang: boolean })
  | (QuotedLineBase & { kind: "perpanjangan"; jenisMakamId: string; jenisMakamName: string; terms: number; tenure: Tenure })
  | (QuotedLineBase & { kind: "biaya_pengurusan"; pengurusan: "pemakaman" | "berkas" })
  /** `setorRetribusi`: a non-zero Retribusi Pemda must be paid on to the Pemda (a Setor Retribusi row); Rp 0 needs none. */
  | (QuotedLineBase & { kind: "retribusi_pemda"; retribusi: "iptm"; setorRetribusi: boolean })
  | (QuotedLineBase & { kind: "biaya_layanan_platform" })
  | (QuotedLineBase & { kind: "layanan_lokasi"; lokasiId: string; layananVariantId: string; namaLayanan: string; namaVarian: string })
  | (QuotedLineBase & { kind: "layanan_dki"; layananVariantId: string; namaLayanan: string; namaVarian: string });

export interface Quote {
  ok: true;
  at: Date;
  lines: QuotedLine[];
  /** The exact sum of the lines (a quote whose sum would pass Rp 100.000.000.000 is refused instead). */
  total: Rupiah;
  /** Since when this total holds: the latest effective date among the lines' versions ("Harga berlaku sejak"). */
  inForceSince: string;
  /** The total from the first date any line's tariff changes after `at` ("Harga baru mulai"), or null. */
  scheduledChange: { effectiveOn: string; total: Rupiah } | null;
}

export type QuoteRefusal =
  /** No lines to price. */
  | { ok: false; reason: "tanpa_baris" }
  /** A line is malformed (e.g. terms not a whole number from 1, or an id that is no id). */
  | { ok: false; reason: "baris_tidak_valid" }
  /** A Jenis Makam or Lokasi Mitra that does not exist, or that this reader may not see (public: not Terverifikasi). */
  | { ok: false; reason: "tidak_ditemukan" }
  /** A Perpanjangan of a Hak Pakai that is itself Selamanya. */
  | { ok: false; reason: "tidak_bisa_diperpanjang" }
  /** The lines belong to more than one place (two Lokasi Mitra, or a Lokasi Mitra and a TPU): one Tagihan is one place. */
  | { ok: false; reason: "lokasi_campur" }
  /** The total, or a Perpanjangan price × terms, would pass Rp 100.000.000.000 (never rounded). */
  | { ok: false; reason: "jumlah_terlalu_besar" }
  /** No version of this line's tariff is in force at that instant (not entered yet, or only from a later date). */
  | { ok: false; reason: "tarif_belum_ada"; kind: QuotedLine["kind"] };

export type QuoteResult = Quote | QuoteRefusal;

const quoteLineSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("harga_hak_pakai"), jenisMakamId: idSchema }),
  z.object({ kind: z.literal("biaya_pemakaman"), lokasiId: idSchema, tumpang: z.boolean() }),
  z.object({
    kind: z.literal("perpanjangan"),
    jenisMakamId: idSchema,
    tenure: tenureSchema,
    terms: z.number().int().min(1).max(100),
  }),
  z.object({ kind: z.literal("biaya_pengurusan"), pengurusan: z.enum(["pemakaman", "berkas"]) }),
  z.object({ kind: z.literal("retribusi_pemda"), retribusi: z.literal("iptm") }),
  z.object({
    kind: z.literal("layanan_lokasi"),
    lokasiId: idSchema,
    layananVariantId: idSchema,
    namaLayanan: z.string().min(1).max(120),
    namaVarian: z.string().min(1).max(120),
  }),
  z.object({
    kind: z.literal("layanan_dki"),
    layananVariantId: idSchema,
    namaLayanan: z.string().min(1).max(120),
    namaVarian: z.string().min(1).max(120),
  }),
]);

/** A line priced at an instant, with when its version started and when the next one starts. */
interface Priced {
  line: QuotedLine;
  since: VersionTimes;
  next: VersionTimes | null;
}

/** A step of pricing: its value, or the refusal that ends the quote. */
type Step<T> = { ok: true; value: T } | QuoteRefusal;

/** Prices with the database, serving only the Lokasi Mitra the reader may see. */
interface Pricing {
  db: Database;
  visible: Visibility;
}

export async function quote(db: Database, visible: Visibility, lines: readonly QuoteLine[], at: Date): Promise<QuoteResult> {
  if (lines.length === 0) return { ok: false, reason: "tanpa_baris" };
  if (!z.array(quoteLineSchema).safeParse(lines).success) return { ok: false, reason: "baris_tidak_valid" };
  const pricing = { db, visible };
  const priced = await priceLines(pricing, lines, at);
  if (!priced.ok) return priced;
  const quoted = priced.value.map((one) => one.line);
  const total = sumRupiah(quoted.map((line) => line.amount));
  if (!total.ok) return total;
  const inForceSince = priced.value.map((one) => one.since.effectiveOn).reduce((latest, date) => (date > latest ? date : latest));
  return { ok: true, at, lines: quoted, total: total.amount, inForceSince, scheduledChange: await scheduledTotal(pricing, lines, priced.value) };
}

/**
 * The total from the first later instant any line's tariff changes, or null
 * when none is scheduled, or when from then these lines cannot be priced at
 * all (e.g. a tariff that is no longer entered, or a total past the maximum).
 */
async function scheduledTotal(pricing: Pricing, lines: readonly QuoteLine[], priced: readonly Priced[]): Promise<Quote["scheduledChange"]> {
  const nexts = priced.map((one) => one.next).filter((next): next is VersionTimes => next !== null);
  if (nexts.length === 0) return null;
  const first = nexts.reduce((earliest, next) => (next.inForceFrom < earliest.inForceFrom ? next : earliest));
  const then = await priceLines(pricing, lines, first.inForceFrom);
  if (!then.ok) return null;
  const total = sumRupiah(then.value.map((one) => one.line.amount));
  return total.ok ? { effectiveOn: first.effectiveOn, total: total.amount } : null;
}

/** Every line priced at `at`, plus one Biaya Layanan Platform when any line is a Lokasi Mitra's. */
async function priceLines(pricing: Pricing, lines: readonly QuoteLine[], at: Date): Promise<Step<Priced[]>> {
  const priced: Priced[] = [];
  for (const line of lines) {
    const one = await priceLine(pricing, line, at);
    if (!one.ok) return one;
    priced.push(one.value);
  }
  const lokasiIds = new Set(priced.flatMap(({ line }) => (line.provider.kind === "lokasi_mitra" ? [line.provider.lokasiId] : [])));
  const atTpu = priced.some(({ line }) => line.kind === "biaya_pengurusan" || line.kind === "retribusi_pemda" || line.kind === "layanan_dki");
  if (lokasiIds.size > 1 || (lokasiIds.size === 1 && atTpu)) return { ok: false, reason: "lokasi_campur" };
  // One Biaya Layanan Platform per Tagihan, and only on a Lokasi Mitra order.
  if (lokasiIds.size === 1) {
    const platform = await globalLine(pricing.db, "biaya_layanan_platform", "biaya_layanan_platform", at, (amount, schedule) => ({
      kind: "biaya_layanan_platform",
      amount,
      provider: { kind: "operator" },
      ...schedule,
    }));
    if (!platform.ok) return platform;
    priced.push(platform.value);
  }
  return { ok: true, value: priced };
}

type Schedule = Pick<QuotedLineBase, "inForceSince" | "scheduledChange">;

/**
 * Prices one line from its tariff's versions: `amountOf` turns a version into
 * the line's amount, or the refusal that version gives (e.g. a total past the maximum).
 */
function fromVersions<V extends VersionTimes>(
  kind: QuotedLine["kind"],
  versions: readonly V[],
  at: Date,
  amountOf: (version: V) => Step<Rupiah>,
  build: (amount: Rupiah, version: V, schedule: Schedule) => QuotedLine,
): Step<Priced> {
  const current = inForceAt(versions, at);
  if (!current) return { ok: false, reason: "tarif_belum_ada", kind };
  const amount = amountOf(current);
  if (!amount.ok) return amount;
  const next = nextAfter(versions, at);
  const nextAmount = next && amountOf(next);
  const scheduledChange = next && nextAmount?.ok ? { effectiveOn: next.effectiveOn, amount: nextAmount.value } : null;
  return {
    ok: true,
    value: { line: build(amount.value, current, { inForceSince: current.effectiveOn, scheduledChange }), since: current, next },
  };
}

const priced = (amount: Rupiah): Step<Rupiah> => ({ ok: true, value: amount });

async function globalLine(
  db: Database,
  kind: QuotedLine["kind"],
  key: GlobalTariffKey,
  at: Date,
  build: (amount: Rupiah, schedule: Schedule) => QuotedLine,
): Promise<Step<Priced>> {
  return fromVersions(
    kind,
    await globalTariffVersions(db, key),
    at,
    (version) => priced(version.amount),
    (amount, _version, schedule) => build(amount, schedule),
  );
}

/** A Jenis Makam of a Lokasi Mitra the reader may see, or tidak_ditemukan. */
async function jenisMakamOf({ db, visible }: Pricing, jenisMakamId: string): Promise<Step<JenisMakam>> {
  const jenisMakam = await findJenisMakam(db, jenisMakamId);
  if (!jenisMakam || !(await visible(jenisMakam.lokasiId))) return { ok: false, reason: "tidak_ditemukan" };
  return { ok: true, value: jenisMakam };
}

async function priceLine(pricing: Pricing, line: QuoteLine, at: Date): Promise<Step<Priced>> {
  const { db } = pricing;
  switch (line.kind) {
    case "harga_hak_pakai": {
      const found = await jenisMakamOf(pricing, line.jenisMakamId);
      if (!found.ok) return found;
      const jenisMakam = found.value;
      return fromVersions(
        "harga_hak_pakai",
        await jenisMakamVersions(db, jenisMakam.id),
        at,
        (version) => priced(version.hargaHakPakai),
        (amount, version, schedule) => ({
          kind: "harga_hak_pakai",
          jenisMakamId: jenisMakam.id,
          jenisMakamName: jenisMakam.name,
          tenure: version.tenure,
          amount,
          provider: { kind: "lokasi_mitra", lokasiId: jenisMakam.lokasiId },
          ...schedule,
        }),
      );
    }
    case "biaya_pemakaman":
      if (!(await pricing.visible(line.lokasiId))) return { ok: false, reason: "tidak_ditemukan" };
      return fromVersions(
        "biaya_pemakaman",
        await biayaPemakamanVersions(db, line.lokasiId),
        at,
        (version) => priced(line.tumpang ? (version.biayaPemakamanTumpang ?? version.biayaPemakaman) : version.biayaPemakaman),
        (amount, _version, schedule) => ({
          kind: "biaya_pemakaman",
          lokasiId: line.lokasiId,
          tumpang: line.tumpang,
          amount,
          provider: { kind: "lokasi_mitra", lokasiId: line.lokasiId },
          ...schedule,
        }),
      );
    case "perpanjangan": {
      const found = await jenisMakamOf(pricing, line.jenisMakamId);
      if (!found.ok) return found;
      const jenisMakam = found.value;
      const tenure = line.tenure;
      if (tenure.kind === "selamanya") return { ok: false, reason: "tidak_bisa_diperpanjang" };
      return fromVersions(
        "perpanjangan",
        await jenisMakamVersions(db, jenisMakam.id),
        at,
        (version) => {
          if (version.hargaPerpanjangan === null) return { ok: false, reason: "tarif_belum_ada", kind: "perpanjangan" };
          const amount = timesRupiah(version.hargaPerpanjangan, line.terms);
          return amount.ok ? priced(amount.amount) : amount;
        },
        (amount, _version, schedule) => ({
          kind: "perpanjangan",
          jenisMakamId: jenisMakam.id,
          jenisMakamName: jenisMakam.name,
          terms: line.terms,
          tenure,
          amount,
          provider: { kind: "lokasi_mitra", lokasiId: jenisMakam.lokasiId },
          ...schedule,
        }),
      );
    }
    case "biaya_pengurusan":
      return globalLine(
        db,
        "biaya_pengurusan",
        line.pengurusan === "pemakaman" ? "biaya_pengurusan_pemakaman" : "biaya_pengurusan_berkas",
        at,
        (amount, schedule) => ({
          kind: "biaya_pengurusan",
          pengurusan: line.pengurusan,
          amount,
          provider: { kind: "operator" },
          ...schedule,
        }),
      );
    case "retribusi_pemda":
      return globalLine(db, "retribusi_pemda", "retribusi_pemda_iptm", at, (amount, schedule) => ({
        kind: "retribusi_pemda",
        retribusi: line.retribusi,
        amount,
        provider: { kind: "pemda" },
        setorRetribusi: amount > 0,
        ...schedule,
      }));
    case "layanan_lokasi":
      if (!(await pricing.visible(line.lokasiId))) return { ok: false, reason: "tidak_ditemukan" };
      return fromVersions(
        "layanan_lokasi",
        await hargaLayananLokasiHistory(db, line.lokasiId, line.layananVariantId),
        at,
        (version) => priced(version.amount),
        (amount, _version, schedule) => ({
          kind: "layanan_lokasi",
          lokasiId: line.lokasiId,
          layananVariantId: line.layananVariantId,
          namaLayanan: line.namaLayanan,
          namaVarian: line.namaVarian,
          amount,
          // The Lokasi Mitra provides its own Layanan, so the price carries its attribution.
          provider: { kind: "lokasi_mitra", lokasiId: line.lokasiId },
          ...schedule,
        }),
      );
    case "layanan_dki":
      // The Operator provides a Layanan at a TPU (a Mitra Jasa does the work), so the line carries no Lokasi Mitra and no platform fee.
      return fromVersions(
        "layanan_dki",
        await layananDkiVersionList(db, line.layananVariantId),
        at,
        (version) => priced(version.amount),
        (amount, _version, schedule) => ({
          kind: "layanan_dki",
          layananVariantId: line.layananVariantId,
          namaLayanan: line.namaLayanan,
          namaVarian: line.namaVarian,
          amount,
          provider: { kind: "operator" },
          ...schedule,
        }),
      );
  }
}
