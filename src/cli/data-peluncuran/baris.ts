/**
 * The rows of the launch data template, each kind validated with Zod. A cell is
 * text until a schema here reads it; a row that fails is refused with the reason
 * naming its column, never half-read.
 */
import { z } from "zod";
import { TPU_LIMITS } from "@/domain/lokasi";

const yaTidak = z
  .string()
  .transform((nilai) => nilai.trim().toLowerCase())
  .pipe(z.enum(["ya", "tidak"], { error: 'harus "ya" atau "tidak"' }))
  .transform((nilai) => nilai === "ya");

/** An optional decimal degree: a blank cell is "no pin", anything else must be a number. */
const derajat = (nama: string, batas: number) =>
  z
    .string()
    .transform((nilai, konteks) => {
      if (nilai === "") return null;
      const angka = Number(nilai.replace(",", "."));
      if (!Number.isFinite(angka) || Math.abs(angka) > batas) {
        konteks.addIssue({ code: "custom", message: `${nama} harus angka antara -${batas} dan ${batas}` });
        return z.NEVER;
      }
      return angka;
    });

export const barisTpuSchema = z
  .object({
    nama: z.string().min(1, "nama wajib").max(TPU_LIMITS.name, `nama maksimal ${TPU_LIMITS.name} huruf`),
    alamat: z.string().min(1, "alamat wajib").max(TPU_LIMITS.address),
    kota: z.string().min(1, "kota wajib").max(TPU_LIMITS.city),
    lintang: derajat("lintang", 90),
    bujur: derajat("bujur", 180),
    sumber_data: z.string().min(1, "sumber_data wajib").max(TPU_LIMITS.dataSource),
    menerima_makam_baru: yaTidak,
  })
  .refine((baris) => (baris.lintang === null) === (baris.bujur === null), {
    message: "lintang dan bujur harus diisi keduanya atau dikosongkan keduanya",
    path: ["lintang"],
  })
  .transform((baris) => ({
    name: baris.nama,
    address: baris.alamat,
    city: baris.kota,
    pin: baris.lintang === null || baris.bujur === null ? null : { lat: baris.lintang, lng: baris.bujur },
    dataSource: baris.sumber_data,
    menerimaMakamBaru: baris.menerima_makam_baru,
  }));

export type BarisTpu = z.output<typeof barisTpuSchema>;

/** The reason a row was refused, in the owner's words: the columns and what is wrong with each. */
export function alasanBaris(error: z.ZodError): string {
  return error.issues.map((isu) => `${isu.path.join(".") || "baris"}: ${isu.message}`).join("; ");
}

/** A whole-rupiah cell: digits only, no "Rp", no thousands separator, so `750.000` is refused rather than read as 750. */
const rupiah = (nama: string) =>
  z.string().regex(/^\d+$/, `${nama} harus bilangan bulat rupiah tanpa titik atau "Rp", misalnya 750000`).transform(Number);

/** An optional effective date: blank means the day of the import, anything else is `TTTT-BB-HH`. */
const berlakuMulai = z
  .string()
  .transform((nilai) => (nilai === "" ? null : nilai))
  .pipe(z.iso.date({ error: "berlaku_mulai harus TTTT-BB-HH atau kosong" }).nullable());

export const barisBiayaSchema = z
  .object({
    jenis: z.enum(["pemakaman", "berkas"], { error: 'jenis harus "pemakaman" atau "berkas"' }),
    jumlah_rupiah: rupiah("jumlah_rupiah"),
    berlaku_mulai: berlakuMulai,
  })
  .transform((baris) => ({
    kunci: baris.jenis === "pemakaman" ? ("biaya_pengurusan_pemakaman" as const) : ("biaya_pengurusan_berkas" as const),
    jenis: baris.jenis,
    jumlah: baris.jumlah_rupiah,
    berlakuMulai: baris.berlaku_mulai,
  }));

export type BarisBiaya = z.output<typeof barisBiayaSchema>;

export const barisLayananSchema = z
  .object({
    layanan: z.string().min(1, "layanan wajib"),
    varian: z.string().min(1, "varian wajib"),
    harga_dki_rupiah: rupiah("harga_dki_rupiah"),
    tarif_mitra_jasa_rupiah: rupiah("tarif_mitra_jasa_rupiah"),
    berlaku_mulai: berlakuMulai,
  })
  .transform((baris) => ({
    layanan: baris.layanan,
    varian: baris.varian,
    hargaDki: baris.harga_dki_rupiah,
    tarifMitraJasa: baris.tarif_mitra_jasa_rupiah,
    berlakuMulai: baris.berlaku_mulai,
  }));

export type BarisLayanan = z.output<typeof barisLayananSchema>;
