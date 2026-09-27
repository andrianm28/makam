/**
 * The import plan: the old app's catalog, mapped onto what v1's Lokasi and
 * Tariffs modules accept, with every row that cannot come across refused and
 * named, and every row whose meaning the owner still has to decide asked as a
 * question. Pure: it reads no database and writes none, so a dry run is this
 * plan plus a report.
 *
 * The export contract (./ekspor.ts) holds what the old app's data must look
 * like. This module holds the v1 rules the export cannot know:
 *
 * - one Jenis Makam name per Lokasi Mitra, and one old code per catalog row
 *   (the key the import is idempotent on);
 * - a fixed-term Hak Pakai needs a Perpanjangan price;
 * - a price already in force is never rewritten: a `berlakuMulai` before today
 *   is refused and asked about, not silently entered as of today;
 * - a price the old app only estimated (an indicative range, no term, nothing
 *   ever charged at it) is not a Harga Hak Pakai: the Jenis Makam is refused and
 *   asked about, never given somebody else's number;
 * - a Jenis Makam whose all-in total passes the Rp 10.000.000 QRIS cap is
 *   imported but never listed (spec, decision 2026-09-26; the Tariffs module
 *   leaves it out of the public pricing on its own);
 * - a row the old app itself marked as example data is listed as such, so
 *   nobody in the beta reads a fabricated address as a real cemetery.
 */
import { withinPaymentCap } from "@/domain/billing";
import type { NewLokasiMitra, LokasiProfileInput } from "@/domain/lokasi";
import type { Tenure } from "@/domain/tariffs";
import { formatRupiah, type Rupiah } from "@/lib/rupiah";
import type { KatalogLamaEkspor, KatalogLamaJenisMakam } from "./ekspor";

/**
 * The two markers the old app freezes into its own example rows (research
 * 2026-09-27, §1.3: the `FABRICATED_ADDRESS_PREFIX` constant and the name
 * suffix, both written by the seeder and asserted by its `PurgeExampleData`
 * command). They are read from the values, never from a flag, so a renamed
 * marker shows up as a row that is no longer recognised rather than as data
 * that is quietly trusted.
 */
export const PENANDA_ALAMAT_CONTOH = "Jl. Contoh";
export const PENANDA_NAMA_CONTOH = "(pemakaman contoh)";

/** The marker a row carries, if any, in the words the report uses. */
export function penandaDataContoh(lokasi: { nama: string; alamat: string }): string | null {
  if (lokasi.alamat.startsWith(PENANDA_ALAMAT_CONTOH)) return `alamat diawali "${PENANDA_ALAMAT_CONTOH}"`;
  if (lokasi.nama.endsWith(PENANDA_NAMA_CONTOH)) return `nama berakhiran "${PENANDA_NAMA_CONTOH}"`;
  return null;
}

/** A Jenis Makam as the import will enter it, with what the report needs to say about it. */
export interface RencanaJenisMakam {
  /** The old app's own code: the key this import is idempotent on. */
  kode: string;
  nama: string;
  deskripsi: string;
  hargaHakPakai: Rupiah;
  masaHak: Tenure;
  hargaPerpanjangan: Rupiah | null;
  /** The date the version is entered for: today, or the old price's own future date. */
  effectiveOn: string;
  /** What v1 can quote for a burial in this Jenis Makam: the Hak Pakai plus the Lokasi's Biaya Pemakaman. */
  allIn: number;
  /** Above the QRIS cap: imported, never listed. */
  diLuarCap: boolean;
}

/** A Lokasi Mitra as the import will create it, with its Jenis Makam. */
export interface RencanaLokasi {
  /** The old app's own code: the key this import is idempotent on. */
  kode: string;
  lokasi: NewLokasiMitra;
  profil: LokasiProfileInput;
  biayaPemakaman: { biayaPemakaman: Rupiah; biayaPemakamanTumpang: Rupiah | null } | null;
  jenisMakam: RencanaJenisMakam[];
  /** The old app's own publication status; carried, never acted on. */
  statusTerbit: string | null;
}

export type DitolakAlasan =
  | "kode_ganda"
  | "nama_jenis_makam_ganda"
  | "harga_belum_dapat_dimasukkan"
  | "harga_perpanjangan_wajib"
  | "harga_berlaku_sudah_lampau";

/** One row that cannot be imported, and why. */
export interface Ditolak {
  kode: string;
  untuk: "lokasi" | "jenis_makam";
  alasan: DitolakAlasan;
  detail: string;
}

/** Something only the owner can answer before the beta shows it to a tester. */
export interface Pertanyaan {
  tentang: "status_terbit" | "harga_indikatif" | "harga_lampau" | "tanpa_jenis_makam";
  kode: string;
  detail: string;
}

export interface Rencana {
  lokasi: RencanaLokasi[];
  /** Every Jenis Makam of every Lokasi, in reading order; for the report. */
  jenisMakam: RencanaJenisMakam[];
  ditolak: Ditolak[];
  pertanyaan: Pertanyaan[];
  /** Rows the old app itself marked as example data, with the marker they carry. */
  dataContoh: { kode: string; penanda: string }[];
  ringkasan: {
    lokasiDibaca: number;
    lokasiDiimpor: number;
    jenisMakamDibaca: number;
    jenisMakamDiimpor: number;
    /** Imported, but the public pricing leaves them out. */
    jenisMakamDiLuarCap: number;
    /** Of the rows read, how many the old app itself marked as example data. */
    dataContoh: number;
    ditolak: number;
  };
}

/** The plan for an export on `hariIni` (a WIB date, "YYYY-MM-DD", from the Clock). */
export function susunRencana(ekspor: KatalogLamaEkspor, hariIni: string): Rencana {
  const ditolak: Ditolak[] = [];
  const pertanyaan: Pertanyaan[] = [];
  const dataContoh: { kode: string; penanda: string }[] = [];
  const lokasi: RencanaLokasi[] = [];
  const jenisMakam: RencanaJenisMakam[] = [];
  const kodeLokasiDipakai = new Set<string>();
  const kodeJenisDipakai = new Set<string>();
  let jenisMakamDibaca = 0;

  for (const baris of ekspor.lokasi) {
    jenisMakamDibaca += baris.jenisMakam.length;
    if (kodeLokasiDipakai.has(baris.kode)) {
      ditolak.push({ kode: baris.kode, untuk: "lokasi", alasan: "kode_ganda", detail: baris.kode });
      continue;
    }
    kodeLokasiDipakai.add(baris.kode);
    const penanda = penandaDataContoh(baris);
    if (penanda) dataContoh.push({ kode: baris.kode, penanda });
    if (baris.statusTerbit !== null && baris.statusTerbit !== "published") {
      pertanyaan.push({
        tentang: "status_terbit",
        kode: baris.kode,
        detail: `Aplikasi lama menyimpan status terbit "${baris.statusTerbit}"; v1 tetap mengimpornya sebagai Belum Tayang.`,
      });
    }

    const biayaPemakaman = baris.biayaPemakaman;
    const namaDipakai = new Set<string>();
    const jenisLokasi: RencanaJenisMakam[] = [];
    for (const jenis of baris.jenisMakam) {
      const namaKey = jenis.nama.trim().replace(/\s+/g, " ").toLowerCase();
      if (kodeJenisDipakai.has(jenis.kode)) {
        ditolak.push({ kode: jenis.kode, untuk: "jenis_makam", alasan: "kode_ganda", detail: jenis.kode });
        continue;
      }
      if (namaDipakai.has(namaKey)) {
        ditolak.push({ kode: jenis.kode, untuk: "jenis_makam", alasan: "nama_jenis_makam_ganda", detail: jenis.nama });
        continue;
      }
      const masalah = alasanTolak(jenis, hariIni);
      if (masalah) {
        ditolak.push({ kode: jenis.kode, untuk: "jenis_makam", alasan: masalah.alasan, detail: masalah.detail });
        if (masalah.pertanyaan) {
          pertanyaan.push({ tentang: masalah.tentang, kode: jenis.kode, detail: masalah.pertanyaan });
        }
        continue;
      }
      kodeJenisDipakai.add(jenis.kode);
      namaDipakai.add(namaKey);
      const allIn = jenis.hargaHakPakai! + (biayaPemakaman?.biayaPemakaman ?? 0);
      jenisLokasi.push({
        kode: jenis.kode,
        nama: jenis.nama,
        deskripsi: jenis.deskripsi,
        hargaHakPakai: jenis.hargaHakPakai!,
        masaHak: jenis.masaHak!,
        hargaPerpanjangan: jenis.hargaPerpanjangan,
        effectiveOn: jenis.berlakuMulai ?? hariIni,
        allIn,
        diLuarCap: !withinPaymentCap(allIn),
      });
    }
    jenisMakam.push(...jenisLokasi);
    if (jenisLokasi.length === 0 && baris.jenisMakam.length === 0) {
      pertanyaan.push({
        tentang: "tanpa_jenis_makam",
        kode: baris.kode,
        detail: "Aplikasi lama tidak punya harga untuk Lokasi ini; Lokasi Mitra-nya tetap diimpor tanpa Jenis Makam.",
      });
    }
    lokasi.push({
      kode: baris.kode,
      lokasi: { name: baris.nama, pengelolaName: baris.pengelola, address: baris.alamat, city: baris.kota },
      profil: {
        name: baris.nama,
        pengelolaName: baris.pengelola,
        address: baris.alamat,
        city: baris.kota,
        pin: baris.pin,
        facilities: { checked: baris.fasilitas, note: baris.catatanFasilitas },
      },
      biayaPemakaman,
      jenisMakam: jenisLokasi,
      statusTerbit: baris.statusTerbit,
    });
  }

  return {
    lokasi,
    jenisMakam,
    ditolak,
    pertanyaan,
    dataContoh,
    ringkasan: {
      lokasiDibaca: ekspor.lokasi.length,
      lokasiDiimpor: lokasi.length,
      jenisMakamDibaca,
      jenisMakamDiimpor: jenisMakam.length,
      jenisMakamDiLuarCap: jenisMakam.filter((jenis) => jenis.diLuarCap).length,
      dataContoh: dataContoh.length,
      ditolak: ditolak.length,
    },
  };
}

/** Why one Jenis Makam cannot be entered as it stands, and what the owner has to decide about it. */
type Masalah =
  | { alasan: DitolakAlasan; detail: string; tentang?: never; pertanyaan?: never }
  | { alasan: DitolakAlasan; detail: string; tentang: Pertanyaan["tentang"]; pertanyaan: string };

function alasanTolak(jenis: KatalogLamaJenisMakam, hariIni: string): Masalah | null {
  if (jenis.hargaHakPakai === null) {
    const rentang = jenis.hargaIndikatif;
    if (!rentang || (rentang.min === null && rentang.max === null)) {
      return {
        alasan: "harga_belum_dapat_dimasukkan",
        detail: "tidak punya harga",
        tentang: "harga_indikatif",
        pertanyaan:
          "Aplikasi lama tidak punya harga untuk Jenis Makam ini, jadi tidak ada yang bisa diimpor. Perlu harga Hak Pakai yang sebenarnya, beserta masa hak dan harga perpanjangannya.",
      };
    }
    const rentangTeks = `${formatRupiah(rentang.min ?? 0)} – ${formatRupiah(rentang.max ?? 0)}`;
    return {
      alasan: "harga_belum_dapat_dimasukkan",
      detail: `hanya rentang indikatif ${rentangTeks}${rentang.sumber ? ` (${rentang.sumber})` : ""}`,
      tentang: "harga_indikatif",
      pertanyaan: `Aplikasi lama hanya punya rentang indikatif ${rentangTeks}${rentang.sumber ? ` (${rentang.sumber})` : ""}, bukan harga yang bisa ditagih; v1 tidak mengimpornya sebagai harga Hak Pakai. Perlu harga Hak Pakai yang sebenarnya, beserta masa hak dan harga perpanjangannya.`,
    };
  }
  const masaHak = jenis.masaHak;
  if (masaHak?.kind === "tahun" && jenis.hargaPerpanjangan === null) {
    return { alasan: "harga_perpanjangan_wajib", detail: `masa hak ${masaHak.years} tahun` };
  }
  if (jenis.berlakuMulai !== null && jenis.berlakuMulai < hariIni) {
    return {
      alasan: "harga_berlaku_sudah_lampau",
      detail: jenis.berlakuMulai,
      tentang: "harga_lampau",
      pertanyaan: `Harga lama berlaku sejak ${jenis.berlakuMulai}; v1 tidak menulis ulang harga yang sudah berlaku. Perlu keputusan owner.`,
    };
  }
  return null;
}
