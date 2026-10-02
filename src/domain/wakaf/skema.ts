/**
 * Pure rules of the Wakaf module: statuses, the Jabodetabek rule, the transitions Admin Platform
 * may make by hand, and the Zod schemas. No database, no clock.
 */
import { z } from "zod";
import { jenisNazhir, statusWakaf, tujuanWakaf, type StatusWakaf } from "./schema";

/** The label shown for each status (the timeline, the Antrean, the email). */
export const labelStatusWakaf: Record<StatusWakaf, string> = {
  diajukan: "Diajukan",
  ditinjau: "Ditinjau",
  survei_dijadwalkan: "Survei Dijadwalkan",
  menunggu_ikrar: "Menunggu Ikrar",
  proses_sertipikat: "Proses Sertipikat",
  selesai: "Selesai",
  ditolak: "Ditolak",
  dirujuk: "Dirujuk",
  dibatalkan: "Dibatalkan",
};

/** The Jabodetabek kab/kota, bare (the prefix "Kota" or "Kabupaten" is dropped before comparing). */
const JABODETABEK = new Set([
  "jakarta pusat",
  "jakarta utara",
  "jakarta barat",
  "jakarta selatan",
  "jakarta timur",
  "kepulauan seribu",
  "bogor",
  "depok",
  "tangerang",
  "tangerang selatan",
  "bekasi",
]);

/** The kab/kota the form offers (in full), all inside Jabodetabek; anything else is typed and is Dirujuk. */
export const kabKotaJabodetabek = [
  "Kota Jakarta Pusat",
  "Kota Jakarta Utara",
  "Kota Jakarta Barat",
  "Kota Jakarta Selatan",
  "Kota Jakarta Timur",
  "Kabupaten Kepulauan Seribu",
  "Kota Bogor",
  "Kabupaten Bogor",
  "Kota Depok",
  "Kota Tangerang",
  "Kabupaten Tangerang",
  "Kota Tangerang Selatan",
  "Kota Bekasi",
  "Kabupaten Bekasi",
] as const;

function normalisasiKabKota(teks: string): string {
  return teks
    .toLowerCase()
    .replace(/\./g, " ")
    .replace(/\b(kota administrasi|kota adm|kabupaten|kota|kab)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Whether a kab/kota is inside Jabodetabek: the one rule behind the automatic Dirujuk (spec, Wakaf). */
export function didalamJabodetabek(kabKota: string): boolean {
  return JABODETABEK.has(normalisasiKabKota(kabKota));
}

/** The pointer a Wakif outside Jabodetabek is given: the local KUA and the BWI's office. */
export const PETUNJUK_DIRUJUK =
  "Pengajuan di luar Jabodetabek belum kami tangani. Silakan datang ke Kantor Urusan Agama (KUA) kecamatan setempat atau kantor perwakilan Badan Wakaf Indonesia (BWI) di kabupaten/kota tanah Anda untuk memulai proses ikrar wakaf.";

/** Working days from Diajukan to the first contact (Tier 3 Antrean row, no alert). */
export const KONTAK_PERTAMA_HARI_KERJA = 3;

/**
 * The statuses Admin Platform may move a Pengajuan to by hand, from each status. The Wakif's own
 * Dibatalkan is not here: it is a Wakif's act with its own limit (Menunggu Ikrar).
 */
export const transisiStaf: Record<StatusWakaf, readonly StatusWakaf[]> = {
  diajukan: ["ditinjau", "ditolak", "dirujuk"],
  ditinjau: ["survei_dijadwalkan", "ditolak", "dirujuk"],
  survei_dijadwalkan: ["menunggu_ikrar", "ditolak", "dirujuk"],
  menunggu_ikrar: ["proses_sertipikat", "ditolak"],
  proses_sertipikat: ["selesai", "ditolak"],
  selesai: [],
  ditolak: [],
  dirujuk: [],
  dibatalkan: [],
};

/** The statuses from which the Wakif may still cancel: before Menunggu Ikrar. */
export const statusBisaDibatalkan: readonly StatusWakaf[] = ["diajukan", "ditinjau", "survei_dijadwalkan"];

/** A status nothing moves out of. */
export const statusAkhir: readonly StatusWakaf[] = ["selesai", "ditolak", "dirujuk", "dibatalkan"];

export const BERKAS_WAKAF_MAX_BYTES = 8 * 1024 * 1024;

const teks = (maks: number) => z.string().trim().min(1).max(maks);

export const berkasWakafInputSchema = z.object({
  kunci: z.enum(["bukti_kepemilikan", "ktp_wakif", "lainnya"]),
  body: z.instanceof(Uint8Array),
  contentType: z.string().max(100),
});
export type BerkasWakafInput = z.infer<typeof berkasWakafInputSchema>;

export const ajukanWakafSchema = z
  .object({
    tujuan: z.enum(tujuanWakaf),
    namaKeluarga: z.string().trim().max(200).optional(),
    wakifNama: teks(200),
    wakifTelepon: teks(30),
    hubunganDenganTanah: teks(200),
    kabKota: teks(100),
    alamat: teks(500),
    pin: z.object({ lat: z.number().min(-11.5).max(6.5), lng: z.number().min(94.5).max(141.5) }).nullable(),
    luasM2: z.number().int().min(1).max(100_000_000),
    jenisBukti: teks(100),
    /** A Nazhir on the list, or a name typed (a Wakif who already has one). Both empty: not chosen yet. */
    nazhirId: z.uuid().nullable().optional(),
    nazhirNama: z.string().trim().max(200).optional(),
    berkas: z.array(berkasWakafInputSchema).max(10).default([]),
  })
  .refine((input) => input.tujuan !== "keluarga" || !!input.namaKeluarga, { path: ["namaKeluarga"], message: "wajib untuk wakaf keluarga" });
export type AjukanWakafInput = z.input<typeof ajukanWakafSchema>;

export const batalkanWakafSchema = z.object({ pengajuanId: z.uuid(), alasan: z.string().trim().max(500).optional() });
export const tambahBerkasWakafSchema = z.object({ pengajuanId: z.uuid(), berkas: z.array(berkasWakafInputSchema).min(1).max(10) });

export const nazhirInputSchema = z.object({
  nama: teks(200),
  jenis: z.enum(jenisNazhir),
  kabKota: teks(100),
  kontak: teks(200),
  nomorBwi: teks(100),
});
export type NazhirInput = z.input<typeof nazhirInputSchema>;
export const ubahNazhirSchema = nazhirInputSchema.extend({ nazhirId: z.uuid() });
export const hapusNazhirSchema = z.object({ nazhirId: z.uuid() });

/** One manual move by Admin Platform: the new status, with the date or reason it needs, and an optional note to the Wakif. */
export const pindahStatusSchema = z.object({
  pengajuanId: z.uuid(),
  status: z.enum(statusWakaf),
  /** Survei Dijadwalkan: the survey's date. Menunggu Ikrar: the KUA's date. */
  tanggal: z.iso.date().optional(),
  /** Ditolak and Dirujuk: the reason, shown to the Wakif. */
  alasan: z.string().trim().max(1000).optional(),
  /** Survei Dijadwalkan: the Petugas Lapangan who does the survey. */
  petugasAccountId: z.string().trim().min(1).optional(),
  /** Selesai: the AIW / certificate scan. */
  hasil: berkasWakafInputSchema.optional(),
  /** A note to the Wakif that goes with the change (also kept in the Wakif's notes). */
  catatanWakif: z.string().trim().max(2000).optional(),
});

export const cocokkanNazhirSchema = z.object({ pengajuanId: z.uuid(), nazhirId: z.uuid() });
export const tulisCatatanSchema = z.object({
  pengajuanId: z.uuid(),
  jenis: z.enum(["wakif", "internal"]),
  isi: teks(2000),
});
