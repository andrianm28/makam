import type { GrupSaatDuka, PilihanSaatDuka } from "@/domain/pemesanan";
import type { KartuTpu } from "@/domain/pengurusan";
import { labelAgama, agamaDiterima, type Agama } from "@/domain/lokasi/skema-info-kartu";
import { konfirmasiTpuLabel } from "@/lib/pengurusan-labels";
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
  /** Its size and capacity as the mitra's brosur says them; "" when none was written. */
  deskripsi: string;
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
  alamat: string;
  /** The agama it accepts, in the list's own order: the agama filter reads it. */
  agama: Agama[];
  /** "Lintas agama" when it takes every one, else the names joined; "" when none is recorded. */
  agamaLabel: string;
  deskripsi: string;
  luasLahan: string;
  krematorium: boolean;
  /** Whether the Lokasi is inside its Jam Operasional at the Clock's now. */
  bukaSekarang: boolean;
  /** "Dikonfirmasi paling lambat …", or that it has no Jam Operasional to promise one. */
  konfirmasi: string;
  /** The Kontak Siaga to phone outside Jam Operasional; null before one is picked. */
  kontakSiaga: { nama: string; telepon: string } | null;
  pilihan: KartuView[];
  /** The Lokasi Mitra's own Kunjungan Verifikasi photo, signed for this request; null when it has none yet. */
  photoUrl: string | null;
}

export function kartuView(kartu: PilihanSaatDuka): KartuView {
  return {
    jenisMakamId: kartu.jenisMakamId,
    jenisMakamName: kartu.jenisMakamName,
    deskripsi: kartu.jenisMakamDescription,
    masaHakPakai: `Masa Hak Pakai ${tenureLabel(kartu.tenure)}`,
    tersedia: kartu.tersedia,
    total: kartu.harga.total,
    rincian: kartu.harga.lines.map((line) => ({ label: quoteLineLabel(line), amount: line.amount })),
  };
}

export function grupView(grup: GrupSaatDuka, photoUrl: string | null = null): GrupView {
  return {
    lokasiId: grup.lokasi.id,
    lokasiName: grup.lokasi.name,
    kota: grup.lokasi.city,
    alamat: grup.lokasi.address,
    agama: agamaDiterima.filter((agama) => grup.lokasi.infoKartu.agama.includes(agama)),
    agamaLabel: agamaLabel(grup.lokasi.infoKartu.agama),
    deskripsi: grup.lokasi.infoKartu.deskripsi,
    luasLahan: grup.lokasi.infoKartu.luasLahan,
    krematorium: grup.lokasi.infoKartu.krematorium,
    bukaSekarang: grup.konfirmasi.bukaSekarang,
    konfirmasi: konfirmasiLabel(grup.konfirmasi.batas),
    kontakSiaga: grup.konfirmasi.kontakSiaga?.phoneNumber
      ? {
          nama: grup.konfirmasi.kontakSiaga.name,
          telepon: grup.konfirmasi.kontakSiaga.phoneNumber,
        }
      : null,
    pilihan: grup.pilihan.map(kartuView),
    photoUrl,
  };
}

/** What the card says about the agama a Lokasi Mitra accepts: "Lintas agama" for all six, else the names; "" for none recorded. */
export function agamaLabel(agama: readonly Agama[]): string {
  const urut = agamaDiterima.filter((satu) => agama.includes(satu));
  if (urut.length === agamaDiterima.length) return "Lintas agama";
  return urut.map((satu) => labelAgama[satu]).join(", ");
}

/**
 * The Lokasi Mitra groups the agama filter keeps: every one for "semua", else
 * those that accept that agama. A Lokasi with no agama recorded is kept only
 * under "semua", since nothing says it takes that agama.
 */
export function saringAgama<T extends Pick<GrupView, "agama">>(grup: T[], agama: Agama | "semua"): T[] {
  return agama === "semua" ? grup : grup.filter((satu) => satu.agama.includes(agama));
}

/** The groups by city, in the order the cities first appear (the list is cheapest first, so the cheapest city leads). */
export function perKota<T extends Pick<GrupView, "kota">>(grup: T[]): { kota: string; grup: T[] }[] {
  const urutan: { kota: string; grup: T[] }[] = [];
  for (const satu of grup) {
    const ada = urutan.find((kelompok) => kelompok.kota === satu.kota);
    if (ada) ada.grup.push(satu);
    else urutan.push({ kota: satu.kota, grup: [satu] });
  }
  return urutan;
}

/** One TPU of the "Pilih makam" section, as its card shows it. */
export interface TpuKartuView {
  tpuId: string;
  tpuName: string;
  kota: string;
  alamat: string;
  /** The all-in total: Biaya Pengurusan (the burial) + Retribusi Pemda as their own lines; a TPU order never carries a Biaya Layanan Platform. */
  total: number;
  /** The same total, line by line, for the sticky bar's breakdown. */
  rincian: { label: string; amount: number }[];
  /** "Dikonfirmasi paling lambat …", counted on the 06:00–18:00 WIB TPU window. */
  konfirmasi: string;
  /** Whether that window is open at the Clock's now; outside it the card points at CS. */
  bukaSekarang: boolean;
}

export function tpuKartuView(kartu: KartuTpu): TpuKartuView {
  return {
    tpuId: kartu.tpu.id,
    tpuName: kartu.tpu.name,
    kota: kartu.tpu.city,
    alamat: kartu.tpu.address,
    total: kartu.harga.total,
    rincian: kartu.harga.lines.map((line) => ({ label: quoteLineLabel(line), amount: line.amount })),
    konfirmasi: konfirmasiTpuLabel(kartu.konfirmasi.batas),
    bukaSekarang: kartu.konfirmasi.bukaSekarang,
  };
}
