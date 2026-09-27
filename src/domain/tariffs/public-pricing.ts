/**
 * Every price a Lokasi Mitra's public page or Daftar Lokasi card shows,
 * selected under the v1 rules (spec, decision 2026-09-26): a Jenis Makam
 * whose Harga Hak Pakai all-in total exceeds the Rp 10.000.000 QRIS cap is
 * hidden entirely (v1 takes no such order), each remaining price is the same
 * all-in total `quote()` gives for that line at the same instant, and a
 * Perpanjangan price only shows for a fixed-term Jenis Makam that has one.
 */
import { withinPaymentCap } from "@/domain/billing";
import type { Database } from "@/db/client";
import { lokasiTariffs } from "./lokasi-tariffs";
import { quote, type Quote, type QuotedLine } from "./quote";
import type { Visibility } from "./reads";
import type { JenisMakamPrice } from "./lokasi-tariffs";
import type { Tenure } from "./jenis-makam";

/** An all-in total as a page shows it: the parts (in small print), and when it changes. */
export interface AllInPrice {
  total: number;
  lines: QuotedLine[];
  inForceSince: string;
  scheduledChange: { effectiveOn: string; total: number } | null;
}

function allInOf(q: Quote): AllInPrice {
  return { total: q.total, lines: q.lines, inForceSince: q.inForceSince, scheduledChange: q.scheduledChange };
}

/** A priced quote as a page or card shows it: the parts, and when the total changes. */
export { allInOf };

export interface JenisMakamCard {
  jenisMakam: JenisMakamPrice;
  tenure: Tenure;
  /** Hak Pakai + Biaya Layanan Platform, all-in. */
  hakPakai: AllInPrice;
  /** One Perpanjangan term, all-in; null for Selamanya or without a Perpanjangan price entered. */
  perpanjangan: AllInPrice | null;
}

export interface LokasiPublicPricing {
  /** Every Jenis Makam priced and within the QRIS cap: one over it is left out entirely. */
  jenisMakam: JenisMakamCard[];
  biayaPemakaman: AllInPrice | null;
  biayaPemakamanTumpang: AllInPrice | null;
  /** The lowest Harga Hak Pakai all-in among `jenisMakam` ("mulai Rp X"); null when none is priced yet. */
  mulaiDari: number | null;
}

export async function lokasiPublicPricing(db: Database, visible: Visibility, lokasiId: string, at: Date): Promise<LokasiPublicPricing> {
  const { jenisMakam, biayaPemakaman } = await lokasiTariffs(db, visible, lokasiId, at);

  const cards = await Promise.all(
    jenisMakam.map(async (jm): Promise<JenisMakamCard | null> => {
      if (!jm.inForce) return null;
      const hakPakaiQuote = await quote(db, visible, [{ kind: "harga_hak_pakai", jenisMakamId: jm.id }], at);
      if (!hakPakaiQuote.ok || !withinPaymentCap(hakPakaiQuote.total)) return null;

      let perpanjangan: AllInPrice | null = null;
      if (jm.inForce.tenure.kind !== "selamanya" && jm.inForce.hargaPerpanjangan !== null) {
        const perpanjanganQuote = await quote(
          db,
          visible,
          [{ kind: "perpanjangan", jenisMakamId: jm.id, tenure: jm.inForce.tenure, terms: 1 }],
          at,
        );
        if (perpanjanganQuote.ok && withinPaymentCap(perpanjanganQuote.total)) perpanjangan = allInOf(perpanjanganQuote);
      }

      return { jenisMakam: jm, tenure: jm.inForce.tenure, hakPakai: allInOf(hakPakaiQuote), perpanjangan };
    }),
  );
  const priced = cards.filter((card): card is JenisMakamCard => card !== null);

  const [biayaPemakamanQuote, biayaPemakamanTumpangQuote] = await Promise.all([
    biayaPemakaman.inForce ? quote(db, visible, [{ kind: "biaya_pemakaman", lokasiId, tumpang: false }], at) : null,
    biayaPemakaman.inForce ? quote(db, visible, [{ kind: "biaya_pemakaman", lokasiId, tumpang: true }], at) : null,
  ]);

  const mulaiDari = priced.length > 0 ? Math.min(...priced.map((card) => card.hakPakai.total)) : null;

  return {
    jenisMakam: priced,
    biayaPemakaman: biayaPemakamanQuote?.ok ? allInOf(biayaPemakamanQuote) : null,
    biayaPemakamanTumpang: biayaPemakamanTumpangQuote?.ok ? allInOf(biayaPemakamanTumpangQuote) : null,
    mulaiDari,
  };
}
