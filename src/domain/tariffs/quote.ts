import type { Database } from "@/db/client";
import { biayaPemakamanVersions } from "./biaya-pemakaman";
import { globalTariffVersions, type GlobalTariffKey } from "./global-tariffs";
import { findJenisMakam, jenisMakamVersions, type Tenure } from "./jenis-makam";
import { inForceAt } from "./versions";

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
}

export type QuotedLine =
  | (QuotedLineBase & { kind: "harga_hak_pakai"; jenisMakamId: string; tenure: Tenure })
  | (QuotedLineBase & { kind: "biaya_pemakaman"; lokasiId: string; tumpang: boolean })
  | (QuotedLineBase & { kind: "perpanjangan"; jenisMakamId: string; terms: number; tenure: Tenure })
  | (QuotedLineBase & { kind: "biaya_pengurusan"; pengurusan: "pemakaman" | "berkas" })
  /** `setorRetribusi`: a non-zero Retribusi Pemda must be paid on to the Pemda (a Setor Retribusi row); Rp 0 needs none. */
  | (QuotedLineBase & { kind: "retribusi_pemda"; retribusi: "iptm"; setorRetribusi: boolean })
  | (QuotedLineBase & { kind: "biaya_layanan_platform" });

export type QuoteResult = { ok: true; at: Date; lines: QuotedLine[]; total: number };

export async function quote(db: Database, lines: readonly QuoteLine[], at: Date): Promise<QuoteResult> {
  const quoted: QuotedLine[] = [];
  for (const line of lines) quoted.push(await priceLine(db, line, at));
  // One Biaya Layanan Platform per Tagihan, and only on a Lokasi Mitra order.
  if (quoted.some((line) => line.provider.kind === "lokasi_mitra")) {
    const platform = await globalAmount(db, "biaya_layanan_platform", at);
    quoted.push({ kind: "biaya_layanan_platform", label: "Biaya Layanan Platform", amount: platform, provider: { kind: "operator" } });
  }
  return { ok: true, at, lines: quoted, total: quoted.reduce((sum, line) => sum + line.amount, 0) };
}

async function globalAmount(db: Database, key: GlobalTariffKey, at: Date): Promise<number> {
  const version = inForceAt(await globalTariffVersions(db, key), at);
  if (!version) throw new Error("no tariff");
  return version.amount;
}

async function priceLine(db: Database, line: QuoteLine, at: Date): Promise<QuotedLine> {
  switch (line.kind) {
    case "harga_hak_pakai": {
      const jenisMakam = await findJenisMakam(db, line.jenisMakamId);
      const version = jenisMakam && inForceAt(await jenisMakamVersions(db, jenisMakam.id), at);
      if (!jenisMakam || !version) throw new Error("no tariff");
      return {
        kind: "harga_hak_pakai",
        jenisMakamId: jenisMakam.id,
        tenure: version.tenure,
        label: `Harga Hak Pakai – ${jenisMakam.name}`,
        amount: version.hargaHakPakai,
        provider: { kind: "lokasi_mitra", lokasiId: jenisMakam.lokasiId },
      };
    }
    case "biaya_pemakaman": {
      const version = inForceAt(await biayaPemakamanVersions(db, line.lokasiId), at);
      if (!version) throw new Error("no tariff");
      return {
        kind: "biaya_pemakaman",
        lokasiId: line.lokasiId,
        tumpang: line.tumpang,
        label: line.tumpang ? "Biaya Pemakaman (tumpang)" : "Biaya Pemakaman",
        amount: line.tumpang ? (version.biayaPemakamanTumpang ?? version.biayaPemakaman) : version.biayaPemakaman,
        provider: { kind: "lokasi_mitra", lokasiId: line.lokasiId },
      };
    }
    case "perpanjangan": {
      const jenisMakam = await findJenisMakam(db, line.jenisMakamId);
      const version = jenisMakam && inForceAt(await jenisMakamVersions(db, jenisMakam.id), at);
      if (!jenisMakam || !version || version.tenure.kind !== "tahun" || version.hargaPerpanjangan === null) {
        throw new Error("no tariff");
      }
      return {
        kind: "perpanjangan",
        jenisMakamId: jenisMakam.id,
        terms: line.terms,
        tenure: version.tenure,
        label: `Perpanjangan – ${jenisMakam.name} (${line.terms} × ${version.tenure.years} tahun)`,
        amount: version.hargaPerpanjangan * line.terms,
        provider: { kind: "lokasi_mitra", lokasiId: jenisMakam.lokasiId },
      };
    }
    case "biaya_pengurusan": {
      const key = line.pengurusan === "pemakaman" ? "biaya_pengurusan_pemakaman" : "biaya_pengurusan_berkas";
      return {
        kind: "biaya_pengurusan",
        pengurusan: line.pengurusan,
        label: line.pengurusan === "pemakaman" ? "Biaya Pengurusan" : "Biaya Pengurusan (hanya berkas)",
        amount: await globalAmount(db, key, at),
        provider: { kind: "operator" },
      };
    }
    case "retribusi_pemda": {
      const amount = await globalAmount(db, "retribusi_pemda_iptm", at);
      return {
        kind: "retribusi_pemda",
        retribusi: line.retribusi,
        label: "Retribusi Pemda (IPTM)",
        amount,
        provider: { kind: "pemda" },
        setorRetribusi: amount > 0,
      };
    }
  }
}
