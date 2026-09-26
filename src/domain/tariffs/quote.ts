import type { Database } from "@/db/client";
import { biayaPemakamanVersions } from "./biaya-pemakaman";
import { globalTariffVersions, type GlobalTariffKey } from "./global-tariffs";
import { z } from "zod";
import { findJenisMakam, jenisMakamVersions, type JenisMakam, type Tenure } from "./jenis-makam";
import { inForceAt, nextAfter, type VersionTimes } from "./versions";
import { sumRupiah, timesRupiah, type Rupiah } from "@/lib/rupiah";

/** One line to price. */
export type QuoteLine =
  /** A new Hak Pakai of this Jenis Makam. */
  | { kind: "harga_hak_pakai"; jenisMakamId: string }
  /** One Pemakaman at this Lokasi Mitra; `tumpang` for one under an existing Hak Pakai on an occupied Petak Makam. */
  | { kind: "biaya_pemakaman"; lokasiId: string; tumpang: boolean }
  /** A Perpanjangan Makam of a Hak Pakai of this Jenis Makam by `terms` further terms. */
  | { kind: "perpanjangan"; jenisMakamId: string; terms: number }
  /** The Operator's Biaya Pengurusan at a DKI TPU: one that arranges a burial, or filing only. */
  | { kind: "biaya_pengurusan"; pengurusan: "pemakaman" | "berkas" }
  /** A Retribusi Pemda, collected at cost: for an IPTM. */
  | { kind: "retribusi_pemda"; retribusi: "iptm" };

/**
 * Who provides a line: the Lokasi Mitra for its tariff lines, the Operator for
 * its own fees (Biaya Layanan Platform, Biaya Pengurusan), the Pemda for a
 * Retribusi Pemda it is paid on to.
 */
export type Provider = { kind: "lokasi_mitra"; lokasiId: string } | { kind: "operator" } | { kind: "pemda" };

interface QuotedLineBase {
  label: string;
  amount: Rupiah;
  provider: Provider;
  /** The effective date of the tariff version this amount comes from ("Harga berlaku sejak"). */
  inForceSince: string;
  /** This line's amount under the next version of its tariff, from that version's date ("Harga baru mulai"), or null. */
  scheduledChange: { effectiveOn: string; amount: Rupiah } | null;
}

export type QuotedLine =
  | (QuotedLineBase & { kind: "harga_hak_pakai"; jenisMakamId: string; tenure: Tenure })
  | (QuotedLineBase & { kind: "biaya_pemakaman"; lokasiId: string; tumpang: boolean })
  | (QuotedLineBase & { kind: "perpanjangan"; jenisMakamId: string; terms: number; tenure: Tenure })
  | (QuotedLineBase & { kind: "biaya_pengurusan"; pengurusan: "pemakaman" | "berkas" })
  /** `setorRetribusi`: a non-zero Retribusi Pemda must be paid on to the Pemda (a Setor Retribusi row); Rp 0 needs none. */
  | (QuotedLineBase & { kind: "retribusi_pemda"; retribusi: "iptm"; setorRetribusi: boolean })
  | (QuotedLineBase & { kind: "biaya_layanan_platform" });

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
  /** A line is malformed (e.g. terms not a whole number from 1). */
  | { ok: false; reason: "baris_tidak_valid" }
  /** A Jenis Makam that does not exist. */
  | { ok: false; reason: "tidak_ditemukan" }
  /** A Perpanjangan of a Jenis Makam that is Selamanya at that instant. */
  | { ok: false; reason: "tidak_bisa_diperpanjang" }
  /** The lines belong to more than one place (two Lokasi Mitra, or a Lokasi Mitra and a TPU): one Tagihan is one place. */
  | { ok: false; reason: "lokasi_campur" }
  /** The total, or a Perpanjangan price × terms, would pass Rp 100.000.000.000 (never rounded). */
  | { ok: false; reason: "jumlah_terlalu_besar" }
  /** No version of this line's tariff is in force at that instant (not entered yet, or only from a later date). */
  | { ok: false; reason: "tarif_belum_ada"; kind: QuotedLine["kind"] };

export type QuoteResult = Quote | QuoteRefusal;

const idSchema = z.uuid();
const quoteLineSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("harga_hak_pakai"), jenisMakamId: z.string() }),
  z.object({ kind: z.literal("biaya_pemakaman"), lokasiId: idSchema, tumpang: z.boolean() }),
  z.object({ kind: z.literal("perpanjangan"), jenisMakamId: z.string(), terms: z.number().int().min(1).max(100) }),
  z.object({ kind: z.literal("biaya_pengurusan"), pengurusan: z.enum(["pemakaman", "berkas"]) }),
  z.object({ kind: z.literal("retribusi_pemda"), retribusi: z.literal("iptm") }),
]);

/** A line priced at an instant, with when its version started and when the next one starts. */
interface Priced {
  line: QuotedLine;
  since: VersionTimes;
  next: VersionTimes | null;
}

/** A step of pricing: its value, or the refusal that ends the quote. */
type Step<T> = { ok: true; value: T } | QuoteRefusal;

export async function quote(db: Database, lines: readonly QuoteLine[], at: Date): Promise<QuoteResult> {
  if (lines.length === 0) return { ok: false, reason: "tanpa_baris" };
  if (!z.array(quoteLineSchema).safeParse(lines).success) return { ok: false, reason: "baris_tidak_valid" };
  const priced = await priceLines(db, lines, at);
  if (!priced.ok) return priced;
  const quoted = priced.value.map((one) => one.line);
  const total = sumRupiah(quoted.map((line) => line.amount));
  if (!total.ok) return total;
  const inForceSince = priced.value.map((one) => one.since.effectiveOn).reduce((latest, date) => (date > latest ? date : latest));
  return { ok: true, at, lines: quoted, total: total.amount, inForceSince, scheduledChange: await scheduledTotal(db, lines, priced.value) };
}

/**
 * The total from the first later instant any line's tariff changes, or null
 * when none is scheduled, or when from then these lines cannot be priced at
 * all (e.g. a tariff that is no longer entered, or a total past the maximum).
 */
async function scheduledTotal(db: Database, lines: readonly QuoteLine[], priced: readonly Priced[]): Promise<Quote["scheduledChange"]> {
  const nexts = priced.map((one) => one.next).filter((next): next is VersionTimes => next !== null);
  if (nexts.length === 0) return null;
  const first = nexts.reduce((earliest, next) => (next.inForceFrom < earliest.inForceFrom ? next : earliest));
  const then = await priceLines(db, lines, first.inForceFrom);
  if (!then.ok) return null;
  const total = sumRupiah(then.value.map((one) => one.line.amount));
  return total.ok ? { effectiveOn: first.effectiveOn, total: total.amount } : null;
}

/** Every line priced at `at`, plus one Biaya Layanan Platform when any line is a Lokasi Mitra's. */
async function priceLines(db: Database, lines: readonly QuoteLine[], at: Date): Promise<Step<Priced[]>> {
  const priced: Priced[] = [];
  for (const line of lines) {
    const one = await priceLine(db, line, at);
    if (!one.ok) return one;
    priced.push(one.value);
  }
  const lokasiIds = new Set(priced.flatMap(({ line }) => (line.provider.kind === "lokasi_mitra" ? [line.provider.lokasiId] : [])));
  const atTpu = priced.some(({ line }) => line.kind === "biaya_pengurusan" || line.kind === "retribusi_pemda");
  if (lokasiIds.size > 1 || (lokasiIds.size === 1 && atTpu)) return { ok: false, reason: "lokasi_campur" };
  // One Biaya Layanan Platform per Tagihan, and only on a Lokasi Mitra order.
  if (lokasiIds.size === 1) {
    const platform = await globalLine(db, "biaya_layanan_platform", "biaya_layanan_platform", at, (amount, schedule) => ({
      kind: "biaya_layanan_platform",
      label: "Biaya Layanan Platform",
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

async function jenisMakamOf(db: Database, jenisMakamId: string): Promise<Step<JenisMakam>> {
  const jenisMakam = await findJenisMakam(db, jenisMakamId);
  return jenisMakam ? { ok: true, value: jenisMakam } : { ok: false, reason: "tidak_ditemukan" };
}

async function priceLine(db: Database, line: QuoteLine, at: Date): Promise<Step<Priced>> {
  switch (line.kind) {
    case "harga_hak_pakai": {
      const found = await jenisMakamOf(db, line.jenisMakamId);
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
          tenure: version.tenure,
          label: `Harga Hak Pakai – ${jenisMakam.name}`,
          amount,
          provider: { kind: "lokasi_mitra", lokasiId: jenisMakam.lokasiId },
          ...schedule,
        }),
      );
    }
    case "biaya_pemakaman":
      return fromVersions(
        "biaya_pemakaman",
        await biayaPemakamanVersions(db, line.lokasiId),
        at,
        (version) => priced(line.tumpang ? (version.biayaPemakamanTumpang ?? version.biayaPemakaman) : version.biayaPemakaman),
        (amount, _version, schedule) => ({
          kind: "biaya_pemakaman",
          lokasiId: line.lokasiId,
          tumpang: line.tumpang,
          label: line.tumpang ? "Biaya Pemakaman (tumpang)" : "Biaya Pemakaman",
          amount,
          provider: { kind: "lokasi_mitra", lokasiId: line.lokasiId },
          ...schedule,
        }),
      );
    case "perpanjangan": {
      const found = await jenisMakamOf(db, line.jenisMakamId);
      if (!found.ok) return found;
      const jenisMakam = found.value;
      return fromVersions(
        "perpanjangan",
        await jenisMakamVersions(db, jenisMakam.id),
        at,
        (version) => {
          if (version.hargaPerpanjangan === null) return { ok: false, reason: "tidak_bisa_diperpanjang" };
          const amount = timesRupiah(version.hargaPerpanjangan, line.terms);
          return amount.ok ? priced(amount.amount) : amount;
        },
        (amount, version, schedule) => ({
          kind: "perpanjangan",
          jenisMakamId: jenisMakam.id,
          terms: line.terms,
          tenure: version.tenure,
          label: `Perpanjangan – ${jenisMakam.name} (${line.terms} × ${version.tenure.kind === "tahun" ? version.tenure.years : 0} tahun)`,
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
          label: line.pengurusan === "pemakaman" ? "Biaya Pengurusan" : "Biaya Pengurusan (hanya berkas)",
          amount,
          provider: { kind: "operator" },
          ...schedule,
        }),
      );
    case "retribusi_pemda":
      return globalLine(db, "retribusi_pemda", "retribusi_pemda_iptm", at, (amount, schedule) => ({
        kind: "retribusi_pemda",
        retribusi: line.retribusi,
        label: "Retribusi Pemda (IPTM)",
        amount,
        provider: { kind: "pemda" },
        setorRetribusi: amount > 0,
        ...schedule,
      }));
  }
}
