import { withinPaymentCap } from "@/domain/billing";
import type { JenisMakamPrice, Quote, QuotedLine, Tariffs, Tenure } from "@/domain/tariffs";

/** An all-in price as the page shows it: the total, in small print its parts, and when it changes. */
export interface AllInPrice {
  total: number;
  lines: QuotedLine[];
  inForceSince: string;
  scheduledChange: { effectiveOn: string; total: number } | null;
}

function allInOf(quote: Quote): AllInPrice {
  return { total: quote.total, lines: quote.lines, inForceSince: quote.inForceSince, scheduledChange: quote.scheduledChange };
}

export interface JenisMakamCard {
  jenisMakam: JenisMakamPrice;
  tenure: Tenure;
  /** Hak Pakai + Biaya Layanan Platform, all-in. */
  hakPakai: AllInPrice;
  /** One Perpanjangan term, all-in; null for Selamanya or without a Perpanjangan price entered. */
  perpanjangan: AllInPrice | null;
}

export interface LokasiPricing {
  /** Every Jenis Makam priced and within the QRIS cap (spec, decision 2026-09-26): one over it is hidden entirely. */
  jenisMakam: JenisMakamCard[];
  biayaPemakaman: AllInPrice | null;
  biayaPemakamanTumpang: AllInPrice | null;
  /** The lowest Harga Hak Pakai all-in among `jenisMakam`, for "mulai Rp X"; null when none is priced yet. */
  mulaiDari: number | null;
}

/**
 * Every price a Lokasi Mitra's public page or Daftar Lokasi card shows, each
 * as the all-in total `quote()` gives for the same lines at the same instant
 * (spec, story 9): so the price on the page is always the price on the Tagihan.
 */
export async function lokasiPricing(tariffs: Pick<Tariffs, "lokasiTariffs" | "quote">, lokasiId: string, at: Date): Promise<LokasiPricing> {
  const { jenisMakam, biayaPemakaman } = await tariffs.lokasiTariffs(lokasiId, at);

  const cards = await Promise.all(
    jenisMakam.map(async (jm): Promise<JenisMakamCard | null> => {
      if (!jm.inForce) return null;
      const hakPakaiQuote = await tariffs.quote([{ kind: "harga_hak_pakai", jenisMakamId: jm.id }], at);
      if (!hakPakaiQuote.ok || !withinPaymentCap(hakPakaiQuote.total)) return null;

      let perpanjangan: AllInPrice | null = null;
      if (jm.inForce.tenure.kind !== "selamanya" && jm.inForce.hargaPerpanjangan !== null) {
        const perpanjanganQuote = await tariffs.quote(
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
    biayaPemakaman.inForce ? tariffs.quote([{ kind: "biaya_pemakaman", lokasiId, tumpang: false }], at) : null,
    biayaPemakaman.inForce ? tariffs.quote([{ kind: "biaya_pemakaman", lokasiId, tumpang: true }], at) : null,
  ]);

  const mulaiDari = priced.length > 0 ? Math.min(...priced.map((card) => card.hakPakai.total)) : null;

  return {
    jenisMakam: priced,
    biayaPemakaman: biayaPemakamanQuote?.ok ? allInOf(biayaPemakamanQuote) : null,
    biayaPemakamanTumpang: biayaPemakamanTumpangQuote?.ok ? allInOf(biayaPemakamanTumpangQuote) : null,
    mulaiDari,
  };
}

/** "Mulai Rp X" for a Daftar Lokasi card: the cheapest Harga Hak Pakai all-in within the QRIS cap, or null. */
export async function startingPrice(tariffs: Pick<Tariffs, "lokasiTariffs" | "quote">, lokasiId: string, at: Date): Promise<number | null> {
  return (await lokasiPricing(tariffs, lokasiId, at)).mulaiDari;
}
