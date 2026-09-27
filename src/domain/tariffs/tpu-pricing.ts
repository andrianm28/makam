/**
 * Every price a TPU page or a TPU card shows (spec, Tariffs > Global, and
 * Pengurusan; ticket 43): the Operator's two Biaya Pengurusan amounts and the
 * Retribusi Pemda for an IPTM, each priced by the same `quote()` every other
 * line is, so a page never shows a number a Tagihan would not carry.
 *
 * A TPU order carries no Biaya Layanan Platform (that fee belongs to a Lokasi
 * Mitra order, and `quote()` only adds it when a line belongs to a Lokasi
 * Mitra), and a TPU's card starts at the burial Biaya Pengurusan plus the
 * Retribusi Pemda (decision 2026-09-25: what "mulai Rp X" means on a DKI TPU
 * card).
 */
import type { Database } from "@/db/client";
import { allInOf, type AllInPrice } from "./public-pricing";
import { quote, type QuoteLine } from "./quote";
import type { Visibility } from "./reads";

/** The two Biaya Pengurusan lines and the Retribusi Pemda, as the TPU page's price box shows them. */
const pengurusanPemakaman: QuoteLine = { kind: "biaya_pengurusan", pengurusan: "pemakaman" };
const pengurusanBerkas: QuoteLine = { kind: "biaya_pengurusan", pengurusan: "berkas" };
const retribusiIptm: QuoteLine = { kind: "retribusi_pemda", retribusi: "iptm" };

/** The TPU card's starting price: the burial Biaya Pengurusan and the Retribusi Pemda, in one quote. */
const burialCardLines: readonly QuoteLine[] = [pengurusanPemakaman, retribusiIptm];

export interface TpuPublicPricing {
  /** The Operator's fee when it arranges a burial at the TPU. */
  pengurusanPemakaman: AllInPrice | null;
  /** The Operator's fee for filing the IPTM only, after a burial the family arranged itself. */
  pengurusanBerkas: AllInPrice | null;
  /** The Retribusi Pemda for the IPTM, its own line, Rp 0 where the Pemda charges nothing. */
  retribusiIptm: AllInPrice | null;
  /**
   * What a TPU card shows as its starting price: the burial Biaya
   * Pengurusan plus the Retribusi Pemda. Null until both are entered, so a
   * card never shows a price a Tagihan could not carry.
   */
  mulaiDari: number | null;
}

/** One line as its own box, or null while no version of that tariff is in force. */
async function boxOf(db: Database, visible: Visibility, line: QuoteLine, at: Date): Promise<AllInPrice | null> {
  const priced = await quote(db, visible, [line], at);
  return priced.ok ? allInOf(priced) : null;
}

export async function tpuPublicPricing(db: Database, visible: Visibility, at: Date): Promise<TpuPublicPricing> {
  const [pemakaman, berkas, retribusi, card] = await Promise.all([
    boxOf(db, visible, pengurusanPemakaman, at),
    boxOf(db, visible, pengurusanBerkas, at),
    boxOf(db, visible, retribusiIptm, at),
    quote(db, visible, burialCardLines, at),
  ]);
  return {
    pengurusanPemakaman: pemakaman,
    pengurusanBerkas: berkas,
    retribusiIptm: retribusi,
    mulaiDari: card.ok ? card.total : null,
  };
}
