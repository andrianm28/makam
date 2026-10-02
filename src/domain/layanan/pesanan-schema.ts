/**
 * The Layanan order's boundary: what a Pemesan may ask for, and what an Admin
 * Lokasi may do to a job.
 *
 * This file is nothing but `zod`, on purpose. The order form is a Client
 * Component (it holds the chosen variants, the date picker and the Camera API's
 * frames), and AGENTS.md allows a client component's import graph to take types
 * and validation schemas from a domain module's **own** file, never from its
 * barrel: a bundler keeps a module whole, and the barrel builds its public
 * object out of the functions that reach the database. A type is erased and a
 * Zod schema reaches nothing, so both are safe here.
 */
import { z } from "zod";

/**
 * The three things a job's proof can be (spec, Catalog): a photo before, a photo
 * after, a video. The closed list lives here, in the one file of this module that
 * is nothing but Zod, so both the database column and the client component's form
 * can name it without either pulling in the other.
 */
export const buktiPekerjaanValues = ["foto_sebelum", "foto_sesudah", "video"] as const;
export type BuktiPekerjaan = (typeof buktiPekerjaanValues)[number];

/** One Layanan a Pemesan adds to an order: a fixed-price variant, its target date, and any text it asks for. */
export const itemPesananLayananSchema = z.object({
  layananVariantId: z.uuid("Pilih layanan yang tersedia di Lokasi Mitra ini."),
  /** The WIB calendar date the family asks for, "YYYY-MM-DD". */
  targetDate: z.iso.date("Tanggal target harus berformat tahun-bulan-hari."),
  /** The Layanan's own free-text field (a nisan inscription), or null when it asks for none. */
  teks: z.string().trim().max(500).nullable().default(null),
});
export type ItemPesananLayananInput = z.infer<typeof itemPesananLayananSchema>;

/**
 * One Layanan a Pemesan adds at a booking checkout (Saat Duka hari-H, Terencana empty-plot, Perpanjangan
 * "Tambah Layanan", ticket 53). The target date is the family's own only where it picks one: a hari-H item's date
 * is the burial day, set when the order is confirmed, so it carries none.
 */
export const itemCheckoutSchema = z.object({
  layananVariantId: z.uuid("Pilih layanan yang tersedia di Lokasi Mitra ini."),
  targetDate: z.iso.date("Tanggal target harus berformat tahun-bulan-hari.").optional(),
  teks: z.string().trim().max(500).nullable().default(null),
});
export type ItemCheckoutInput = z.infer<typeof itemCheckoutSchema>;
export const itemCheckoutListSchema = z.array(itemCheckoutSchema).max(10);

/** The whole of the Layanan checkout: one grave, one or more Layanan, and who is paying for it. */
export const placePesananLayananSchema = z.object({
  /** The Petak Makam the Layanan are for, as the Makam keluarga hub's lookup named it. */
  lokasiId: z.uuid("Lokasi Mitra tidak ditemukan."),
  petakId: z.uuid("Petak Makam tidak ditemukan."),
  pemesanName: z.string().trim().min(1, "Tulis nama lengkap Anda.").max(200),
  /** E.164 or a local number; the Tagihan is addressed to it and the order may be called about it. */
  phoneNumber: z.string().trim().min(1, "Tulis nomor telepon Anda.").max(30),
  item: z.array(itemPesananLayananSchema).min(1, "Pilih minimal satu layanan.").max(10),
});
export type PlacePesananLayananInput = z.infer<typeof placePesananLayananSchema>;

/** The Admin Lokasi's three steps on one job: start it, add a proof, finish it. */
export const mulaiPekerjaanSchema = z.object({
  pekerjaanId: z.uuid(),
});

/** One piece of photo proof, as the in-app camera hands it over. */
export const buktiPekerjaanSchema = z.object({
  pekerjaanId: z.uuid(),
  kind: z.enum(buktiPekerjaanValues, { message: "Jenis bukti tidak dikenal." }),
  /** The captured frame, as the browser's MediaRecorder / canvas produced it. */
  file: z.object({ body: z.instanceof(Uint8Array), contentType: z.string().trim().min(1).max(120) }),
  /**
   * When the camera took it, as the browser's own clock reported it (ISO
   * instant). The Admin Lokasi's phone is the witness that this was not
   * uploaded from a gallery today, so the server clock is not asked to be one.
   */
  takenAt: z.coerce.date(),
});
export type BuktiPekerjaanInput = z.infer<typeof buktiPekerjaanSchema>;

/** The Pemesan cancelling one job, with the reason they give. */
export const batalkanPekerjaanSchema = z.object({
  pekerjaanId: z.uuid(),
  alasan: z.string().trim().min(1, "Tulis alasan pembatalan.").max(500),
});
export type BatalkanPekerjaanInput = z.infer<typeof batalkanPekerjaanSchema>;

/** The Pemesan's Keluhan on one finished job (spec, Layanan: "file a Keluhan within 3×24 h of seeing the proof"). */
export const ajukanKeluhanSchema = z.object({
  pekerjaanId: z.uuid(),
  alasan: z.string().trim().min(1, "Tulis keluhan Anda.").max(1000, "Keluhan terlalu panjang."),
});
export type AjukanKeluhanInput = z.infer<typeof ajukanKeluhanSchema>;

/** The Pemesan's optional Penilaian of one finished job: 1–5 stars and a comment. */
export const beriPenilaianSchema = z.object({
  pekerjaanId: z.uuid(),
  bintang: z.coerce.number().int("Pilih 1 sampai 5 bintang.").min(1, "Pilih 1 sampai 5 bintang.").max(5, "Pilih 1 sampai 5 bintang."),
  komentar: z
    .string()
    .trim()
    .max(1000, "Komentar terlalu panjang.")
    .nullish()
    .transform((value) => (value ? value : null)),
});
export type BeriPenilaianInput = z.infer<typeof beriPenilaianSchema>;

/** What Admin Platform may decide about a Keluhan (spec: "redo or refund", or reject it). */
export const keputusanKeluhanValues = ["tolak", "kerjakan_ulang", "kembalikan_dana"] as const;
export type KeputusanKeluhan = (typeof keputusanKeluhanValues)[number];

/** Admin Platform's decision on one Keluhan, with the note that goes with it. */
export const putuskanKeluhanSchema = z.object({
  keluhanId: z.uuid(),
  keputusan: z.enum(keputusanKeluhanValues, { message: "Pilih keputusan." }),
  catatan: z.string().trim().min(1, "Tulis catatan keputusan.").max(500, "Catatan terlalu panjang."),
});
export type PutuskanKeluhanInput = z.infer<typeof putuskanKeluhanSchema>;

/** Admin Platform's override of what the job pays its fulfiller after a Keluhan: a new whole-rupiah amount and a mandatory note. */
export const sesuaikanPencairanKeluhanSchema = z.object({
  keluhanId: z.uuid(),
  amount: z.coerce.number().int("Tulis jumlah rupiah tanpa pecahan.").positive("Jumlah harus lebih dari nol."),
  catatan: z.string().trim().min(1, "Tulis catatan penyesuaian.").max(500, "Catatan terlalu panjang."),
});
export type SesuaikanPencairanKeluhanInput = z.infer<typeof sesuaikanPencairanKeluhanSchema>;
