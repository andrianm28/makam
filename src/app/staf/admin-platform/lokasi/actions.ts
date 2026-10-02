"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { lokasiMitraResource, semuaLokasiMitraResource, type Action, type Actor } from "@/domain/identity";
import {
  AGREEMENT_SCAN_MAX_BYTES,
  type ActivateTerencanaResult,
  type ChangeBankAccountResult,
  type CreateLokasiMitraResult,
  type HentikanResult,
  type UbahStatusResult,
  type InviteAdminLokasiResult,
  type PublishLokasiMitraResult,
  type RemoveAdminLokasiFromLokasiResult,
  type SetPoliciesResult,
  type UpdateProfileResult,
  type UploadAgreementResult,
} from "@/domain/lokasi";
import { hentikanLokasiMitra } from "@/composition/berhenti";
import type { Fitur } from "@/lib/rilis";
import { guarded } from "@/server/guard";
import { phoneNumberInput } from "@/server/phone-number-input";
import { phoneNumberRefusals } from "@/server/phone-number-messages";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../form-state";
import { guardMessage } from "../../messages";

type Refused<T> = T extends { ok: false; reason: infer R } ? R : never;

/** Every reason a Lokasi write can be refused for. */
type LokasiRefusal = Refused<
  | CreateLokasiMitraResult
  | UpdateProfileResult
  | SetPoliciesResult
  | ChangeBankAccountResult
  | UploadAgreementResult
  | InviteAdminLokasiResult
  | RemoveAdminLokasiFromLokasiResult
  | PublishLokasiMitraResult
  | ActivateTerencanaResult
  | UbahStatusResult
  | HentikanResult
>;

/** What each refusal says on screen, in Bahasa Indonesia: the one map every Lokasi form uses. */
const refusalMessages: Record<LokasiRefusal, string> = {
  tidak_berwenang: guardMessage("tidak_berwenang"),
  perlu_totp: guardMessage("perlu_totp"),
  tidak_ditemukan: "Lokasi Mitra ini tidak ditemukan.",
  profil_tidak_valid: "Periksa lagi profilnya: nama, alamat dan kota wajib, dan pin harus di Indonesia.",
  kebijakan_tidak_valid:
    "Nilai kebijakan di luar batas: periksa lagi (K minimal 1, refund 0–100%, tumpang minimal 2 lapis).",
  terencana_belum_tersedia: "Pemesanan Terencana belum bisa diaktifkan. Tersedia setelah Denah dan Cek Denah.",
  rekening_tidak_valid: "Isi bank, nomor rekening (angka saja) dan nama pemilik rekening.",
  berkas_tidak_didukung: "Scan perjanjian harus PDF, JPG atau PNG (isi berkas diperiksa), paling besar 10 MB.",
  tanggal_tidak_valid: "Isi tanggal perjanjian.",
  berkas_gagal_disimpan: "Scan tidak bisa disimpan. Penyimpanan berkas sedang bermasalah, coba lagi. Data perjanjian belum berubah.",
  email_wajib: "Email wajib diisi untuk setiap staf.",
  email_tidak_valid: "Email tidak valid.",
  lokasi_wajib: "Pilih Lokasi Mitra untuk Admin Lokasi ini.",
  ...phoneNumberRefusals,
  alasan_wajib: "Tulis alasannya.",
  bukan_admin_lokasi_di_sini: "Akun ini bukan Admin Lokasi di Lokasi Mitra ini.",
  gerbang_belum_terpenuhi: "Belum bisa: syarat di atas belum semuanya terpenuhi.",
  status_tidak_bisa_diterbitkan: "Lokasi Mitra ini sudah tidak Belum Tayang: statusnya tidak bisa diterbitkan lewat sini.",
  status_tidak_cocok: "Status Lokasi Mitra ini sudah berubah: muat ulang halaman ini.",
  tanggal_lampau: "Tanggal berlaku Berhenti tidak boleh sudah lewat.",
  data_contoh_tidak_bisa_diterbitkan:
    "Lokasi Mitra ini ditandai sebagai data contoh, jadi tidak pernah bisa diterbitkan.",
};

type LokasiWriteResult = { ok: true } | { ok: false; reason: LokasiRefusal };

/**
 * One Admin Platform form on a Lokasi Mitra's page: `guarded()` (the actor,
 * `action` on the Lokasi the form names, `schema`), then the Lokasi module.
 * The page it revalidates is the parsed Lokasi's.
 */
async function lokasiWrite<S extends z.ZodType<{ lokasiId: string }>, R extends LokasiWriteResult>(options: {
  action: Action;
  schema: S;
  input: { lokasiId: FormDataEntryValue | null } & Record<string, unknown>;
  run: (actor: Actor, data: z.infer<S>) => Promise<R>;
  saved: string | ((written: Extract<R, { ok: true }>) => string);
  invalidInput?: string;
  /** The release the write belongs to (ADR 0006); closed, it answers 404. */
  fitur?: Fitur;
}): Promise<FormState> {
  const { input } = options;
  const result = await guarded({
    fitur: options.fitur ?? "inti",
    action: options.action,
    resource: () => lokasiMitraResource(typeof input.lokasiId === "string" ? input.lokasiId : ""),
    schema: options.schema,
    input,
    run: async (actor, data) => ({ lokasiId: data.lokasiId, written: await options.run(actor, data) }),
  });
  if (!result.ok) {
    const message = result.error === "input_tidak_valid" && options.invalidInput ? options.invalidInput : guardMessage(result.error);
    return { status: "gagal", message };
  }
  const { lokasiId, written } = result.value;
  if (!written.ok) return { status: "gagal", message: refusalMessages[written.reason] };
  revalidatePath(`/staf/admin-platform/lokasi/${lokasiId}`);
  const message = typeof options.saved === "string" ? options.saved : options.saved(written as Extract<R, { ok: true }>);
  return { status: "berhasil", message };
}

const lokasiId = z.uuid();
const text = (max: number) => z.string().trim().min(1).max(max);
/** A whole number typed in a form field. */
const count = z.coerce.number().int();
/** A checkbox: present when ticked. */
const checkbox = z.literal("ya").optional().transform((value) => value === "ya");

const createSchema = z.object({
  name: text(200),
  pengelolaName: text(200),
  address: text(500),
  city: text(120),
});

/** Admin Platform starts a Lokasi Mitra's onboarding record, then opens it. */
export async function buatLokasiMitra(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
    fitur: "inti",
    action: "lokasi.buat",
    resource: () => semuaLokasiMitraResource(),
    schema: createSchema,
    input: {
      name: formData.get("name"),
      pengelolaName: formData.get("pengelolaName"),
      address: formData.get("address"),
      city: formData.get("city"),
    },
    run: (actor, data) => serverRuntime().lokasi.createLokasiMitra(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  if (!result.value.ok) return { status: "gagal", message: refusalMessages[result.value.reason] };
  revalidatePath("/staf/admin-platform/lokasi");
  redirect(`/staf/admin-platform/lokasi/${result.value.lokasiMitra.id}`);
}

const optionalCoordinate = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : Number(value.replace(",", "."))))
  .pipe(z.number().finite().nullable());

const profileSchema = z.object({
  lokasiId,
  name: text(200),
  pengelolaName: text(200),
  // Blank clears; the module normalises the phone to +62 and refuses a non-Indonesian-mobile number.
  pengelolaTelepon: z.string().trim().max(30),
  pengelolaEmail: z.string().trim().pipe(z.union([z.literal(""), z.email().max(200)])),
  address: text(500),
  city: text(120),
  pinLat: optionalCoordinate,
  pinLng: optionalCoordinate,
  facilities: z.array(z.string().max(40)).max(20),
  facilitiesNote: z.string().trim().max(1000),
});

/** Admin Platform records the profile: name, pengelola, address, city, pin, facilities. */
export async function simpanProfil(_previous: FormState, formData: FormData): Promise<FormState> {
  return lokasiWrite({
    action: "lokasi.ubah",
    schema: profileSchema,
    input: {
      lokasiId: formData.get("lokasiId"),
      name: formData.get("name"),
      pengelolaName: formData.get("pengelolaName"),
      pengelolaTelepon: formData.get("pengelolaTelepon") ?? "",
      pengelolaEmail: formData.get("pengelolaEmail") ?? "",
      address: formData.get("address"),
      city: formData.get("city"),
      pinLat: formData.get("pinLat") ?? "",
      pinLng: formData.get("pinLng") ?? "",
      facilities: formData.getAll("facilities"),
      facilitiesNote: formData.get("facilitiesNote") ?? "",
    },
    run: (actor, data) =>
      serverRuntime().lokasi.updateProfile(actor, data.lokasiId, {
        name: data.name,
        pengelolaName: data.pengelolaName,
        pengelolaTelepon: data.pengelolaTelepon,
        pengelolaEmail: data.pengelolaEmail,
        address: data.address,
        city: data.city,
        pin: data.pinLat !== null && data.pinLng !== null ? { lat: data.pinLat, lng: data.pinLng } : null,
        facilities: { checked: data.facilities, note: data.facilitiesNote },
      }),
    saved: "Profil tersimpan.",
  });
}

const documentsSchema = z.object({ lokasiId, documents: z.string().max(4000) });

/** Admin Platform replaces the document checklist (one document per line). */
export async function simpanDokumen(_previous: FormState, formData: FormData): Promise<FormState> {
  return lokasiWrite({
    action: "lokasi.ubah",
    schema: documentsSchema,
    input: { lokasiId: formData.get("lokasiId"), documents: formData.get("documents") },
    run: (actor, data) =>
      serverRuntime().lokasi.setDocumentChecklist(actor, data.lokasiId, { documentChecklist: data.documents.split(/\r?\n/) }),
    saved: "Daftar dokumen tersimpan.",
  });
}

const policiesSchema = z.object({
  lokasiId,
  masaTenggangMonths: count,
  maxPerpanjanganTerms: count,
  terencanaHoldHours: count,
  saatDukaPaymentWindowHours: count,
  masaPembatalanDays: count,
  refundAfterMasaPembatalanPercent: count,
  gantiPemegangHakFee: count,
  pemesananTerencanaAktif: checkbox,
  tumpangAllowed: checkbox,
  tumpangMinYears: count,
  tumpangMaxLayers: count,
  tumpangOnReleasedPlots: checkbox,
  saleTransfersAllowed: checkbox,
});

/** Admin Platform sets the policies and flags. */
export async function simpanKebijakan(_previous: FormState, formData: FormData): Promise<FormState> {
  const field = (name: string) => formData.get(name) ?? undefined;
  return lokasiWrite({
    action: "lokasi.ubah",
    schema: policiesSchema,
    input: {
      ...Object.fromEntries(Object.keys(policiesSchema.shape).map((name) => [name, field(name)])),
      lokasiId: formData.get("lokasiId"),
    },
    run: (actor, data) =>
      serverRuntime().lokasi.setPoliciesAndFlags(actor, data.lokasiId, {
        policies: {
          masaTenggangMonths: data.masaTenggangMonths,
          maxPerpanjanganTerms: data.maxPerpanjanganTerms,
          terencanaHoldHours: data.terencanaHoldHours,
          saatDukaPaymentWindowHours: data.saatDukaPaymentWindowHours,
          masaPembatalanDays: data.masaPembatalanDays,
          refundAfterMasaPembatalanPercent: data.refundAfterMasaPembatalanPercent,
          gantiPemegangHakFee: data.gantiPemegangHakFee,
        },
        flags: {
          pemesananTerencanaAktif: data.pemesananTerencanaAktif,
          tumpang: { allowed: data.tumpangAllowed, minYears: data.tumpangMinYears, maxLayers: data.tumpangMaxLayers },
          tumpangOnReleasedPlots: data.tumpangOnReleasedPlots,
          saleTransfersAllowed: data.saleTransfersAllowed,
        },
      }),
    saved: "Kebijakan tersimpan.",
  });
}

const bankSchema = z.object({
  lokasiId,
  bankName: text(100),
  accountNumber: text(40),
  accountHolder: text(200),
  reason: z.string().trim().max(500),
});

/** Admin Platform (only) sets or changes the bank account. */
export async function simpanRekening(_previous: FormState, formData: FormData): Promise<FormState> {
  return lokasiWrite({
    action: "lokasi.ubah_rekening",
    schema: bankSchema,
    input: {
      lokasiId: formData.get("lokasiId"),
      bankName: formData.get("bankName"),
      accountNumber: formData.get("accountNumber"),
      accountHolder: formData.get("accountHolder"),
      reason: formData.get("reason") ?? "",
    },
    run: (actor, data) =>
      serverRuntime().lokasi.changeBankAccount(actor, data.lokasiId, {
        bankName: data.bankName,
        accountNumber: data.accountNumber,
        accountHolder: data.accountHolder,
        reason: data.reason || null,
      }),
    saved: "Rekening tersimpan.",
  });
}

const agreementSchema = z.object({
  lokasiId,
  scan: z.instanceof(File).refine((file) => file.size <= AGREEMENT_SCAN_MAX_BYTES),
  signedOn: z.string().trim().max(10),
});

/** Admin Platform uploads the agreement scan (FileStore) with its signing date. */
export async function unggahPerjanjian(_previous: FormState, formData: FormData): Promise<FormState> {
  return lokasiWrite({
    action: "lokasi.ubah",
    schema: agreementSchema,
    input: { lokasiId: formData.get("lokasiId"), scan: formData.get("scan"), signedOn: formData.get("signedOn") },
    run: async (actor, data) =>
      serverRuntime().lokasi.uploadAgreement(actor, data.lokasiId, {
        scan: { body: new Uint8Array(await data.scan.arrayBuffer()), contentType: data.scan.type },
        signedOn: data.signedOn,
      }),
    saved: "Scan perjanjian tersimpan.",
    invalidInput: "Periksa lagi isian Anda. Scan paling besar 10 MB.",
  });
}

const inviteSchema = z.object({
  lokasiId,
  // Empty is let through: the identity module refuses a missing email (email_wajib) with its own message.
  email: z.string().trim().max(254),
  phoneNumber: phoneNumberInput,
  reason: z.string().trim().max(500),
});

/** Admin Platform (only) invites an Admin Lokasi to this Lokasi Mitra. */
export async function undangAdminLokasi(_previous: FormState, formData: FormData): Promise<FormState> {
  return lokasiWrite({
    action: "lokasi.atur_admin_lokasi",
    schema: inviteSchema,
    input: {
      lokasiId: formData.get("lokasiId"),
      email: formData.get("email"),
      phoneNumber: formData.get("phoneNumber"),
      reason: formData.get("reason") ?? "",
    },
    run: (actor, data) =>
      serverRuntime().lokasi.inviteAdminLokasi(actor, data.lokasiId, {
        email: data.email,
        phoneNumber: data.phoneNumber,
        reason: data.reason || null,
      }),
    saved: ({ invite, delivered }) =>
      delivered
        ? `Undangan Admin Lokasi terkirim ke ${invite.email}. Berlaku 7 hari: minta ia masuk lewat /masuk dengan email itu.`
        : `Undangan Admin Lokasi untuk ${invite.email} tercatat, tetapi emailnya gagal terkirim. Minta ia masuk lewat /masuk dengan email itu dalam 7 hari.`,
  });
}

const targetSchema = z.object({ lokasiId });

/**
 * Admin Platform publishes the Lokasi Mitra (Belum Tayang → Terverifikasi),
 * only once every publish-gate item is met. Composes the Tariffs module's own
 * "tarif diperiksa" mark (the one fact the Lokasi module does not own) and
 * hands it to `lokasi.publish`, which re-checks every item for real.
 */
export async function terbitkanLokasiMitra(_previous: FormState, formData: FormData): Promise<FormState> {
  return lokasiWrite({
    action: "lokasi.terbitkan",
    schema: targetSchema,
    input: { lokasiId: formData.get("lokasiId") },
    run: async (actor, data) => {
      const { lokasi, tariffs } = serverRuntime();
      const tariffsChecked = await tariffs.asStaff(actor).tariffsChecked(data.lokasiId);
      return lokasi.publish(actor, data.lokasiId, {
        tariffsChecked: tariffsChecked && { changedSinceCheck: tariffsChecked.changedSinceCheck },
      });
    },
    saved: "Lokasi Mitra ini sekarang Terverifikasi dan tampil di Daftar Lokasi.",
  });
}

/**
 * Admin Platform switches "Pemesanan Terencana aktif" on, only once every
 * Petak is cleared and a Cek Denah is done. Composes the Inventory module's
 * own "Perlu Verifikasi Petak" fact and hands it to `lokasi.activateTerencana`.
 */
export async function aktifkanTerencana(_previous: FormState, formData: FormData): Promise<FormState> {
  return lokasiWrite({
    action: "lokasi.aktifkan_terencana",
    schema: targetSchema,
    input: { lokasiId: formData.get("lokasiId") },
    run: async (actor, data) => {
      const { lokasi, inventory } = serverRuntime();
      const hasPetakPerluVerifikasi = await inventory.hasPetakPerluVerifikasi(data.lokasiId);
      return lokasi.activateTerencana(actor, data.lokasiId, { hasPetakPerluVerifikasi });
    },
    saved: "Pemesanan Terencana aktif untuk Lokasi Mitra ini.",
  });
}

const removeSchema = z.object({ lokasiId, accountId: z.string().min(1).max(64), reason: z.string().trim().max(500) });

/** Admin Platform (only) removes an Admin Lokasi from this Lokasi Mitra. */
export async function lepasAdminLokasi(_previous: FormState, formData: FormData): Promise<FormState> {
  return lokasiWrite({
    action: "lokasi.atur_admin_lokasi",
    schema: removeSchema,
    input: { lokasiId: formData.get("lokasiId"), accountId: formData.get("accountId"), reason: formData.get("reason") },
    run: (actor, data) =>
      serverRuntime().lokasi.removeAdminLokasi(actor, data.lokasiId, { accountId: data.accountId, reason: data.reason }),
    saved: "Admin Lokasi dilepas dari Lokasi Mitra ini.",
  });
}

const statusSchema = z.object({ lokasiId, alasan: text(500) });
const hentikanSchema = z.object({
  lokasiId,
  alasan: text(500),
  berlakuOn: z.union([z.literal(""), z.iso.date()]).transform((value) => (value === "" ? undefined : value)),
});
const ALASAN_WAJIB = "Tulis alasannya, untuk Audit Log.";

/** Admin Platform sets a Terverifikasi Lokasi Mitra Ditangguhkan, with a reason: it takes no new Hak Pakai, the rest carries on. */
export async function tangguhkanLokasi(_previous: FormState, formData: FormData): Promise<FormState> {
  return lokasiWrite({
    fitur: "lokasi_ditangguhkan",
    action: "lokasi.ubah_status",
    schema: statusSchema,
    input: { lokasiId: formData.get("lokasiId"), alasan: formData.get("alasan") },
    run: (actor, data) => serverRuntime().lokasi.tangguhkan(actor, data.lokasiId, { alasan: data.alasan }),
    saved: "Lokasi Mitra ini Ditangguhkan: tidak menerima pesanan baru, pekerjaan yang berjalan dilanjutkan.",
    invalidInput: ALASAN_WAJIB,
  });
}

/** Admin Platform reinstates a Ditangguhkan Lokasi Mitra, with a reason. */
export async function pulihkanLokasi(_previous: FormState, formData: FormData): Promise<FormState> {
  return lokasiWrite({
    fitur: "lokasi_ditangguhkan",
    action: "lokasi.ubah_status",
    schema: statusSchema,
    input: { lokasiId: formData.get("lokasiId"), alasan: formData.get("alasan") },
    run: (actor, data) => serverRuntime().lokasi.pulihkan(actor, data.lokasiId, { alasan: data.alasan }),
    saved: "Lokasi Mitra ini dipulihkan: kembali Terverifikasi.",
    invalidInput: ALASAN_WAJIB,
  });
}

/** Admin Platform ends the partnership (Berhenti) with a reason and an effective date (default 30 days on); the families are told. */
export async function hentikanLokasi(_previous: FormState, formData: FormData): Promise<FormState> {
  return lokasiWrite({
    fitur: "lokasi_ditangguhkan",
    action: "lokasi.ubah_status",
    schema: hentikanSchema,
    input: { lokasiId: formData.get("lokasiId"), alasan: formData.get("alasan"), berlakuOn: formData.get("berlakuOn") ?? "" },
    run: (actor, data) => {
      const { database, lokasi, pemesanan, layanan, notifications } = serverRuntime();
      return hentikanLokasiMitra({ db: database.db, lokasi, pemesanan, layanan, notifications }, actor, data.lokasiId, { alasan: data.alasan, berlakuOn: data.berlakuOn });
    },
    saved: (hasil) => `Lokasi Mitra ini Berhenti, berlaku ${hasil.berlakuOn}. Keluarga yang punya pesanan di sini sudah diberi tahu.`,
    invalidInput: "Tulis alasannya dan isi tanggal berlaku dengan benar (kosong = 30 hari dari sekarang).",
  });
}
