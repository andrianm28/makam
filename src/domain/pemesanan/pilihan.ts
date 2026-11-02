/**
 * The Saat Duka "Pilih makam" list (spec, Pemesanan > Saat Duka; the public
 * booking wizard): every Terverifikasi Lokasi Mitra grouped with the Jenis
 * Makam it still has cleared Tersedia units of, each card's all-in total from
 * the same `quote()` a Tagihan is priced with, and the Lokasi's confirmation
 * promise said once per Lokasi.
 */
import { withinPaymentCap } from "@/domain/billing";
import type { AllInPrice, Tenure } from "@/domain/tariffs";
import type { KontakSiaga, WorkingTimeResult } from "@/domain/lokasi";
import type { PemesananDeps } from "./deps";

/** One card of the list: a Jenis Makam at a Lokasi Mitra that still has one. */
export interface PilihanSaatDuka {
  jenisMakamId: string;
  jenisMakamName: string;
  /** The Masa Hak Pakai the Hak Pakai would have, as the card words it. */
  tenure: Tenure;
  /** Cleared Tersedia units of this Jenis Makam (a Kavling Keluarga counts as one); at least 1. */
  tersedia: number;
  /**
   * The all-in total this order would carry: Harga Hak Pakai + Biaya
   * Pemakaman + one Biaya Layanan Platform, as `quote()` priced it now.
   */
  harga: AllInPrice;
}

/** A Lokasi Mitra in the list, with the promise and the contact said once. */
export interface GrupSaatDuka {
  lokasi: { id: string; name: string; city: string };
  /**
   * The confirmation promise, from the Lokasi's Jam Operasional: whether it is
   * open now, when it will confirm (2 service hours), and its Kontak Siaga
   * (null before a pick, or while that Akun is no longer Admin Lokasi here).
   */
  konfirmasi: { bukaSekarang: boolean; batas: WorkingTimeResult; kontakSiaga: KontakSiaga | null };
  /** Its Jenis Makam with cleared Tersedia units, cheapest all-in total first. */
  pilihan: PilihanSaatDuka[];
}

/** The Saat Duka confirmation promise: two hours of the Lokasi's Jam Operasional (spec). */
export const JAM_KONFIRMASI_SAAT_DUKA = 2;

export interface PilihanSaatDukaQuery {
  /** Exact kota / kabupaten; every city when none is given ("Semua kota"). */
  city?: string;
  /** Every Lokasi Mitra but this one: a family a Lokasi Mitra has just refused is sent back to the others (ticket 24). */
  kecualiLokasiId?: string;
  /** Only this Lokasi Mitra; with `jenisMakamId`, only that one card ("Data & kirim" prices the choice again). */
  lokasiId?: string;
  jenisMakamId?: string;
}

/**
 * Every Terverifikasi Lokasi Mitra that still has a Jenis Makam with a cleared
 * Tersedia unit, cheapest all-in total first, filtered by kota. A Jenis Makam
 * with none is left out, and so is one whose all-in total is above the QRIS
 * cap (v1 takes no such order). No actor: this is the wizard's own read.
 *
 * `kecualiLokasiId` leaves one Lokasi Mitra out of the answer itself rather than
 * of the screen: a family whose order was declined there is sent back to the rest,
 * and there is nothing for a page to remember not to draw.
 */
export async function pilihanSaatDuka(deps: PemesananDeps, query: PilihanSaatDukaQuery = {}): Promise<GrupSaatDuka[]> {
  const at = deps.clock.now();
  const diluar = query.kecualiLokasiId;
  const semua = await deps.lokasi.publicLokasiMitraList(
    query.lokasiId ? { id: query.lokasiId } : query.city ? { city: query.city } : {},
  );
  const lokasiMitra = diluar ? semua.filter((satu) => satu.id !== diluar) : semua;
  const grup = await Promise.all(
    lokasiMitra.map(async (lokasi): Promise<GrupSaatDuka | null> => {
      const [pricing, tertila] = await Promise.all([
        deps.tariffs.lokasiPricing(lokasi.id, at),
        deps.inventory.tersediaPerJenisMakam(lokasi.id),
      ]);
      const counts = tersediaJumlah(tertila);
      const pilihan = await Promise.all(
        pricing.jenisMakam.map(async (card): Promise<PilihanSaatDuka | null> => {
          if (!tersedia(counts, card.jenisMakam.id)) return null;
          const harga = await saatDukaHarga(deps, lokasi.id, card.jenisMakam.id, at);
          return harga && {
            jenisMakamId: card.jenisMakam.id,
            jenisMakamName: card.jenisMakam.name,
            tenure: card.tenure,
            tersedia: counts.get(card.jenisMakam.id)!,
            harga,
          };
        }),
      );
      const priced = pilihan
        .filter((one): one is PilihanSaatDuka => one !== null)
        .filter((one) => !query.jenisMakamId || one.jenisMakamId === query.jenisMakamId)
        .sort((a, b) => a.harga.total - b.harga.total);
      if (priced.length === 0) return null;
      return { lokasi: { id: lokasi.id, name: lokasi.name, city: lokasi.city }, konfirmasi: await konfirmasi(deps, lokasi.id), pilihan: priced };
    }),
  );
  return grup
    .filter((one): one is GrupSaatDuka => one !== null)
    .sort((a, b) => a.pilihan[0].harga.total - b.pilihan[0].harga.total);
}

/**
 * The card "Pilih makam" starts on: the Lokasi Mitra the visitor came from with
 * its cheapest card, else the cheapest card of the list. It is the list's own
 * order that decides, so a screen never keeps a second opinion of it.
 */
export function kartuAwal(grup: GrupSaatDuka[], lokasiId: string | null): { lokasiId: string; jenisMakamId: string } | null {
  const dariLokasi = grup.find((satu) => satu.lokasi.id === lokasiId);
  const group = dariLokasi ?? grup[0];
  const kartu = group?.pilihan[0];
  return group && kartu ? { lokasiId: group.lokasi.id, jenisMakamId: kartu.jenisMakamId } : null;
}

/** The count of cleared Tersedia units per Jenis Makam, zero for one that has none. */
function tersediaJumlah(counts: { jenisMakamId: string; count: number }[]) {
  return new Map(counts.map((row) => [row.jenisMakamId, row.count]));
}

/** Whether a Jenis Makam still has a unit a Pemesan may choose. */
function tersedia(counts: Map<string, number>, jenisMakamId: string): boolean {
  return (counts.get(jenisMakamId) ?? 0) > 0;
}

/** The confirmation promise and the Kontak Siaga of one Lokasi Mitra, said once on its group. */
async function konfirmasi(deps: PemesananDeps, lokasiId: string): Promise<GrupSaatDuka["konfirmasi"]> {
  const [buka, batas, kontakSiaga] = await Promise.all([
    deps.lokasi.bukaSekarang(lokasiId),
    deps.lokasi.serviceHoursDeadline(lokasiId, JAM_KONFIRMASI_SAAT_DUKA),
    deps.lokasi.kontakSiagaOf(lokasiId),
  ]);
  // A Lokasi with no promise to make keeps the calculator's own refusal: the card
  // says nothing rather than a deadline nobody promised.
  return { bukaSekarang: buka.ok ? buka.buka : false, batas: batas.ok ? batas : belumDiisi, kontakSiaga };
}

/** The calculator's refusal for a Lokasi Mitra whose Jam Operasional cannot answer. */
const belumDiisi: WorkingTimeResult = { ok: false, reason: "jam_operasional_belum_diisi" };

/**
 * The all-in total of one Saat Duka card, priced the way its Tagihan will be
 * (Harga Hak Pakai + Biaya Pemakaman + one Biaya Layanan Platform, exactly what
 * `quote()` adds to a Lokasi Mitra order), or null when it cannot be priced
 * now or is above the QRIS cap: a card that shows no total is no card.
 */
export async function saatDukaHarga(
  deps: Pick<PemesananDeps, "tariffs">,
  lokasiId: string,
  jenisMakamId: string,
  at: Date,
): Promise<AllInPrice | null> {
  const quoted = await deps.tariffs.quote(
    [
      { kind: "harga_hak_pakai", jenisMakamId },
      { kind: "biaya_pemakaman", lokasiId, tumpang: false },
    ],
    at,
  );
  if (!quoted.ok || !withinPaymentCap(quoted.total)) return null;
  return { total: quoted.total, lines: quoted.lines, inForceSince: quoted.inForceSince, scheduledChange: quoted.scheduledChange };
}
