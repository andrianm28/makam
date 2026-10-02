/**
 * The boundary of a Layanan order at a DKI TPU, and of a Mitra Jasa's answer to a
 * job (spec, Layanan > Order and Mitra Jasa; stories 85, 176, 178; ticket 56).
 *
 * This file is nothing but `zod`, on purpose: the order form is a Client Component,
 * and a client component's import graph may take types and validation schemas from
 * a domain module's **own** file, never from its barrel (AGENTS.md).
 */
import { z } from "zod";
import { itemPesananLayananSchema } from "./pesanan-schema";

/** The largest reference photo of a grave, in bytes. Lives in this zod-only file so a client component can share it. */
export const FOTO_MAKAM_TPU_MAX_BYTES = 8 * 1024 * 1024;

/** A pin the family dropped on the map. */
export const pinMakamSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/**
 * The grave a TPU order is for, **described** (story 85): a DKI TPU has no Denah,
 * so the family says which block and number, whose grave it is, and optionally
 * where on the map. The photo is a file and travels beside this, never in it.
 */
export const makamTpuSchema = z.object({
  blokNomor: z.string().trim().min(1, "Tulis blok dan nomor makamnya.").max(200),
  almarhumName: z.string().trim().min(1, "Tulis nama Almarhum.").max(200),
  keterangan: z.string().trim().max(500).nullable().default(null),
  pin: pinMakamSchema.nullable().default(null),
});
export type MakamTpuInput = z.infer<typeof makamTpuSchema>;

/** The whole of the TPU Layanan checkout: one TPU grave, one or more Layanan, and who is paying. */
export const placePesananLayananTpuSchema = z.object({
  tpuDkiId: z.uuid("TPU tidak ditemukan."),
  makam: makamTpuSchema,
  pemesanName: z.string().trim().min(1, "Tulis nama lengkap Anda.").max(200),
  phoneNumber: z.string().trim().min(1, "Tulis nomor telepon Anda.").max(30),
  item: z.array(itemPesananLayananSchema).min(1, "Pilih minimal satu layanan.").max(10),
});
export type PlacePesananLayananTpuInput = z.infer<typeof placePesananLayananTpuSchema>;

/**
 * One hari-H Layanan a Saat Duka TPU order adds (story 23): only the variant and the
 * text it asks for, because its target date is the burial day, which does not exist yet.
 */
export const itemHariHTpuSchema = z.object({
  layananVariantId: z.uuid("Pilih layanan yang tersedia di TPU."),
  teks: z.string().trim().max(500).nullable().default(null),
});
export type ItemHariHTpu = z.infer<typeof itemHariHTpuSchema>;
export const itemHariHTpuListSchema = z.array(itemHariHTpuSchema).max(10);

/** The grave as a job keeps it: what a Mitra Jasa is shown to find it. */
export interface DeskripsiMakamTpu {
  blokNomor: string;
  almarhumName: string;
  keterangan: string | null;
  /** FileStore keys of the family's reference photos (never public). */
  fotoKeys: string[];
  pin: { lat: number; lng: number } | null;
}

/** Admin Platform hands one job to one Mitra Jasa. */
export const tugaskanMitraJasaSchema = z.object({
  pekerjaanId: z.uuid(),
  mitraJasaId: z.uuid(),
});
export type TugaskanMitraJasaInput = z.infer<typeof tugaskanMitraJasaSchema>;

/** A Mitra Jasa accepts or declines a job assigned to them. */
export const jawabPenugasanSchema = z.object({
  pekerjaanId: z.uuid(),
  jawaban: z.enum(["terima", "tolak"], { message: "Pilih terima atau tolak." }),
  alasan: z.string().trim().max(500).nullable().default(null),
});
export type JawabPenugasanInput = z.infer<typeof jawabPenugasanSchema>;

/** Admin Platform takes a job off the Mitra Jasa who holds it, with a reason, so it can be given to another. */
export const lepasPenugasanSchema = z.object({
  pekerjaanId: z.uuid(),
  alasan: z.string().trim().min(1, "Tulis alasan penugasan ulang.").max(500),
});
export type LepasPenugasanInput = z.infer<typeof lepasPenugasanSchema>;

/** A Mitra Jasa sends the captured proof of a job for approval, or Admin Platform approves it. */
export const pekerjaanTpuIdSchema = z.object({ pekerjaanId: z.uuid() });

/** Admin Platform sends a proof back with the reason the Mitra Jasa will read. */
export const tolakBuktiTpuSchema = z.object({
  pekerjaanId: z.uuid(),
  alasan: z.string().trim().min(1, "Tulis alasan bukti ditolak.").max(500),
});
export type TolakBuktiTpuInput = z.infer<typeof tolakBuktiTpuSchema>;

/** Admin Platform has the Mitra Jasa (the same or another) redo a job after an upheld Keluhan. */
export const kerjaUlangTpuSchema = z.object({ pekerjaanId: z.uuid(), mitraJasaId: z.uuid() });

export const ajukanKeluhanTpuSchema = z.object({
  pekerjaanId: z.uuid(),
  alasan: z.string().trim().min(1, "Tulis keluhan Anda.").max(1000, "Keluhan terlalu panjang."),
});

export const putuskanKeluhanTpuSchema = z.object({
  keluhanId: z.uuid(),
  keputusan: z.enum(["tolak", "kerjakan_ulang"]),
  catatan: z.string().trim().min(1, "Tulis catatan keputusan.").max(1000),
  /** Who redoes the job; required for `kerjakan_ulang`. */
  mitraJasaId: z.uuid().optional(),
});
