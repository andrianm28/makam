/**
 * The Rilis 1 set of Data Contoh (ticket 109): the five example Lokasi Mitra of
 * `seed-contoh-publik`, each named "... (Contoh)" and carrying clearly round
 * EXAMPLE prices, never the prototype's own numbers. These amounts are what
 * `tanam --set rilis1` writes, so they are the table the owner approves
 * (ticket 109, "Amounts"): change one here and it changes there.
 *
 * Every price is a multiple of Rp 1.000.000 or smaller and round, and every
 * Hak Pakai stays at or under Rp 9.000.000 so that, with the contoh Biaya Layanan
 * Platform, its all-in total stays within the Rp 10.000.000 QRIS cap and the Jenis
 * Makam shows on the public Lokasi page (one over the cap is left out of it).
 */
import type { JenisLayanan } from "@/domain/layanan";
import { CONTOH_LOKASI, type ContohLokasiSpec } from "../seed-contoh-publik-command";

/** The contoh Biaya Layanan Platform: entered only when no version of it is set at all. */
export const BIAYA_LAYANAN_PLATFORM_DATA_CONTOH = 100_000;

/** Biaya Pemakaman at every contoh Lokasi Mitra, and the amount for a tumpang. */
export const BIAYA_PEMAKAMAN_DATA_CONTOH = 1_000_000;
export const BIAYA_PEMAKAMAN_TUMPANG_DATA_CONTOH = 500_000;

/** The Lokasi price of a Layanan variant at a contoh Lokasi Mitra, by the kind of Layanan: one amount for every variant of it. */
export const HARGA_LAYANAN_DATA_CONTOH: Record<JenisLayanan, number> = {
  bunga: 100_000,
  nisan: 1_000_000,
  pembersihan: 200_000,
  perawatan: 300_000,
  laporan: 50_000,
};

/** The Petugas Lapangan every contoh Lokasi Mitra's Kunjungan Verifikasi is done by: its own Akun, on the reserved `.invalid` TLD. */
export const PETUGAS_DATA_CONTOH = { email: "petugas.data-contoh@contoh.makam.invalid", phoneNumber: "085200010001" };

interface HargaJenisMakam {
  hargaHakPakai: number;
  hargaPerpanjangan: number | null;
  /** A price scheduled for a later date, through Tariffs' own versioning. */
  hargaBaru?: number;
}

/** Hak Pakai and Perpanjangan prices per example Lokasi Mitra and Jenis Makam (the names of `CONTOH_LOKASI`, before marking). */
const HARGA_JENIS_MAKAM: Record<string, Record<string, HargaJenisMakam>> = {
  "Taman Makam Firdaus": {
    "Makam Standar": { hargaHakPakai: 5_000_000, hargaPerpanjangan: 2_000_000, hargaBaru: 6_000_000 },
    "Makam Taman": { hargaHakPakai: 8_000_000, hargaPerpanjangan: 3_000_000 },
    "Makam Selamanya": { hargaHakPakai: 9_000_000, hargaPerpanjangan: null },
  },
  "Pemakaman Wakaf Al-Ikhlas": {
    "Makam Umum": { hargaHakPakai: 3_000_000, hargaPerpanjangan: null },
    "Kavling Keluarga 2 Petak": { hargaHakPakai: 6_000_000, hargaPerpanjangan: null },
  },
  "Makam Masjid Nurul Huda": {
    "Makam Umum": { hargaHakPakai: 2_000_000, hargaPerpanjangan: 1_000_000 },
  },
  "Taman Peristirahatan Hijau Asri": {
    "Makam Standar": { hargaHakPakai: 5_000_000, hargaPerpanjangan: 2_000_000 },
    "Makam Taman": { hargaHakPakai: 8_000_000, hargaPerpanjangan: 3_000_000 },
    "Kavling Keluarga 4 Petak": { hargaHakPakai: 9_000_000, hargaPerpanjangan: 4_000_000 },
  },
  "Pemakaman Bukit Sejuk": {
    "Makam Standar": { hargaHakPakai: 4_000_000, hargaPerpanjangan: 2_000_000 },
  },
};

/** The mark every seeded name carries. */
export const tandaContoh = (nama: string): string => `${nama} (Contoh)`;

/** A name as a fixture code's path segment: lower case, letters and digits, single hyphens. */
export function slug(nama: string): string {
  return nama
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function hargaDari(lokasi: string, jenisMakam: string): HargaJenisMakam {
  const harga = HARGA_JENIS_MAKAM[lokasi]?.[jenisMakam];
  // An example Lokasi Mitra or Jenis Makam with no price listed here must never fall back to the prototype's own number.
  if (!harga) throw new Error(`Data Contoh rilis1: tidak ada harga contoh untuk ${lokasi} / ${jenisMakam}`);
  return harga;
}

/** One `seed-contoh-publik` fixture, as the Rilis 1 set plants it: marked, example-priced, its staff on addresses of their own. */
export function sebagaiDataContoh(spec: ContohLokasiSpec, nomor: number): ContohLokasiSpec {
  return {
    ...spec,
    name: tandaContoh(spec.name),
    pengelolaName: tandaContoh(spec.pengelolaName),
    biayaPemakaman: BIAYA_PEMAKAMAN_DATA_CONTOH,
    biayaPemakamanTumpang: BIAYA_PEMAKAMAN_TUMPANG_DATA_CONTOH,
    jenisMakam: spec.jenisMakam.map((jm) => {
      const harga = hargaDari(spec.name, jm.name);
      return {
        ...jm,
        name: tandaContoh(jm.name),
        hargaHakPakai: harga.hargaHakPakai,
        hargaPerpanjangan: harga.hargaPerpanjangan,
        hargaBaru: jm.hargaBaru && harga.hargaBaru !== undefined ? { effectiveOn: jm.hargaBaru.effectiveOn, hargaHakPakai: harga.hargaBaru } : undefined,
      };
    }),
    denahPrototipe: spec.denahPrototipe?.map((blok) => ({ ...blok, jenisMakam: tandaContoh(blok.jenisMakam) })),
    adminLokasiEmail: `data-contoh.${slug(spec.name)}@contoh.makam.invalid`,
    adminLokasiPhone: `08510001000${nomor}`,
    kontakSiagaName: tandaContoh(spec.kontakSiagaName),
  };
}

/** The five Lokasi Mitra of the Rilis 1 set. */
export const LOKASI_RILIS1: ContohLokasiSpec[] = CONTOH_LOKASI.map((spec, index) => sebagaiDataContoh(spec, index + 1));
