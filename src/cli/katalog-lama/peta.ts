/**
 * The import plan: a catalog export, mapped onto what v1's Lokasi and Tariffs
 * modules accept, with every row that cannot come across refused and named, and
 * every row whose meaning the owner still has to decide asked as a question.
 * Pure: it reads no database and writes none, so a dry run is this plan plus a
 * report.
 *
 * The export contract (./ekspor.ts) holds what the source's data must look like.
 * This module holds the v1 rules the export cannot know:
 *
 * - one old code per catalog row, and one Jenis Makam name per Lokasi Mitra (the
 *   code is the key the import is idempotent on);
 * - a Lokasi Mitra needs someone who runs it: a source that names nobody is
 *   refused, never given a placeholder name;
 * - the source's own facility labels are matched against v1's closed checklist
 *   and a label that matches nothing is reported, never guessed at;
 * - a fixed-term Hak Pakai needs a Perpanjangan price;
 * - a price already in force is never rewritten: a `berlakuMulai` before today
 *   is refused and asked about, not silently entered as of today;
 * - a price the source only estimated (an indicative range, with no term and
 *   never charged at) is not a Harga Hak Pakai: the Jenis Makam is refused and
 *   asked about, never given somebody else's number. The same goes for a
 *   cemetery-level estimate, which is reported and never entered at all;
 * - a Jenis Makam whose all-in total passes the Rp 10.000.000 QRIS cap is
 *   imported but never listed (spec, decision 2026-09-26; the Tariffs module
 *   leaves it out of the public pricing on its own);
 * - a row the source itself marked as example data is flagged on the plan, and
 *   the import puts that flag on the Lokasi Mitra record, which the Lokasi
 *   module then refuses to publish or list (ticket 86).
 */
import { withinPaymentCap } from "@/domain/billing";
import { lokasiFacilities, type LokasiFacility, type LokasiProfileInput } from "@/domain/lokasi";
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

/** A label reduced to what the two sides can be compared on: lowercase letters and digits only. */
function normalise(teks: string): string {
  return teks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * The facility labels this tool recognises, as a label set per key of v1's
 * checklist. Only v1's own key and label are always recognised; the rest are
 * the names a cemetery's own signboard uses, and nothing looser than that: a
 * label outside these sets is reported, never mapped to whatever seemed close.
 */
const labelFasilitas: Record<LokasiFacility, readonly string[]> = {
  parkir: ["parkir", "parking", "area parkir", "lahan parkir"],
  musala: ["musala", "masjid", "ruang doa", "surau"],
  toilet: ["toilet", "wc", "toilet umum", "kamar mandi"],
  air_bersih: ["air bersih", "air minum", "sumur"],
  penerangan: ["penerangan", "lampu", "penerangan malam"],
  pos_jaga: ["pos jaga", "pos keamanan", "pos satpam"],
  akses_ambulans: ["akses ambulans", "mobil jenazah", "jalur ambulans"],
  tempat_duduk: ["tempat duduk", "pendopo", "gazebo", "bangku"],
};

/** The checklist key a source label names, or null when it names none of them. */
function fasilitasDari(label: string): LokasiFacility | null {
  const labelIni = normalise(label);
  if (labelIni === "") return null;
  for (const [key, labelDikenal] of Object.entries(labelFasilitas) as [LokasiFacility, readonly string[]][]) {
    const semua = [key.replaceAll("_", " "), ...lokasiFacilities[key], ...labelDikenal].map(normalise);
    if (semua.includes(labelIni)) return key;
  }
  return null;
}

/** A Jenis Makam as the import will enter it, with what the report needs to say about it. */
export interface RencanaJenisMakam {
  /** The source's own code: the key this import is idempotent on. */
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
  /** The source's own code: the key this import is idempotent on. */
  kode: string;
  /**
   * The whole Lokasi Mitra profile, in the one shape the Lokasi module records
   * it (`updateProfile`). `createLokasiMitra` takes the same four identity
   * fields out of it; there is no second copy of them here to keep in step.
   */
  profil: LokasiProfileInput;
  biayaPemakaman: { biayaPemakaman: Rupiah; biayaPemakamanTumpang: Rupiah | null } | null;
  jenisMakam: RencanaJenisMakam[];
  /** The source's own publication status; carried, never acted on. */
  statusTerbit: string | null;
  /** The source itself froze this row as example data: the record must say so too. */
  dataContoh: boolean;
}

export type DitolakAlasan =
  | "kode_ganda"
  | "pengelola_kosong"
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
  tentang:
    | "pengelola_kosong"
    | "fasilitas_tidak_dikenal"
    | "status_terbit"
    | "harga_indikatif"
    | "harga_indikatif_lokasi"
    | "harga_lampau"
    | "tanpa_jenis_makam";
  kode: string;
  detail: string;
}

export interface Rencana {
  lokasi: RencanaLokasi[];
  /** Every Jenis Makam of every Lokasi, in reading order; for the report. */
  jenisMakam: RencanaJenisMakam[];
  ditolak: Ditolak[];
  pertanyaan: Pertanyaan[];
  /** Rows the source itself marked as example data, with the marker they carry. */
  dataContoh: { kode: string; penanda: string }[];
  ringkasan: {
    lokasiDibaca: number;
    lokasiDiimpor: number;
    jenisMakamDibaca: number;
    jenisMakamDiimpor: number;
    /** Imported, but the public pricing leaves them out. */
    jenisMakamDiLuarCap: number;
    /** Of the rows read, how many the source itself marked as example data. */
    dataContoh: number;
    ditolak: number;
  };
}

/** A Jenis Makam that can be entered, with the values narrowed so the caller needs no assertion. */
type JenisMasuk = { masuk: true; hargaHakPakai: Rupiah; masaHak: Tenure; effectiveOn: string };

/**
 * The plan for an export on `hariIni` (a WIB date, "YYYY-MM-DD", from the Clock).
 */
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

    // The record needs someone who runs the cemetery; a source that names nobody
    // is refused rather than given a placeholder a person would read as a name.
    if (baris.pengelola === null || baris.pengelola === "") {
      ditolak.push({ kode: baris.kode, untuk: "lokasi", alasan: "pengelola_kosong", detail: "aplikasi lama tidak menyebut pengelola" });
      pertanyaan.push({
        tentang: "pengelola_kosong",
        kode: baris.kode,
        detail: 'Aplikasi lama tidak menyebut siapa yang mengelola Lokasi ini; isi "pengelola" di ekspor, karena v1 tidak pernah menebak nama.',
      });
      continue;
    }

    const penanda = penandaDataContoh(baris);
    if (penanda) dataContoh.push({ kode: baris.kode, penanda });
    if (baris.statusTerbit !== null && baris.statusTerbit !== "published") {
      pertanyaan.push({
        tentang: "status_terbit",
        kode: baris.kode,
        detail: `Aplikasi lama menyimpan status terbit "${baris.statusTerbit}"; v1 tetap mengimpornya sebagai Belum Tayang.`,
      });
    }
    if (baris.hargaIndikatif && (baris.hargaIndikatif.min !== null || baris.hargaIndikatif.max !== null)) {
      pertanyaan.push({
        tentang: "harga_indikatif_lokasi",
        kode: baris.kode,
        detail: `${rentangTeks(baris.hargaIndikatif)} untuk Lokasi ini sendiri, sebuah rentang, bukan harga yang bisa ditagih; v1 tidak mengimpornya sebagai tarif. Perlu harga Hak Pakai yang sebenarnya per Jenis Makam.`,
      });
    }

    const facilities = baris.fasilitas.map(fasilitasDari);
    const tidakDikenal = baris.fasilitas.filter((_, index) => facilities[index] === null);
    if (tidakDikenal.length > 0) {
      pertanyaan.push({
        tentang: "fasilitas_tidak_dikenal",
        kode: baris.kode,
        detail: `Label fasilitas di aplikasi lama yang tidak ada di daftar v1, jadi tidak diimpor: ${tidakDikenal.map((label) => `"${label}"`).join(", ")}.`,
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
      // The invariant is this module's own: a Jenis Makam either has a price with
      // a term, or it is not entered and the owner is asked.
      const masalah = periksaJenis(jenis, hariIni);
      if (!masalah.masuk) {
        ditolak.push({ kode: jenis.kode, untuk: "jenis_makam", alasan: masalah.alasan, detail: masalah.detail });
        if ("tentang" in masalah) {
          pertanyaan.push({ tentang: masalah.tentang, kode: jenis.kode, detail: masalah.pertanyaan });
        }
        continue;
      }
      kodeJenisDipakai.add(jenis.kode);
      namaDipakai.add(namaKey);
      const allIn = masalah.hargaHakPakai + (biayaPemakaman?.biayaPemakaman ?? 0);
      jenisLokasi.push({
        kode: jenis.kode,
        nama: jenis.nama,
        deskripsi: jenis.deskripsi,
        hargaHakPakai: masalah.hargaHakPakai,
        masaHak: masalah.masaHak,
        hargaPerpanjangan: jenis.hargaPerpanjangan,
        effectiveOn: masalah.effectiveOn,
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
    const profil: LokasiProfileInput = {
      name: baris.nama,
      pengelolaName: baris.pengelola,
      address: baris.alamat,
      city: baris.kota,
      pin: baris.pin,
      facilities: {
        checked: facilities.filter((satu): satu is LokasiFacility => satu !== null),
        note: baris.catatanFasilitas,
      },
    };
    lokasi.push({
      kode: baris.kode,
      profil,
      biayaPemakaman,
      jenisMakam: jenisLokasi,
      statusTerbit: baris.statusTerbit,
      dataContoh: penanda !== null,
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

/** Why one Jenis Makam cannot be entered as it stands, or the values to enter it with. */
type PeriksaJenis =
  | JenisMasuk
  | { masuk: false; alasan: DitolakAlasan; detail: string }
  | { masuk: false; alasan: DitolakAlasan; detail: string; tentang: Pertanyaan["tentang"]; pertanyaan: string };

function periksaJenis(jenis: KatalogLamaJenisMakam, hariIni: string): PeriksaJenis {
  if (jenis.hargaHakPakai === null) {
    const rentang = jenis.hargaIndikatif;
    if (!rentang || (rentang.min === null && rentang.max === null)) {
      return {
        masuk: false,
        alasan: "harga_belum_dapat_dimasukkan",
        detail: "tidak punya harga",
        tentang: "harga_indikatif",
        pertanyaan:
          "Aplikasi lama tidak punya harga untuk Jenis Makam ini, jadi tidak ada yang bisa diimpor. Perlu harga Hak Pakai yang sebenarnya, beserta masa hak dan harga perpanjangannya.",
      };
    }
    return {
      masuk: false,
      alasan: "harga_belum_dapat_dimasukkan",
      detail: `hanya rentang indikatif ${rentangTeks(rentang)}`,
      tentang: "harga_indikatif",
      pertanyaan: `Aplikasi lama hanya punya rentang indikatif ${rentangTeks(rentang)}, bukan harga yang bisa ditagih; v1 tidak mengimpornya sebagai harga Hak Pakai. Perlu harga Hak Pakai yang sebenarnya, beserta masa hak dan harga perpanjangannya.`,
    };
  }
  const masaHak = jenis.masaHak;
  if (masaHak === null) {
    // Unreachable through the export contract (a price needs a term), and refused here
    // rather than entered with a term this module would have to invent.
    return { masuk: false, alasan: "harga_belum_dapat_dimasukkan", detail: "harga tanpa masa hak" };
  }
  if (masaHak.kind === "tahun" && jenis.hargaPerpanjangan === null) {
    return { masuk: false, alasan: "harga_perpanjangan_wajib", detail: `masa hak ${masaHak.years} tahun` };
  }
  if (jenis.berlakuMulai !== null && jenis.berlakuMulai < hariIni) {
    return {
      masuk: false,
      alasan: "harga_berlaku_sudah_lampau",
      detail: jenis.berlakuMulai,
      tentang: "harga_lampau",
      pertanyaan: `Harga lama berlaku sejak ${jenis.berlakuMulai}; v1 tidak menulis ulang harga yang sudah berlaku. Perlu keputusan owner.`,
    };
  }
  return { masuk: true, hargaHakPakai: jenis.hargaHakPakai, masaHak, effectiveOn: jenis.berlakuMulai ?? hariIni };
}

/** "Rp 4.000.000 – Rp 7.200.000 (Estimasi internal)", the way the report quotes a range. */
function rentangTeks(rentang: { min: Rupiah | null; max: Rupiah | null; sumber: string | null }): string {
  const dari = rentang.min === null ? "tanpa batas bawah" : formatRupiah(rentang.min);
  const sampai = rentang.max === null ? "tanpa batas atas" : formatRupiah(rentang.max);
  return `${dari} – ${sampai}${rentang.sumber ? ` (${rentang.sumber})` : ""}`;
}
