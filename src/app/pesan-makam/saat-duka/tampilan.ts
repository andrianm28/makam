import type { GrupSaatDuka, PilihanSaatDuka } from "@/domain/pemesanan";
import { konfirmasiLabel, tenureLabel } from "@/lib/pemesanan-labels";
import { quoteLineLabel } from "@/lib/quote-line-label";

/**
 * What the wizard's screens show, as plain values: the module's groups turned
 * into words, amounts and ids, so a server component hands a client component
 * something it can render without reading the domain types. All wording comes
 * from `@/lib/pemesanan-labels` and `@/lib/quote-line-label`; no rule lives here.
 */

export interface KartuView {
  jenisMakamId: string;
  jenisMakamName: string;
  /** "Masa Hak Pakai 5 tahun" / "Masa Hak Pakai selamanya". */
  masaHakPakai: string;
  /** Cleared Tersedia units of this Jenis Makam. */
  tersedia: number;
  /** The all-in total: Harga Hak Pakai + Biaya Pemakaman + Biaya Layanan Platform. */
  total: number;
  /** The same total, line by line, for the sticky bar's breakdown. */
  rincian: { label: string; amount: number }[];
}

export interface GrupView {
  lokasiId: string;
  lokasiName: string;
  kota: string;
  /** Whether the Lokasi is inside its Jam Operasional at the Clock's now. */
  bukaSekarang: boolean;
  /** "Dikonfirmasi paling lambat …", or that it has no Jam Operasional to promise one. */
  konfirmasi: string;
  /** The Kontak Siaga to phone outside Jam Operasional; null before one is picked. */
  kontakSiaga: { nama: string; telepon: string } | null;
  pilihan: KartuView[];
}

export function kartuView(kartu: PilihanSaatDuka): KartuView {
  return {
    jenisMakamId: kartu.jenisMakamId,
    jenisMakamName: kartu.jenisMakamName,
    masaHakPakai: `Masa Hak Pakai ${tenureLabel(kartu.tenure)}`,
    tersedia: kartu.tersedia,
    total: kartu.harga.total,
    rincian: kartu.harga.lines.map((line) => ({ label: quoteLineLabel(line), amount: line.amount })),
  };
}

export function grupView(grup: GrupSaatDuka): GrupView {
  return {
    lokasiId: grup.lokasi.id,
    lokasiName: grup.lokasi.name,
    kota: grup.lokasi.city,
    bukaSekarang: grup.konfirmasi.bukaSekarang,
    konfirmasi: konfirmasiLabel(grup.konfirmasi.batas),
    kontakSiaga: grup.konfirmasi.kontakSiaga?.phoneNumber
      ? {
          nama: grup.konfirmasi.kontakSiaga.name,
          telepon: grup.konfirmasi.kontakSiaga.phoneNumber,
        }
      : null,
    pilihan: grup.pilihan.map(kartuView),
  };
}
