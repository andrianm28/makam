/**
 * Pure rules of the Kedukaan module (ADR 0010): the closed lists, their labels, how urgent each
 * jenis is, which status may follow which, and the Zod schema of the request form. No database,
 * no clock: the form imports this file directly (AGENTS.md, client import rule).
 */
import { z } from "zod";

/** What a Permintaan Kedukaan asks for: one Layanan Kedukaan, or a Konsultasi Rencana Pemakaman. */
export const jenisKedukaanValues = [
  "rumah_duka",
  "mobil_jenazah",
  "cargo_jenazah",
  "repatriasi_jenazah",
  "peti_jenazah",
  "bunga_duka_cita",
  "konsultasi",
] as const;
export type JenisKedukaan = (typeof jenisKedukaanValues)[number];

/** The six Layanan Kedukaan, in the order the menu lists them (without Konsultasi). */
export const layananKedukaanValues = jenisKedukaanValues.filter((jenis): jenis is Exclude<JenisKedukaan, "konsultasi"> => jenis !== "konsultasi");

export const labelJenisKedukaan: Record<JenisKedukaan, string> = {
  rumah_duka: "Rumah Duka",
  mobil_jenazah: "Mobil Jenazah",
  cargo_jenazah: "Jasa Cargo Jenazah",
  repatriasi_jenazah: "Jasa Repatriasi Jenazah",
  peti_jenazah: "Peti Jenazah",
  bunga_duka_cita: "Bunga Duka Cita",
  konsultasi: "Konsultasi Rencana Pemakaman",
};

export const statusKedukaanValues = ["diajukan", "dihubungi", "selesai", "dibatalkan"] as const;
export type StatusKedukaan = (typeof statusKedukaanValues)[number];

export const labelStatusKedukaan: Record<StatusKedukaan, string> = {
  diajukan: "Diajukan",
  dihubungi: "Dihubungi",
  selesai: "Selesai",
  dibatalkan: "Dibatalkan",
};

/** The statuses Admin Platform may move a Permintaan to, from each status; Selesai and Dibatalkan are final. */
export const transisiStafKedukaan: Record<StatusKedukaan, readonly StatusKedukaan[]> = {
  diajukan: ["dihubungi", "dibatalkan"],
  dihubungi: ["selesai", "dibatalkan"],
  selesai: [],
  dibatalkan: [],
};

/**
 * How soon the first contact is due, by jenis (ADR 0010): a body waiting for transport or a
 * funeral home is Tier 1 within 30 minutes, a coffin or flowers Tier 2 within 2 hours, a
 * Konsultasi Tier 3 within one Hari Kerja.
 */
export const urgensiKedukaan: Record<JenisKedukaan, { tier: 1 | 2 | 3; kontakPertama: { menit: number } | { hariKerja: number } }> = {
  mobil_jenazah: { tier: 1, kontakPertama: { menit: 30 } },
  cargo_jenazah: { tier: 1, kontakPertama: { menit: 30 } },
  repatriasi_jenazah: { tier: 1, kontakPertama: { menit: 30 } },
  rumah_duka: { tier: 1, kontakPertama: { menit: 30 } },
  peti_jenazah: { tier: 2, kontakPertama: { menit: 120 } },
  bunga_duka_cita: { tier: 2, kontakPertama: { menit: 120 } },
  konsultasi: { tier: 3, kontakPertama: { hariKerja: 1 } },
};

export const waktuDihubungiValues = ["pagi", "siang", "sore"] as const;
export const labelWaktuDihubungi: Record<(typeof waktuDihubungiValues)[number], string> = {
  pagi: "Pagi (08.00–11.00)",
  siang: "Siang (11.00–15.00)",
  sore: "Sore (15.00–18.00)",
};

const teks = (max: number) => z.string().trim().min(1).max(max);
const tanggal = z.iso.date();

const umum = {
  nama: teks(120),
  telepon: teks(30),
  kabKota: teks(120),
  catatan: z.string().trim().max(1000).default(""),
};

const perjalanan = z.object({ asal: teks(120), tujuan: teks(120), tanggal });

/** The request form, one shape per jenis: the facts Admin Platform needs before the first call. */
export const permintaanKedukaanSchema = z.discriminatedUnion("jenis", [
  z.object({ jenis: z.literal("mobil_jenazah"), ...umum, rincian: perjalanan }),
  z.object({ jenis: z.literal("cargo_jenazah"), ...umum, rincian: perjalanan }),
  z.object({
    jenis: z.literal("repatriasi_jenazah"),
    ...umum,
    rincian: z.object({ negaraAsal: teks(120), tujuan: teks(120), tanggal }),
  }),
  z.object({ jenis: z.literal("rumah_duka"), ...umum, rincian: z.object({ tanggal }) }),
  z.object({ jenis: z.literal("peti_jenazah"), ...umum, rincian: z.object({ tanggal }) }),
  z.object({
    jenis: z.literal("bunga_duka_cita"),
    ...umum,
    rincian: z.object({ tanggal, teksUcapan: z.string().trim().max(200).default("") }),
  }),
  z.object({
    jenis: z.literal("konsultasi"),
    ...umum,
    rincian: z.object({ waktuDihubungi: z.enum(waktuDihubungiValues), lokasiDiminati: z.string().trim().max(200).default("") }),
  }),
]);
export type PermintaanKedukaanInput = z.input<typeof permintaanKedukaanSchema>;
export type PermintaanKedukaanData = z.output<typeof permintaanKedukaanSchema>;
export type RincianKedukaan = PermintaanKedukaanData["rincian"];
