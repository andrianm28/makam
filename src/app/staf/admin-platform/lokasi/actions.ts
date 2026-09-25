"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { lokasiMitraResource, semuaLokasiMitraResource } from "@/domain/identity";
import { AGREEMENT_SCAN_MAX_BYTES } from "@/domain/lokasi";
import { guarded } from "@/server/guard";
import { phoneNumberInput } from "@/server/phone-number-input";
import { phoneNumberRefusals } from "@/server/phone-number-messages";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../form-state";
import { guardMessage } from "../../messages";

/** The Lokasi Mitra a form is about, for the authorisation check (validated again by each schema). */
function lokasiIdOf(formData: FormData): string {
  const value = formData.get("lokasiId");
  return typeof value === "string" ? value : "";
}

const lokasiId = z.uuid();
const text = (max: number) => z.string().trim().min(1).max(max);
/** A whole number typed in a form field. */
const count = z.coerce.number().int();
/** A checkbox: present when ticked. */
const checkbox = z.literal("ya").optional().transform((value) => value === "ya");

/** Refusals every Lokasi write can give, in Bahasa Indonesia. */
function commonRefusal(reason: string): string {
  switch (reason) {
    case "tidak_ditemukan":
      return "Lokasi Mitra ini tidak ditemukan.";
    case "perlu_totp":
      return guardMessage("perlu_totp");
    case "tidak_berwenang":
      return guardMessage("tidak_berwenang");
    default:
      return "Periksa lagi isian Anda.";
  }
}

function saved(id: string, message: string): FormState {
  revalidatePath(`/staf/admin-platform/lokasi/${id}`);
  return { status: "berhasil", message };
}

const createSchema = z.object({
  name: text(200),
  pengelolaName: text(200),
  address: text(500),
  city: text(120),
});

/** Admin Platform starts a Lokasi Mitra's onboarding record, then opens it. */
export async function buatLokasiMitra(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
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
  if (!result.value.ok) return { status: "gagal", message: commonRefusal(result.value.reason) };
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
  address: text(500),
  city: text(120),
  pinLat: optionalCoordinate,
  pinLng: optionalCoordinate,
  facilities: z.array(z.string().max(40)).max(20),
  facilitiesNote: z.string().trim().max(1000),
});

/** Admin Platform records the profile: name, pengelola, address, city, pin, facilities. */
export async function simpanProfil(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
    action: "lokasi.ubah",
    resource: () => lokasiMitraResource(lokasiIdOf(formData)),
    schema: profileSchema,
    input: {
      lokasiId: formData.get("lokasiId"),
      name: formData.get("name"),
      pengelolaName: formData.get("pengelolaName"),
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
        address: data.address,
        city: data.city,
        pin: data.pinLat !== null && data.pinLng !== null ? { lat: data.pinLat, lng: data.pinLng } : null,
        facilities: { checked: data.facilities, note: data.facilitiesNote },
      }),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  const updated = result.value;
  if (!updated.ok) {
    return {
      status: "gagal",
      message:
        updated.reason === "profil_tidak_valid"
          ? "Periksa lagi profilnya: nama, alamat dan kota wajib, dan pin harus di Indonesia."
          : commonRefusal(updated.reason),
    };
  }
  return saved(lokasiIdOf(formData), "Profil tersimpan.");
}

const documentsSchema = z.object({ lokasiId, documents: z.string().max(4000) });

/** Admin Platform replaces the document checklist (one document per line). */
export async function simpanDokumen(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
    action: "lokasi.ubah",
    resource: () => lokasiMitraResource(lokasiIdOf(formData)),
    schema: documentsSchema,
    input: { lokasiId: formData.get("lokasiId"), documents: formData.get("documents") },
    run: (actor, data) =>
      serverRuntime().lokasi.setDocumentChecklist(actor, data.lokasiId, { documentChecklist: data.documents.split(/\r?\n/) }),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  if (!result.value.ok) return { status: "gagal", message: commonRefusal(result.value.reason) };
  return saved(lokasiIdOf(formData), "Daftar dokumen tersimpan.");
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
  const result = await guarded({
    action: "lokasi.ubah",
    resource: () => lokasiMitraResource(lokasiIdOf(formData)),
    schema: policiesSchema,
    input: Object.fromEntries(Object.keys(policiesSchema.shape).map((name) => [name, field(name)])),
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
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  const updated = result.value;
  if (!updated.ok) {
    return {
      status: "gagal",
      message:
        updated.reason === "kebijakan_tidak_valid"
          ? "Nilai kebijakan di luar batas: periksa lagi (K minimal 1, refund 0–100%, tumpang minimal 2 lapis)."
          : commonRefusal(updated.reason),
    };
  }
  return saved(lokasiIdOf(formData), "Kebijakan tersimpan.");
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
  const result = await guarded({
    action: "lokasi.ubah_rekening",
    resource: () => lokasiMitraResource(lokasiIdOf(formData)),
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
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  const updated = result.value;
  if (!updated.ok) {
    return {
      status: "gagal",
      message:
        updated.reason === "rekening_tidak_valid"
          ? "Isi bank, nomor rekening (angka saja) dan nama pemilik rekening."
          : commonRefusal(updated.reason),
    };
  }
  return saved(lokasiIdOf(formData), "Rekening tersimpan.");
}

const agreementSchema = z.object({
  lokasiId,
  scan: z.instanceof(File).refine((file) => file.size <= AGREEMENT_SCAN_MAX_BYTES),
  signedOn: z.string().trim().max(10),
});

/** Admin Platform uploads the agreement scan (FileStore) with its signing date. */
export async function unggahPerjanjian(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
    action: "lokasi.ubah",
    resource: () => lokasiMitraResource(lokasiIdOf(formData)),
    schema: agreementSchema,
    input: { lokasiId: formData.get("lokasiId"), scan: formData.get("scan"), signedOn: formData.get("signedOn") },
    run: async (actor, data) =>
      serverRuntime().lokasi.uploadAgreement(actor, data.lokasiId, {
        scan: { body: new Uint8Array(await data.scan.arrayBuffer()), contentType: data.scan.type },
        signedOn: data.signedOn,
      }),
  });
  if (!result.ok) {
    return {
      status: "gagal",
      message: result.error === "input_tidak_valid" ? "Periksa lagi isian Anda. Scan paling besar 10 MB." : guardMessage(result.error),
    };
  }
  const uploaded = result.value;
  if (!uploaded.ok) {
    const messages: Record<string, string> = {
      berkas_tidak_didukung: "Scan perjanjian harus PDF, JPG atau PNG (isi berkas diperiksa), paling besar 10 MB.",
      tanggal_tidak_valid: "Isi tanggal perjanjian.",
      berkas_gagal_disimpan:
        "Scan tidak bisa disimpan: penyimpanan berkas belum tersedia di lingkungan ini (menunggu S3, tiket 60). Data perjanjian belum berubah.",
    };
    return { status: "gagal", message: messages[uploaded.reason] ?? commonRefusal(uploaded.reason) };
  }
  return saved(lokasiIdOf(formData), "Scan perjanjian tersimpan.");
}

const inviteSchema = z.object({
  lokasiId,
  phoneNumber: phoneNumberInput,
  // Empty is let through: the identity module refuses a missing email (email_wajib) with its own message.
  email: z.string().trim().max(254),
  reason: z.string().trim().max(500),
});

/** Admin Platform (only) invites an Admin Lokasi to this Lokasi Mitra. */
export async function undangAdminLokasi(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
    action: "lokasi.atur_admin_lokasi",
    resource: () => lokasiMitraResource(lokasiIdOf(formData)),
    schema: inviteSchema,
    input: {
      lokasiId: formData.get("lokasiId"),
      phoneNumber: formData.get("phoneNumber"),
      email: formData.get("email"),
      reason: formData.get("reason") ?? "",
    },
    run: (actor, data) =>
      serverRuntime().lokasi.inviteAdminLokasi(actor, data.lokasiId, {
        phoneNumber: data.phoneNumber,
        email: data.email,
        reason: data.reason || null,
      }),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  const invited = result.value;
  if (!invited.ok) {
    switch (invited.reason) {
      case "email_wajib":
        return { status: "gagal", message: "Email wajib diisi untuk setiap staf." };
      case "email_tidak_valid":
        return { status: "gagal", message: "Email tidak valid." };
      case "nomor_tidak_valid":
      case "nomor_bukan_indonesia":
        return { status: "gagal", message: phoneNumberRefusals[invited.reason] };
      default:
        return { status: "gagal", message: commonRefusal(invited.reason) };
    }
  }
  const to = invited.invite.phoneNumber;
  return saved(
    lokasiIdOf(formData),
    invited.delivered
      ? `Undangan Admin Lokasi terkirim ke ${to}. Berlaku 7 hari: minta ia masuk lewat /masuk dengan nomor itu.`
      : `Undangan Admin Lokasi untuk ${to} tercatat, tetapi pesan WhatsApp gagal terkirim. Minta ia masuk lewat /masuk dengan nomor itu dalam 7 hari.`,
  );
}

const removeSchema = z.object({ lokasiId, accountId: z.string().min(1).max(64), reason: z.string().trim().max(500) });

/** Admin Platform (only) removes an Admin Lokasi from this Lokasi Mitra. */
export async function lepasAdminLokasi(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
    action: "lokasi.atur_admin_lokasi",
    resource: () => lokasiMitraResource(lokasiIdOf(formData)),
    schema: removeSchema,
    input: { lokasiId: formData.get("lokasiId"), accountId: formData.get("accountId"), reason: formData.get("reason") },
    run: (actor, data) =>
      serverRuntime().lokasi.removeAdminLokasi(actor, data.lokasiId, { accountId: data.accountId, reason: data.reason }),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  const removed = result.value;
  if (!removed.ok) {
    const messages: Record<string, string> = {
      alasan_wajib: "Tulis alasannya.",
      bukan_admin_lokasi_di_sini: "Akun ini bukan Admin Lokasi di Lokasi Mitra ini.",
    };
    return { status: "gagal", message: messages[removed.reason] ?? commonRefusal(removed.reason) };
  }
  return saved(lokasiIdOf(formData), "Admin Lokasi dilepas dari Lokasi Mitra ini.");
}
