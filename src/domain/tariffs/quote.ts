import type { Database } from "@/db/client";
import { biayaPemakamanVersions } from "./biaya-pemakaman";
import { globalTariffVersions } from "./global-tariffs";
import { findJenisMakam, jenisMakamVersions, type Tenure } from "./jenis-makam";
import { inForceAt } from "./versions";

/** One line to price. */
export type QuoteLine =
  /** A new Hak Pakai of this Jenis Makam. */
  | { kind: "harga_hak_pakai"; jenisMakamId: string }
  /** One Pemakaman at this Lokasi Mitra; `tumpang` for one under an existing Hak Pakai on an occupied Petak Makam. */
  | { kind: "biaya_pemakaman"; lokasiId: string; tumpang: boolean };

/** Who provides a line: the Lokasi Mitra for its tariff lines, the Operator for its own fees. */
export type Provider = { kind: "lokasi_mitra"; lokasiId: string } | { kind: "operator" };

interface QuotedLineBase {
  label: string;
  /** Whole rupiah. */
  amount: number;
  provider: Provider;
}

export type QuotedLine =
  | (QuotedLineBase & { kind: "harga_hak_pakai"; jenisMakamId: string; tenure: Tenure })
  | (QuotedLineBase & { kind: "biaya_pemakaman"; lokasiId: string; tumpang: boolean })
  | (QuotedLineBase & { kind: "biaya_layanan_platform" });

export type QuoteResult = { ok: true; at: Date; lines: QuotedLine[]; total: number };

export async function quote(db: Database, lines: readonly QuoteLine[], at: Date): Promise<QuoteResult> {
  const quoted: QuotedLine[] = [];
  for (const line of lines) {
    if (line.kind === "harga_hak_pakai") {
      const jenisMakam = await findJenisMakam(db, line.jenisMakamId);
      const version = jenisMakam && inForceAt(await jenisMakamVersions(db, jenisMakam.id), at);
      if (!jenisMakam || !version) throw new Error("no tariff");
      quoted.push({
        kind: "harga_hak_pakai",
        jenisMakamId: jenisMakam.id,
        tenure: version.tenure,
        label: `Harga Hak Pakai – ${jenisMakam.name}`,
        amount: version.hargaHakPakai,
        provider: { kind: "lokasi_mitra", lokasiId: jenisMakam.lokasiId },
      });
    } else {
      const version = inForceAt(await biayaPemakamanVersions(db, line.lokasiId), at);
      if (!version) throw new Error("no tariff");
      quoted.push({
        kind: "biaya_pemakaman",
        lokasiId: line.lokasiId,
        tumpang: line.tumpang,
        label: "Biaya Pemakaman",
        amount: version.biayaPemakaman,
        provider: { kind: "lokasi_mitra", lokasiId: line.lokasiId },
      });
    }
  }
  const platform = inForceAt(await globalTariffVersions(db, "biaya_layanan_platform"), at);
  if (!platform) throw new Error("no tariff");
  quoted.push({
    kind: "biaya_layanan_platform",
    label: "Biaya Layanan Platform",
    amount: platform.amount,
    provider: { kind: "operator" },
  });
  return { ok: true, at, lines: quoted, total: quoted.reduce((sum, line) => sum + line.amount, 0) };
}
