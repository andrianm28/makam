/**
 * The Mitra Jasa's input schemas, in one file that imports nothing but `zod` and
 * this module's own schema types.
 *
 * That is deliberate: a `"use client"` component takes these from here, never from
 * the module's barrel (a client component must not reach the database, and a
 * barrel builds its public object from the functions that do), and a file that
 * depends on nothing but `zod` cannot drag `pg` in with it. The rules themselves —
 * the bank-name override, the NIK, the range — are the domain's; these only say
 * what a form may send.
 */
import { z } from "zod";
import { mitraJasaStatuses } from "./schema";

const nik = z.string().trim().regex(/^[0-9]{16}$/, "NIK harus 16 angka");
/** An optional free text: a form sends "" for a field left blank, a caller may send null. */
const teksOpsional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));
const tanggalWib = z.string().trim().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/, "Tanggal harus format YYYY-MM-DD");

/**
 * A Mitra Jasa's profile, as Admin Platform types it. `npwp` is deliberately not
 * a field (spec: "no NPWP"): the schema is strict, so a payload carrying one is
 * refused rather than quietly dropped, and no column could hold it either.
 */
export const profilMitraJasaSchema = z
  .object({
    namaLengkap: z.string().trim().min(1).max(160),
    nik,
    area: z.string().trim().min(1).max(160),
    kontakSiagaNama: teksOpsional(160),
    kontakSiagaTelepon: z
      .string()
      .trim()
      .regex(/^(\+62|0)?[0-9]{8,14}$/, "Nomor kontak siaga harus 8 sampai 14 angka")
      .nullish()
      .transform((value) => (value ? value : null))
      .optional(),
  })
  .strict();
export type ProfilMitraJasaInput = z.infer<typeof profilMitraJasaSchema>;

/** The bank account Pencairan go to, with the override note its name rule needs. */
export const rekeningMitraJasaSchema = z
  .object({
    bankName: z.string().trim().min(1).max(80),
    accountNumber: z.string().trim().regex(/^[0-9]{5,20}$/, "Nomor rekening harus 5 sampai 20 angka"),
    accountHolder: z.string().trim().min(1).max(160),
    catatanOverride: teksOpsional(500),
  })
  .strict();
export type RekeningMitraJasaInput = z.infer<typeof rekeningMitraJasaSchema>;

/** One of a Mitra Jasa's three files: the KTP photo, their photo, or the signed arrangement scan. */
export const berkasMitraJasaSchema = z
  .object({
    jenis: z.enum(["ktp", "foto", "perjanjian"]),
    file: z.object({ body: z.instanceof(Uint8Array), contentType: z.string().trim().max(100) }),
    /** Only the arrangement: the date it was signed. */
    signedOn: z
      .string()
      .trim()
      .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/, "Tanggal harus format YYYY-MM-DD")
      .optional(),
    reason: teksOpsional(500).optional(),
  })
  .strict();
export type BerkasMitraJasaInput = z.infer<typeof berkasMitraJasaSchema>;

/** Which DKI TPUs and which Layanan variants a Mitra Jasa covers; both lists replaced whole. */
export const coverageMitraJasaSchema = z
  .object({
    tpuDkiIds: z.array(z.string().uuid()).max(50),
    layananVariantIds: z.array(z.string().uuid()).max(100),
  })
  .strict();
export type CoverageMitraJasaInput = z.infer<typeof coverageMitraJasaSchema>;

/** A status with the reason it needs: a suspension or an ending is never without one. */
export const statusMitraJasaSchema = z
  .object({
    status: z.enum(mitraJasaStatuses),
    alasan: teksOpsional(500),
  })
  .strict();
export type StatusMitraJasaInput = z.infer<typeof statusMitraJasaSchema>;

/** One "Tidak tersedia" range: WIB calendar dates, inclusive on both ends. */
export const tidakTersediaSchema = z
  .object({ dari: tanggalWib, sampai: tanggalWib, alasan: teksOpsional(500) })
  .strict();
export type TidakTersediaInput = z.infer<typeof tidakTersediaSchema>;

/** The needs of one TPU job, as the assignment picker (ticket 56) states them. */
export const kebutuhanPenugasanSchema = z
  .object({
    tpuDkiId: z.string().uuid(),
    layananVariantId: z.string().uuid(),
    tanggal: tanggalWib,
  })
  .strict();
export type KebutuhanPenugasan = z.infer<typeof kebutuhanPenugasanSchema>;
