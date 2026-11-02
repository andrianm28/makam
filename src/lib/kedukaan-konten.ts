/**
 * The copy of the Layanan Kedukaan and Konsultasi Rencana Pemakaman pages (ADR 0010): our own words,
 * one entry per jenis, each with the icon the card shows instead of a photograph. Types only from the
 * Kedukaan module's own `skema.ts`, so the request form may read this too.
 */
import type { JenisKedukaan } from "@/domain/kedukaan/skema";

export type IkonKedukaan = "home" | "truck" | "package" | "plane" | "box" | "flower" | "messages";

export interface KontenKedukaan {
  jenis: JenisKedukaan;
  /** The path segment under /layanan-kedukaan; Konsultasi has its own page. */
  slug: string;
  judul: string;
  ringkas: string;
  lead: string;
  /** What the service covers, as we arrange it. */
  cakupan: string[];
  /** What the family is asked on the form, so nothing comes as a surprise. */
  ditanyakan: string[];
  ikon: IkonKedukaan;
}

export const kontenKedukaan: Record<JenisKedukaan, KontenKedukaan> = {
  rumah_duka: {
    jenis: "rumah_duka",
    slug: "rumah-duka",
    judul: "Rumah Duka",
    ringkas: "Tempat persemayaman dan menerima pelayat, dekat lokasi pemakaman.",
    lead: "Kami carikan ruang persemayaman yang sesuai jumlah pelayat dan tradisi keluarga, sedekat mungkin dengan tempat pemakaman.",
    cakupan: ["Ruang persemayaman untuk satu sampai beberapa hari", "Kursi dan perlengkapan menerima pelayat", "Koordinasi jadwal dengan pemakaman"],
    ditanyakan: ["Kota", "Tanggal mulai dibutuhkan", "Perkiraan jumlah pelayat (di catatan)"],
    ikon: "home",
  },
  mobil_jenazah: {
    jenis: "mobil_jenazah",
    slug: "mobil-jenazah",
    judul: "Mobil Jenazah",
    ringkas: "Penjemputan dan pengantaran jenazah dalam dan antarkota.",
    lead: "Kami atur mobil jenazah dari rumah sakit atau rumah duka ke tempat pemakaman, siang maupun malam.",
    cakupan: ["Penjemputan dari rumah sakit, rumah, atau rumah duka", "Pengantaran ke tempat pemakaman atau rumah duka", "Pengemudi berpengalaman"],
    ditanyakan: ["Lokasi penjemputan", "Tujuan", "Tanggal dibutuhkan"],
    ikon: "truck",
  },
  cargo_jenazah: {
    jenis: "cargo_jenazah",
    slug: "cargo-jenazah",
    judul: "Jasa Cargo Jenazah",
    ringkas: "Pengiriman jenazah antarkota di Indonesia lewat udara atau darat.",
    lead: "Bila almarhum dimakamkan di kota lain, kami bantu pengiriman jenazah beserta dokumen yang diminta maskapai atau ekspedisi.",
    cakupan: ["Pemilihan jalur udara atau darat", "Pengurusan dokumen pengiriman", "Penjemputan di kota tujuan bila diperlukan"],
    ditanyakan: ["Kota asal", "Kota tujuan", "Tanggal dibutuhkan"],
    ikon: "package",
  },
  repatriasi_jenazah: {
    jenis: "repatriasi_jenazah",
    slug: "repatriasi-jenazah",
    judul: "Jasa Repatriasi Jenazah",
    ringkas: "Pemulangan jenazah dari luar negeri ke Indonesia.",
    lead: "Kami dampingi keluarga memulangkan jenazah dari luar negeri: koordinasi dengan pihak di negara asal, dokumen, dan penerbangan.",
    cakupan: ["Koordinasi dengan pihak rumah sakit atau penyedia di negara asal", "Pendampingan dokumen pemulangan", "Penjemputan di bandara kedatangan"],
    ditanyakan: ["Negara asal", "Kota tujuan di Indonesia", "Perkiraan tanggal"],
    ikon: "plane",
  },
  peti_jenazah: {
    jenis: "peti_jenazah",
    slug: "peti-jenazah",
    judul: "Peti Jenazah",
    ringkas: "Peti jenazah sesuai kebutuhan dan tradisi, diantar ke lokasi.",
    lead: "Kami siapkan peti jenazah sesuai ukuran, bahan, dan tradisi keluarga, lalu kami antar ke rumah duka atau lokasi persemayaman.",
    cakupan: ["Pilihan ukuran dan bahan", "Pengantaran ke rumah duka atau lokasi", "Perlengkapan dasar di dalam peti"],
    ditanyakan: ["Kota", "Tanggal dibutuhkan", "Kebutuhan khusus (di catatan)"],
    ikon: "box",
  },
  bunga_duka_cita: {
    jenis: "bunga_duka_cita",
    slug: "bunga-duka-cita",
    judul: "Bunga Duka Cita",
    ringkas: "Karangan dan rangkaian bunga duka cita, diantar tepat waktu.",
    lead: "Kirim karangan bunga atau rangkaian meja ke rumah duka, rumah keluarga, atau pemakaman, dengan ucapan yang Anda tulis.",
    cakupan: ["Karangan bunga papan atau rangkaian meja", "Ucapan sesuai tulisan Anda", "Pengantaran ke alamat tujuan"],
    ditanyakan: ["Kota", "Tanggal pengantaran", "Teks ucapan"],
    ikon: "flower",
  },
  konsultasi: {
    jenis: "konsultasi",
    slug: "konsultasi-rencana-pemakaman",
    judul: "Konsultasi Rencana Pemakaman",
    ringkas: "Bicara dengan tim kami sebelum memilih makam dan layanan.",
    lead: "Merencanakan lebih awal meringankan keluarga. Ceritakan kebutuhan Anda, tim kami menelepon pada waktu yang Anda pilih, tanpa biaya dan tanpa kewajiban memesan.",
    cakupan: ["Pilihan lokasi dan jenis makam yang sesuai", "Perkiraan biaya dan cara pembayaran", "Layanan kedukaan yang mungkin dibutuhkan nanti"],
    ditanyakan: ["Kota", "Waktu Anda bisa dihubungi", "Lokasi makam yang diminati (opsional)"],
    ikon: "messages",
  },
};

/** The six Layanan Kedukaan by their path segment. */
export function kontenDariSlug(slug: string): KontenKedukaan | null {
  const satu = Object.values(kontenKedukaan).find((konten) => konten.slug === slug && konten.jenis !== "konsultasi");
  return satu ?? null;
}

export function hrefKedukaan(jenis: JenisKedukaan): string {
  return jenis === "konsultasi" ? "/konsultasi-rencana-pemakaman" : `/layanan-kedukaan/${kontenKedukaan[jenis].slug}`;
}
