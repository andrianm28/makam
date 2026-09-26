import type { Database } from "@/db/client";
import { biayaPemakamanVersions } from "./biaya-pemakaman";
import { globalTariffVersions, type GlobalTariffKey } from "./global-tariffs";
import { findJenisMakam, jenisMakamVersions, type Tenure } from "./jenis-makam";
import { inForceAt, nextAfter, type VersionTimes } from "./versions";

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
  /** Whole rupiah. */
  amount: number;
  provider: Provider;
  /** The effective date of the tariff version this amount comes from ("Harga berlaku sejak"). */
  inForceSince: string;
  /** This line's amount under the next version of its tariff, from that version's date ("Harga baru mulai"), or null. */
  scheduledChange: { effectiveOn: string; amount: number } | null;
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
  /** Whole rupiah: the exact sum of the lines. */
  total: number;
  /** Since when this total holds: the latest effective date among the lines' versions ("Harga berlaku sejak"). */
  inForceSince: string;
  /** The total from the first date any line's tariff changes after `at` ("Harga baru mulai"), or null. */
  scheduledChange: { effectiveOn: string; total: number } | null;
}

export type QuoteResult = Quote;

/** A line priced at an instant, with when its version started and when the next one starts. */
interface Priced {
  line: QuotedLine;
  since: VersionTimes;
  next: VersionTimes | null;
}

export async function quote(db: Database, lines: readonly QuoteLine[], at: Date): Promise<QuoteResult> {
  const priced = await priceLines(db, lines, at);
  const quoted = priced.map((one) => one.line);
  const inForceSince = priced.map((one) => one.since.effectiveOn).reduce((latest, date) => (date > latest ? date : latest));
  const nexts = priced.map((one) => one.next).filter((next): next is VersionTimes => next !== null);
  let scheduledChange: Quote["scheduledChange"] = null;
  if (nexts.length > 0) {
    const first = nexts.reduce((earliest, next) => (next.inForceFrom < earliest.inForceFrom ? next : earliest));
    const then = await priceLines(db, lines, first.inForceFrom);
    scheduledChange = { effectiveOn: first.effectiveOn, total: sum(then.map((one) => one.line)) };
  }
  return { ok: true, at, lines: quoted, total: sum(quoted), inForceSince, scheduledChange };
}

function sum(lines: readonly QuotedLine[]): number {
  return lines.reduce((total, line) => total + line.amount, 0);
}

/** Every line priced at `at`, plus one Biaya Layanan Platform when any line is a Lokasi Mitra's. */
async function priceLines(db: Database, lines: readonly QuoteLine[], at: Date): Promise<Priced[]> {
  const priced: Priced[] = [];
  for (const line of lines) priced.push(await priceLine(db, line, at));
  // One Biaya Layanan Platform per Tagihan, and only on a Lokasi Mitra order.
  if (priced.some((one) => one.line.provider.kind === "lokasi_mitra")) {
    priced.push(
      await globalLine(db, "biaya_layanan_platform", at, (amount, schedule) => ({
        kind: "biaya_layanan_platform",
        label: "Biaya Layanan Platform",
        amount,
        provider: { kind: "operator" },
        ...schedule,
      })),
    );
  }
  return priced;
}

type Schedule = Pick<QuotedLineBase, "inForceSince" | "scheduledChange">;

/**
 * Prices one line from its tariff's versions: `amountOf` turns a version into
 * the line's amount (null when that version cannot price it, e.g. a
 * Perpanjangan of a Jenis Makam that has become Selamanya).
 */
function fromVersions<V extends VersionTimes>(
  versions: readonly V[],
  at: Date,
  amountOf: (version: V) => number | null,
  build: (amount: number, version: V, schedule: Schedule) => QuotedLine,
): Priced {
  const current = inForceAt(versions, at);
  const amount = current && amountOf(current);
  if (!current || amount === null) throw new Error("no tariff");
  const next = nextAfter(versions, at);
  const nextAmount = next && amountOf(next);
  const scheduledChange = next && nextAmount !== null ? { effectiveOn: next.effectiveOn, amount: nextAmount } : null;
  return { line: build(amount, current, { inForceSince: current.effectiveOn, scheduledChange }), since: current, next };
}

async function globalLine(
  db: Database,
  key: GlobalTariffKey,
  at: Date,
  build: (amount: number, schedule: Schedule) => QuotedLine,
): Promise<Priced> {
  return fromVersions(
    await globalTariffVersions(db, key),
    at,
    (version) => version.amount,
    (amount, _version, schedule) => build(amount, schedule),
  );
}

async function priceLine(db: Database, line: QuoteLine, at: Date): Promise<Priced> {
  switch (line.kind) {
    case "harga_hak_pakai": {
      const jenisMakam = await findJenisMakam(db, line.jenisMakamId);
      if (!jenisMakam) throw new Error("no tariff");
      return fromVersions(
        await jenisMakamVersions(db, jenisMakam.id),
        at,
        (version) => version.hargaHakPakai,
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
        await biayaPemakamanVersions(db, line.lokasiId),
        at,
        (version) => (line.tumpang ? (version.biayaPemakamanTumpang ?? version.biayaPemakaman) : version.biayaPemakaman),
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
      const jenisMakam = await findJenisMakam(db, line.jenisMakamId);
      if (!jenisMakam) throw new Error("no tariff");
      return fromVersions(
        await jenisMakamVersions(db, jenisMakam.id),
        at,
        (version) => (version.hargaPerpanjangan === null ? null : version.hargaPerpanjangan * line.terms),
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
      return globalLine(db, "retribusi_pemda_iptm", at, (amount, schedule) => ({
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
