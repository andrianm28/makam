/**
 * What the money of one order did, as Pencairan reads it (spec, Payouts: "Amount:
 * … A Harga Khusus is borne by the Operator … unless a partner share is
 * recorded …; 'Dibayar langsung' means no tariff Pencairan and a platform-fee
 * Potongan"; ticket 30's AC 2, 3).
 *
 * Both facts live on the order, not on a Tagihan, and for the same reason twice
 * over: a Harga Khusus is applied by cancelling and reissuing the Tagihan, so a
 * share kept there would be lost by its own reissue, and Pencairan is computed
 * per order anyway. Payouts reads this one projection through the module's
 * public interface and never the order's table.
 *
 * The two words that keep an order from being paid twice come out of it, and
 * both are stated here rather than left to be derived again on the other side:
 * `langsung_ke_lokasi_mitra` says no tariff is due and names the platform fee
 * that is owed as a Potongan instead, because the money never reached the
 * Operator.
 */
import { eq } from "drizzle-orm";
import type { PaymentMethod, Tagihan } from "@/domain/billing";
import { pemesananMakam } from "./schema";
import type { PemesananDeps } from "./deps";

/** Where the money of one order went, in the words Pencairan reads it in. */
export interface PembayaranOrder {
  nomor: string;
  lokasi: { id: string; name: string };
  /** The order's Tagihan now, the one its items are priced from. */
  tagihanId: string | null;
  /** The share of a Harga Khusus the Lokasi Mitra agreed to bear, in whole rupiah. */
  partnerShare: number;
  /** Why it agreed to bear it, when Admin Platform entered a share at all. */
  partnerShareNote: string | null;
  pembayaran:
    /** Nothing is owed yet: the order's Tagihan is not Lunas. */
    | { kind: "belum_dibayar" }
    /** The money reached the Operator through the Tagihan, so the Lokasi Mitra is paid its tariff. */
    | { kind: "melalui_operator" }
    /**
     * A Harga Khusus covered the whole Tagihan, so it is Lunas at issue and **no money
     * ever moved**: no tariff is due and no Potongan arises (a Potongan is a fee on money
     * the Lokasi Mitra received, and it received none). The Operator bears the reduction,
     * from the Biaya Layanan Platform first and then its own funds, unless a `partnerShare`
     * was recorded — which lowers this order's Pencairan whatever the family paid.
     */
    | { kind: "tanpa_pembayaran" }
    /**
     * The family paid the Lokasi Mitra itself, so no money reached the Operator:
     * **no tariff Pencairan is due for this order**, and `biayaPlatform` — the
     * Biaya Layanan Platform on its Tagihan — is owed as a Potongan instead.
     */
    | { kind: "langsung_ke_lokasi_mitra"; pada: Date; /** Whether the Admin Lokasi uploaded its record of the cash. */ bukti: boolean; biayaPlatform: number };
}

/**
 * One order's money, by its Nomor Pemesanan, or null when no such order exists.
 * No actor: this is the projection the Payouts module prices an order's
 * Pencairan item from, and it carries no family detail — only the Lokasi Mitra,
 * the Tagihan, the partner share and where the money went.
 */
export async function pembayaranOrder(deps: OrderPembayaranDeps, nomor: string): Promise<PembayaranOrder | null> {
  const [row] = await deps.db.select().from(pemesananMakam).where(eq(pemesananMakam.nomor, nomor));
  if (!row) return null;
  const tagihan = row.tagihanId ? await deps.billing.tagihan(row.tagihanId) : null;
  return toPembayaranOrder(row, tagihan, row.tagihanId ? await deps.billing.metodePembayaran(row.tagihanId) : null);
}

/** The two neighbours' own public reads this projection is built from. */
export type OrderPembayaranDeps = Pick<PemesananDeps, "db" | "billing">;

type Row = typeof pemesananMakam.$inferSelect;

/**
 * One order's money, from the Tagihan Billing read for it and the method that
 * settled it. The method is what separates "the family paid" from "a Harga
 * Khusus gave it all away": both leave a Lunas Tagihan, and only one of them
 * means money reached the Operator. An order whose Tagihan is Lunas with no
 * method to show is reported as `belum_dibayar`, the answer that owes nobody a
 * tariff until a payment says otherwise.
 */
export function toPembayaranOrder(row: Row, tagihan: Tagihan | null, metode: PaymentMethod | null): PembayaranOrder {
  const dasar = {
    nomor: row.nomor,
    lokasi: { id: row.lokasiId, name: row.lokasiName },
    tagihanId: row.tagihanId,
    partnerShare: row.partnerShare ?? 0,
    partnerShareNote: row.partnerShareNote,
  };
  if (!row.bayarLangsungPada) {
    if (metode?.kind === "tanpa_pembayaran") return { ...dasar, pembayaran: { kind: "tanpa_pembayaran" } };
    return { ...dasar, pembayaran: metode ? { kind: "melalui_operator" } : { kind: "belum_dibayar" } };
  }
  return {
    ...dasar,
    pembayaran: {
      kind: "langsung_ke_lokasi_mitra",
      pada: row.bayarLangsungPada,
      bukti: row.bayarLangsungBukti !== null,
      // The fee on the Tagihan as issued, which never changes: a reissue replaces the Tagihan,
      // and a direct payment settles the one the order points at.
      biayaPlatform: biayaPlatformOf(tagihan),
    },
  };
}

/** The Biaya Layanan Platform on a Tagihan, 0 when it has none (a Lokasi Mitra's own tariff only). */
function biayaPlatformOf(tagihan: Tagihan | null): number {
  return tagihan?.lines.find((line) => line.kind === "biaya_layanan_platform")?.amount ?? 0;
}
