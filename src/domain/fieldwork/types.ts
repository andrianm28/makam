import { z } from "zod";
import { lokasiFacilities } from "@/domain/lokasi";
import { tugasLapanganTypes } from "./schema";

export type TugasLapanganType = (typeof tugasLapanganTypes)[number];

const facilityKeys = Object.keys(lokasiFacilities) as [string, ...string[]];

/** One required-upload kind for a Tugas Lapangan type: Selesai is refused while fewer than `min` are in. */
export interface RequiredUpload {
  kind: string;
  label: string;
  min: number;
}

/**
 * The required uploads Selesai is gated on, per type (spec, Field Work).
 * Kunjungan Verifikasi and Cek Denah are the types this ticket builds; the
 * other three are typed hooks (a generic "dokumen" upload) for tickets 45, 46
 * and 58 to refine.
 */
export const requiredUploadsByType: Record<TugasLapanganType, RequiredUpload[]> = {
  kunjungan_verifikasi: [{ kind: "foto_lokasi", label: "Foto lokasi", min: 1 }],
  cek_denah: [{ kind: "foto_denah", label: "Foto Denah", min: 1 }],
  ambil_surat_pengantar: [{ kind: "dokumen", label: "Foto/scan surat pengantar", min: 1 }],
  berkas_iptm: [{ kind: "dokumen", label: "Foto/scan berkas IPTM", min: 1 }],
  survei_wakaf: [{ kind: "dokumen", label: "Foto/dokumen survei", min: 1 }],
  setor_retribusi: [{ kind: "bukti_setor", label: "Foto/scan bukti setor", min: 1 }],
};

/** The Kunjungan Verifikasi form: confirms the pin (at the Lokasi's gate), facilities and address. */
export const kunjunganVerifikasiFormSchema = z.object({
  addressConfirmed: z.boolean(),
  pin: z.object({ lat: z.number().min(-11.5).max(6.5), lng: z.number().min(94.5).max(141.5) }).nullable(),
  facilities: z.object({
    checked: z.array(z.enum(facilityKeys)).max(facilityKeys.length),
    note: z.string().trim().max(1000),
  }),
  note: z.string().trim().max(2000),
});
export type KunjunganVerifikasiForm = z.infer<typeof kunjunganVerifikasiFormSchema>;

/** The Cek Denah form: a spot-check of the Denah against what is on site. */
export const cekDenahFormSchema = z.object({
  sesuaiDenah: z.boolean(),
  note: z.string().trim().max(2000),
});
export type CekDenahForm = z.infer<typeof cekDenahFormSchema>;

/**
 * The Setor Retribusi form (ticket 45): a Petugas Lapangan who handed a town's
 * office its Retribusi records when and how much they paid, which is what
 * closes the Tier 3 row. The amount is the Retribusi line's own, never the
 * Tagihan's total, and the note is where the receipt's number goes when the town
 * wrote one.
 */
export const setorRetribusiFormSchema = z.object({
  dibayarkanPada: z.iso.date(),
  catatan: z.string().trim().max(2000),
});
export type SetorRetribusiForm = z.infer<typeof setorRetribusiFormSchema>;

/** The generic form for a type not yet built out (tickets 46, 58): a note only. */
export const genericFormSchema = z.object({ note: z.string().trim().max(2000) });
export type GenericForm = z.infer<typeof genericFormSchema>;

/** The Zod schema for a Tugas Lapangan type's form: type-specific for Kunjungan Verifikasi, Cek Denah and Setor Retribusi, generic otherwise. */
export function formSchemaFor(type: TugasLapanganType) {
  switch (type) {
    case "kunjungan_verifikasi":
      return kunjunganVerifikasiFormSchema;
    case "cek_denah":
      return cekDenahFormSchema;
    case "setor_retribusi":
      return setorRetribusiFormSchema;
    default:
      return genericFormSchema;
  }
}

/** The label shown for each Tugas Lapangan type (Admin Platform's create form, "Tugas saya"). */
export const tugasLapanganTypeLabels: Record<TugasLapanganType, string> = {
  kunjungan_verifikasi: "Kunjungan Verifikasi",
  cek_denah: "Cek Denah",
  ambil_surat_pengantar: "Ambil surat pengantar",
  berkas_iptm: "Berkas IPTM",
  survei_wakaf: "Survei Wakaf",
  setor_retribusi: "Setor Retribusi",
};
