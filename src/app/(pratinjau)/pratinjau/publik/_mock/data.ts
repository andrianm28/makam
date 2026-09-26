/*
 * PROTOTYPE, throwaway. Mock data for the public-site prototype: invented
 * Lokasi Mitra, prices and contacts. Nothing here comes from the database.
 */

export const BASE = "/pratinjau/publik";

/** The CS WhatsApp number (Pengaturan Operator), as a wa.me link and for display. */
export const CS = {
  waLink: "https://wa.me/6281100000000",
  phone: "0811-0000-0000",
  hours: "setiap hari, 06.00–22.00 WIB",
};

/** The Operator's flat fee on every Lokasi Mitra order (a separate line). */
export const BIAYA_LAYANAN_PLATFORM = 250_000;

export type Fasilitas = "mushola" | "parkir" | "akses-mobil" | "air" | "keamanan" | "pendopo" | "toilet";

export const FASILITAS_LABEL: Record<Fasilitas, string> = {
  mushola: "Mushola",
  parkir: "Parkir",
  "akses-mobil": "Akses mobil sampai makam",
  air: "Air bersih",
  keamanan: "Penjaga 24 jam",
  pendopo: "Pendopo untuk keluarga",
  toilet: "Toilet",
};

export type JenisLokasi = "Swasta" | "Wakaf" | "Yayasan" | "Masjid";

export type JenisMakam = {
  id: string;
  nama: string;
  ukuran: string;
  masaHakPakai: string;
  hargaHakPakai: number;
  perpanjangan: number | null;
  tersedia: number;
};

export type Foto = { src: string; alt: string; tanggal: string };

export type LokasiMitra = {
  slug: string;
  nama: string;
  kota: string;
  alamat: string;
  jenis: JenisLokasi;
  pengelola: string;
  dikunjungi: string;
  foto: Foto[];
  fasilitas: Fasilitas[];
  jamOperasional: string;
  /** Mock: whether "now" (Sabtu 26 September 2026, 21.40 WIB) is inside its Jam Operasional. */
  bukaSekarang: boolean;
  /** Mock: the confirmation promise computed from Jam Operasional (2 service hours). */
  konfirmasiPalingLambat: string;
  kontakSiaga: { nama: string; telepon: string };
  biayaPemakaman: number;
  biayaPemakamanTumpang: number;
  jenisMakam: JenisMakam[];
  hargaBerlakuSejak: string;
  hargaBaru?: { mulai: string; catatan: string };
  terencanaAktif: boolean;
  pembatalan: string[];
};

const PHOTO = (name: string) => `/pratinjau/publik/${name}`;

export const LOKASI: LokasiMitra[] = [
  {
    slug: "taman-makam-firdaus",
    nama: "Taman Makam Firdaus",
    kota: "Bogor",
    alamat: "Jl. Raya Cileungsi–Jonggol Km 8, Kabupaten Bogor",
    jenis: "Swasta",
    pengelola: "PT Firdaus Lestari Abadi",
    dikunjungi: "Agustus 2026",
    foto: [
      { src: PHOTO("lokasi-jalan-taman.jpg"), alt: "Jalan setapak berbatu di antara taman yang hijau", tanggal: "14 Agustus 2026" },
      { src: PHOTO("lokasi-pendopo.jpg"), alt: "Atap pendopo di antara pepohonan rindang", tanggal: "14 Agustus 2026" },
      { src: PHOTO("lokasi-taman-tropis.jpg"), alt: "Jalan setapak di taman yang teduh", tanggal: "14 Agustus 2026" },
      { src: PHOTO("tile-perpanjang.jpg"), alt: "Hamparan rumput dan pohon besar di area makam", tanggal: "14 Agustus 2026" },
    ],
    fasilitas: ["mushola", "parkir", "akses-mobil", "air", "keamanan", "pendopo", "toilet"],
    jamOperasional: "Senin–Minggu, 07.00–17.00 WIB",
    bukaSekarang: false,
    konfirmasiPalingLambat: "Minggu, 27 September, pukul 09.00 WIB",
    kontakSiaga: { nama: "Bapak Hendra", telepon: "0812-1111-2233" },
    biayaPemakaman: 2_500_000,
    biayaPemakamanTumpang: 1_750_000,
    jenisMakam: [
      { id: "standar", nama: "Makam Standar", ukuran: "1 × 2,5 m", masaHakPakai: "20 tahun", hargaHakPakai: 8_500_000, perpanjangan: 4_000_000, tersedia: 42 },
      { id: "taman", nama: "Makam Taman", ukuran: "1,5 × 3 m, tepi jalan setapak", masaHakPakai: "20 tahun", hargaHakPakai: 14_000_000, perpanjangan: 6_500_000, tersedia: 9 },
      { id: "selamanya", nama: "Makam Selamanya", ukuran: "1,5 × 3 m", masaHakPakai: "Selamanya", hargaHakPakai: 32_000_000, perpanjangan: null, tersedia: 3 },
    ],
    hargaBerlakuSejak: "1 Juli 2026",
    hargaBaru: { mulai: "1 Januari 2027", catatan: "Makam Standar menjadi Rp 9.000.000" },
    terencanaAktif: false,
    pembatalan: [
      "Pembatalan dalam 14 hari setelah pembayaran: seluruh tarif dikembalikan.",
      "Setelah 14 hari dan sebelum ada pemakaman: 70% Harga Hak Pakai dikembalikan.",
      "Biaya Layanan Platform tidak dikembalikan setelah Masa Pembatalan.",
    ],
  },
  {
    slug: "pemakaman-wakaf-al-ikhlas",
    nama: "Pemakaman Wakaf Al-Ikhlas",
    kota: "Depok",
    alamat: "Jl. Tanah Baru No. 21, Beji, Depok",
    jenis: "Wakaf",
    pengelola: "Yayasan Wakaf Al-Ikhlas",
    dikunjungi: "Juli 2026",
    foto: [
      { src: PHOTO("lokasi-makam-wakaf.jpg"), alt: "Deretan nisan yang tertata di pemakaman muslim", tanggal: "22 Juli 2026" },
      { src: PHOTO("lokasi-blok.jpg"), alt: "Area makam berumput hijau dengan beberapa peziarah", tanggal: "22 Juli 2026" },
    ],
    fasilitas: ["mushola", "air", "parkir", "toilet"],
    jamOperasional: "Senin–Sabtu, 06.00–22.00 WIB",
    bukaSekarang: true,
    konfirmasiPalingLambat: "hari ini, pukul 23.40 WIB",
    kontakSiaga: { nama: "Ustaz Farid", telepon: "0813-2222-3344" },
    biayaPemakaman: 1_500_000,
    biayaPemakamanTumpang: 1_000_000,
    jenisMakam: [
      { id: "umum", nama: "Makam Umum", ukuran: "1 × 2 m", masaHakPakai: "Selamanya", hargaHakPakai: 3_000_000, perpanjangan: null, tersedia: 118 },
      { id: "keluarga", nama: "Makam Berdampingan", ukuran: "2 petak bersebelahan", masaHakPakai: "Selamanya", hargaHakPakai: 6_500_000, perpanjangan: null, tersedia: 12 },
    ],
    hargaBerlakuSejak: "1 Mei 2026",
    terencanaAktif: true,
    pembatalan: [
      "Pembatalan dalam 7 hari setelah pembayaran: seluruh tarif dikembalikan.",
      "Setelah 7 hari dan sebelum ada pemakaman: 50% Harga Hak Pakai dikembalikan.",
    ],
  },
  {
    slug: "makam-masjid-nurul-huda",
    nama: "Makam Masjid Nurul Huda",
    kota: "Tangerang Selatan",
    alamat: "Jl. Pondok Aren Raya No. 5, Tangerang Selatan",
    jenis: "Masjid",
    pengelola: "DKM Masjid Nurul Huda",
    dikunjungi: "September 2026",
    foto: [
      { src: PHOTO("lokasi-pendopo.jpg"), alt: "Atap pendopo di antara pepohonan rindang", tanggal: "3 September 2026" },
      { src: PHOTO("lokasi-jalan-taman.jpg"), alt: "Jalan setapak berbatu di antara taman yang hijau", tanggal: "3 September 2026" },
    ],
    fasilitas: ["mushola", "air", "toilet"],
    jamOperasional: "Setiap hari, 05.00–21.00 WIB",
    bukaSekarang: false,
    konfirmasiPalingLambat: "Minggu, 27 September, pukul 07.00 WIB",
    kontakSiaga: { nama: "Bapak Syamsul", telepon: "0815-3333-4455" },
    biayaPemakaman: 1_250_000,
    biayaPemakamanTumpang: 900_000,
    jenisMakam: [
      { id: "umum", nama: "Makam Umum", ukuran: "1 × 2 m", masaHakPakai: "10 tahun", hargaHakPakai: 2_500_000, perpanjangan: 1_500_000, tersedia: 27 },
    ],
    hargaBerlakuSejak: "15 Agustus 2026",
    terencanaAktif: false,
    pembatalan: ["Pembatalan dalam 7 hari setelah pembayaran: seluruh tarif dikembalikan."],
  },
  {
    slug: "taman-peristirahatan-hijau-asri",
    nama: "Taman Peristirahatan Hijau Asri",
    kota: "Bekasi",
    alamat: "Jl. Raya Setu No. 88, Kabupaten Bekasi",
    jenis: "Yayasan",
    pengelola: "Yayasan Hijau Asri Sejahtera",
    dikunjungi: "Juni 2026",
    foto: [
      { src: PHOTO("lokasi-taman-tropis.jpg"), alt: "Jalan setapak di taman yang teduh", tanggal: "10 Juni 2026" },
      { src: PHOTO("tile-perpanjang.jpg"), alt: "Hamparan rumput dan pohon besar di area makam", tanggal: "10 Juni 2026" },
    ],
    fasilitas: ["parkir", "akses-mobil", "pendopo", "keamanan", "toilet"],
    jamOperasional: "Senin–Minggu, 07.00–22.00 WIB",
    bukaSekarang: true,
    konfirmasiPalingLambat: "Minggu, 27 September, pukul 07.40 WIB",
    kontakSiaga: { nama: "Ibu Ratna", telepon: "0817-4444-5566" },
    biayaPemakaman: 3_000_000,
    biayaPemakamanTumpang: 2_000_000,
    jenisMakam: [
      { id: "standar", nama: "Makam Standar", ukuran: "1,2 × 2,5 m", masaHakPakai: "25 tahun", hargaHakPakai: 11_000_000, perpanjangan: 5_000_000, tersedia: 64 },
      { id: "premium", nama: "Makam Taman", ukuran: "2 × 3 m, dengan pagar rendah", masaHakPakai: "25 tahun", hargaHakPakai: 22_500_000, perpanjangan: 9_000_000, tersedia: 0 },
    ],
    hargaBerlakuSejak: "1 Juni 2026",
    terencanaAktif: true,
    pembatalan: ["Pembatalan dalam 14 hari setelah pembayaran: seluruh tarif dikembalikan."],
  },
  {
    slug: "pemakaman-bukit-sejuk",
    nama: "Pemakaman Bukit Sejuk",
    kota: "Bogor",
    alamat: "Jl. Raya Puncak Km 72, Cisarua, Kabupaten Bogor",
    jenis: "Swasta",
    pengelola: "PT Bukit Sejuk Sentosa",
    dikunjungi: "Mei 2026",
    foto: [
      { src: PHOTO("lokasi-blok.jpg"), alt: "Area makam berumput hijau dengan beberapa peziarah", tanggal: "8 Mei 2026" },
      { src: PHOTO("lokasi-makam-wakaf.jpg"), alt: "Deretan nisan yang tertata", tanggal: "8 Mei 2026" },
    ],
    fasilitas: ["mushola", "parkir", "air", "akses-mobil"],
    jamOperasional: "Setiap hari, 06.00–24.00 WIB",
    bukaSekarang: true,
    konfirmasiPalingLambat: "hari ini, pukul 23.40 WIB",
    kontakSiaga: { nama: "Bapak Yusuf", telepon: "0819-5555-6677" },
    biayaPemakaman: 2_000_000,
    biayaPemakamanTumpang: 1_500_000,
    jenisMakam: [
      { id: "standar", nama: "Makam Standar", ukuran: "1 × 2,5 m", masaHakPakai: "15 tahun", hargaHakPakai: 6_000_000, perpanjangan: 3_000_000, tersedia: 30 },
    ],
    hargaBerlakuSejak: "1 April 2026",
    terencanaAktif: false,
    pembatalan: ["Pembatalan dalam 14 hari setelah pembayaran: seluruh tarif dikembalikan."],
  },
];

export const KOTA = [...new Set(LOKASI.map((l) => l.kota))].sort();

export function lokasiBySlug(slug: string) {
  return LOKASI.find((l) => l.slug === slug);
}

/** The Saat Duka all-in total: Harga Hak Pakai + Biaya Pemakaman + Biaya Layanan Platform. */
export function totalSaatDuka(lokasi: LokasiMitra, jenis: JenisMakam) {
  return jenis.hargaHakPakai + lokasi.biayaPemakaman + BIAYA_LAYANAN_PLATFORM;
}

export function mulaiDari(lokasi: LokasiMitra) {
  return Math.min(...lokasi.jenisMakam.map((j) => totalSaatDuka(lokasi, j)));
}

export function rupiah(n: number) {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

/** Every Lokasi Mitra × Jenis Makam with Tersedia units, sorted by all-in total. */
export function pilihanSaatDuka(kota?: string) {
  return LOKASI.filter((l) => !kota || l.kota === kota)
    .flatMap((lokasi) => lokasi.jenisMakam.filter((j) => j.tersedia > 0).map((jenis) => ({ lokasi, jenis, total: totalSaatDuka(lokasi, jenis) })))
    .sort((a, b) => a.total - b.total);
}

export const DOKUMEN = [
  "KTP Almarhum (atau fotokopinya)",
  "Surat keterangan kematian dari rumah sakit atau kelurahan",
  "Kartu Keluarga",
  "KTP Pemegang Hak",
];
