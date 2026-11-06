import { z } from "zod";

/** The longest name, city, manager and segment line. */
export const INFO_MAKAM_SWASTA_TEKS_PENDEK_MAX = 160;
/** The longest address and facilities text. */
export const INFO_MAKAM_SWASTA_TEKS_PANJANG_MAX = 600;
/** The most sources one entry names, one per line. */
export const INFO_MAKAM_SWASTA_SUMBER_MAKS = 6;

/**
 * Words an Info Makam Swasta entry may never carry: it is not a partner, it is
 * not verified, and nothing on it can be priced, ordered or paid (owner,
 * 2 Nov 2026: no fake agreement or visit, label "Belum bermitra").
 */
export const KLAIM_TERLARANG = /terverifikasi|bermitra|harga|pesan sekarang|bersertifikat|Rp\s?\d/i;

const pendek = z.string().trim().min(1).max(INFO_MAKAM_SWASTA_TEKS_PENDEK_MAX);
const opsional = z
  .string()
  .trim()
  .max(INFO_MAKAM_SWASTA_TEKS_PANJANG_MAX)
  .transform((value) => (value === "" ? null : value));

/**
 * What Admin Platform types for one Info Makam Swasta entry. `sumber` is one
 * public source per line (a site or "Media, bulan tahun"), at least one.
 * Shared by the Server Action and the client form (types and schema only).
 */
export const infoMakamSwastaSchema = z.object({
  nama: pendek,
  kota: pendek,
  alamat: z.string().trim().min(1).max(INFO_MAKAM_SWASTA_TEKS_PANJANG_MAX),
  pengelola: pendek,
  segmen: pendek,
  luas: opsional,
  fasilitas: opsional,
  sumber: z
    .string()
    .transform((value) =>
      value
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== ""),
    )
    .pipe(z.array(z.string().max(INFO_MAKAM_SWASTA_TEKS_PENDEK_MAX)).min(1).max(INFO_MAKAM_SWASTA_SUMBER_MAKS)),
  urutan: z.string().trim().regex(/^\d{1,3}$/).transform(Number),
});

export type InfoMakamSwastaFormInput = z.input<typeof infoMakamSwastaSchema>;
export type InfoMakamSwastaInput = z.output<typeof infoMakamSwastaSchema>;
