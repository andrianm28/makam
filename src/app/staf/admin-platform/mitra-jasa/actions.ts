"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mulaiOnboardingMitraJasa } from "@/composition/mitra-jasa";
import { akunResource, mitraJasaResource, semuaMitraJasaResource } from "@/domain/identity";
import {
  berkasMitraJasaSchema,
  coverageMitraJasaSchema,
  profilMitraJasaSchema,
  rekeningMitraJasaSchema,
  statusMitraJasaSchema,
  tidakTersediaSchema,
} from "@/domain/layanan";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../form-state";
import { guardMessage } from "../../messages";

/**
 * The Mitra Jasa's Server Actions: Admin Platform's onboarding, the profile, the
 * coverage lists, the bank account, the three files and the status, plus the two
 * a Mitra Jasa owns themselves ("Tidak tersedia") and the monthly review note.
 *
 * Each is `guarded()` — the actor from the session cookie, the action on its
 * resource, the module's own Zod schema — and then the module. Nothing here
 * decides anything: the bank-name rule, the status effects on jobs, the scorecard
 * window and the availability filter all live in `@/domain/layanan`.
 */

const LIST = "/staf/admin-platform/mitra-jasa";
const detail = (mitraJasaId: string) => `${LIST}/${mitraJasaId}`;
const PEKERJAAN = "/staf/mitra-jasa/pekerjaan";

const field = (formData: FormData, name: string) => String(formData.get(name) ?? "");
const lines = (value: string) =>
  value
    .split("\n")
    .map((baris) => baris.trim())
    .filter((baris) => baris !== "");

/** What each refusal says on screen, in Bahasa Indonesia. */
function refusalMessage(reason: string): string {
  switch (reason) {
    case "tidak_berwenang":
    case "perlu_totp":
      return guardMessage(reason);
    case "email_tidak_valid":
      return "Alamat email harus email yang benar: undangan staf dikirim ke alamat itu, dan Akun dengan Email Terverifikasi itulah yang menerimanya.";
    case "mitra_jasa_tidak_valid":
      return "Isi nama lengkap, NIK 16 angka, dan area tempat tinggal.";
    case "sudah_ada":
      return "Sudah ada Mitra Jasa dengan email atau NIK ini.";
    case "tidak_ditemukan":
      return "Mitra Jasa ini tidak ditemukan.";
    case "rekening_tidak_valid":
      return "Rekening tidak bisa disimpan: nama bank, nomor rekening 5–20 angka, dan nama pemilik rekening.";
    case "nama_rekening_tidak_cocok":
      return "Nama pemilik rekening harus sama dengan nama di KTP. Kalau berbeda, isi catatan override.";
    case "berkas_tidak_valid":
      return "Berkas tidak bisa disimpan: pilih gambar atau PDF, dan tanggal perjanjian bila ada.";
    case "berkas_kosong":
      return "Berkasnya kosong. Pilih berkas yang mau diunggah.";
    case "penyimpanan_belum_tersedia":
      return "Berkas tidak bisa disimpan sekarang. Coba lagi sebentar.";
    case "coverage_tidak_valid":
      return "Daftar cakupan tidak valid.";
    case "varian_tidak_dikenal":
      return "Ada Pilihan Layanan yang tidak ada di katalog. Muat ulang halaman dan pilih lagi.";
    case "status_tidak_valid":
      return "Status harus Aktif, Ditangguhkan atau Berhenti.";
    case "alasan_wajib":
      return "Isi alasan saat menangguhkan atau mengakhiri.";
    case "status_sama":
      return "Status Mitra Jasa ini sudah seperti itu.";
    case "pekerjaan_tidak_dilepas":
      return "Pekerjaan yang sudah dijadwalkan belum bisa dilepas, jadi statusnya tidak diubah.";
    case "tidak_tersedia_tidak_valid":
      return "Isi rentang tanggal dengan format YYYY-MM-DD, dan tanggal awal tidak melewati tanggal akhir.";
    case "sudah_tidak_tersedia":
      return "Rentang ini bertabrakan dengan rentang Tidak tersedia yang sudah ada.";
    case "sudah_ditinjau":
      return "Tinjauan bulan ini sudah dicatat.";
    case "nomor_telepon_tidak_valid":
      return "Nomor telepon harus diawali 62 atau 0, lalu 8 sampai 14 angka.";
    default:
      return "Periksa lagi isian Anda.";
  }
}

function refused(reason: string): FormState {
  return { status: "gagal", message: refusalMessage(reason) };
}

/** The Mitra Jasa id the form carries, as a route resource. */
const idOf = (formData: FormData) => field(formData, "mitraJasaId");

/** Admin Platform starts a Mitra Jasa's onboarding record, then invites them to that email (ADR 0004). */
export async function buatMitraJasa(_previous: FormState, formData: FormData): Promise<FormState> {
  const email = field(formData, "email");
  const nomorTelepon = field(formData, "nomorTelepon");
  const result = await guarded({
    fitur: "mitra_jasa",
    action: "mitra_jasa.buat",
    resource: () => semuaMitraJasaResource(),
    schema: z.object({ email: z.string().trim().min(1), nomorTelepon: z.string().trim().min(1), profil: profilMitraJasaSchema }),
    input: {
      email,
      nomorTelepon,
      profil: {
        namaLengkap: field(formData, "namaLengkap"),
        nik: field(formData, "nik"),
        area: field(formData, "area"),
        kontakSiagaNama: field(formData, "kontakSiagaNama"),
        kontakSiagaTelepon: field(formData, "kontakSiagaTelepon"),
      },
    },
    run: async (actor, data) => {
      const runtime = serverRuntime();
      return mulaiOnboardingMitraJasa({ layanan: runtime.layanan, identity: runtime.identity }, actor, data);
    },
  });
  if (!result.ok) return refused(result.error === "input_tidak_valid" ? "mitra_jasa_tidak_valid" : result.error);
  if (!result.value.ok) return refused(result.value.reason);
  revalidatePath(LIST);
  return { status: "berhasil", message: "Mitra Jasa ditambahkan. Undangan staf dikirim ke emailnya: masuk dengan Kode Masuk untuk menerima perannya." };
}

/** Admin Platform records or changes the profile. */
export async function simpanProfil(_previous: FormState, formData: FormData): Promise<FormState> {
  const mitraJasaId = idOf(formData);
  const result = await guarded({
    fitur: "mitra_jasa",
    action: "mitra_jasa.ubah",
    resource: () => mitraJasaResource(mitraJasaId),
    schema: profilMitraJasaSchema,
    input: {
      namaLengkap: field(formData, "namaLengkap"),
      nik: field(formData, "nik"),
      area: field(formData, "area"),
      kontakSiagaNama: field(formData, "kontakSiagaNama"),
      kontakSiagaTelepon: field(formData, "kontakSiagaTelepon"),
    },
    run: (actor, data) => serverRuntime().layanan.ubahProfil(actor, mitraJasaId, data),
  });
  if (!result.ok) return refused(result.error === "input_tidak_valid" ? "mitra_jasa_tidak_valid" : result.error);
  if (!result.value.ok) return refused(result.value.reason);
  revalidatePath(detail(mitraJasaId));
  return { status: "berhasil", message: "Profil Mitra Jasa disimpan." };
}

/** Admin Platform sets the bank account: the name must be the KTP's, or carry an override note. */
export async function simpanRekening(_previous: FormState, formData: FormData): Promise<FormState> {
  const mitraJasaId = idOf(formData);
  const result = await guarded({
    fitur: "mitra_jasa",
    action: "mitra_jasa.ubah",
    resource: () => mitraJasaResource(mitraJasaId),
    schema: rekeningMitraJasaSchema,
    input: {
      bankName: field(formData, "bankName"),
      accountNumber: field(formData, "accountNumber"),
      accountHolder: field(formData, "accountHolder"),
      catatanOverride: field(formData, "catatanOverride"),
    },
    run: (actor, data) => serverRuntime().layanan.ubahRekening(actor, mitraJasaId, data),
  });
  if (!result.ok) return refused(result.error === "input_tidak_valid" ? "rekening_tidak_valid" : result.error);
  if (!result.value.ok) return refused(result.value.reason);
  revalidatePath(detail(mitraJasaId));
  return { status: "berhasil", message: "Rekening Pencairan disimpan." };
}

/** Admin Platform uploads one of the three files: the KTP photo, their photo, or the signed arrangement. */
export async function unggahBerkas(_previous: FormState, formData: FormData): Promise<FormState> {
  const mitraJasaId = idOf(formData);
  const file = formData.get("file");
  const body = file instanceof File ? new Uint8Array(await file.arrayBuffer()) : new Uint8Array();
  const result = await guarded({
    fitur: "mitra_jasa",
    action: "mitra_jasa.ubah",
    resource: () => mitraJasaResource(mitraJasaId),
    schema: berkasMitraJasaSchema,
    input: {
      jenis: field(formData, "jenis"),
      file: { body, contentType: file instanceof File ? file.type : "" },
      signedOn: field(formData, "signedOn") || undefined,
      reason: field(formData, "reason") || undefined,
    },
    run: (actor, data) => serverRuntime().layanan.unggahBerkas(actor, mitraJasaId, data),
  });
  if (!result.ok) return refused(result.error === "input_tidak_valid" ? "berkas_tidak_valid" : result.error);
  if (!result.value.ok) return refused(result.value.reason);
  revalidatePath(detail(mitraJasaId));
  return { status: "berhasil", message: "Berkas tersimpan." };
}

/** Admin Platform sets the coverage lists: which DKI TPUs, which Layanan variants. */
export async function simpanCoverage(_previous: FormState, formData: FormData): Promise<FormState> {
  const mitraJasaId = idOf(formData);
  const result = await guarded({
    fitur: "mitra_jasa",
    action: "mitra_jasa.ubah",
    resource: () => mitraJasaResource(mitraJasaId),
    schema: coverageMitraJasaSchema,
    input: { tpuDkiIds: lines(field(formData, "tpuDkiIds")), layananVariantIds: lines(field(formData, "layananVariantIds")) },
    run: (actor, data) => serverRuntime().layanan.ubahCoverage(actor, mitraJasaId, data),
  });
  if (!result.ok) return refused(result.error === "input_tidak_valid" ? "coverage_tidak_valid" : result.error);
  if (!result.value.ok) return refused(result.value.reason);
  revalidatePath(detail(mitraJasaId));
  return { status: "berhasil", message: "Daftar TPU dan Layanan dilayani disimpan." };
}

/** Admin Platform sets Aktif, Ditangguhan or Berhenti, with the reason. */
export async function simpanStatus(_previous: FormState, formData: FormData): Promise<FormState> {
  const mitraJasaId = idOf(formData);
  const result = await guarded({
    fitur: "mitra_jasa",
    action: "mitra_jasa.ubah",
    resource: () => mitraJasaResource(mitraJasaId),
    schema: statusMitraJasaSchema,
    input: { status: field(formData, "status"), alasan: field(formData, "alasan") },
    run: (actor, data) => serverRuntime().layanan.ubahStatus(actor, mitraJasaId, data),
  });
  if (!result.ok) return refused(result.error === "input_tidak_valid" ? "status_tidak_valid" : result.error);
  if (!result.value.ok) return refused(result.value.reason);
  revalidatePath(detail(mitraJasaId));
  revalidatePath(LIST);
  revalidatePath("/staf/admin-platform/antrean");
  const catatan = [
    result.value.dilepas.length > 0 ? `${result.value.dilepas.length} pekerjaan terjadwal dilepas` : null,
    result.value.berjalan.length > 0 ? `${result.value.berjalan.length} pekerjaan berjalan perlu ditugaskan ulang` : null,
  ].filter((satu) => satu !== null);
  return {
    status: "berhasil",
    message: catatan.length > 0 ? `Status disimpan. ${catatan.join("; ")}.` : "Status Mitra Jasa disimpan.",
  };
}

/** Admin Platform records the monthly scorecard review, which closes that month's row. */
export async function catatTinjauan(_previous: FormState, formData: FormData): Promise<FormState> {
  const mitraJasaId = idOf(formData);
  const result = await guarded({
    fitur: "mitra_jasa",
    action: "mitra_jasa.tinjau_skor",
    resource: () => mitraJasaResource(mitraJasaId),
    schema: z.object({ mitraJasaId: z.string().uuid(), tinjauanId: z.string().uuid(), catatan: z.string().trim().max(500) }),
    input: { mitraJasaId, tinjauanId: field(formData, "tinjauanId"), catatan: field(formData, "catatan") },
    run: (actor, data) =>
      serverRuntime().layanan.catatTinjauan(actor, { mitraJasaId: data.mitraJasaId, tinjauanId: data.tinjauanId, catatan: data.catatan }),
  });
  if (!result.ok) return refused(result.error);
  if (!result.value.ok) return refused(result.value.reason);
  revalidatePath(detail(mitraJasaId));
  revalidatePath("/staf/admin-platform/antrean");
  return { status: "berhasil", message: "Tinjauan skor dicatat." };
}

/** A Mitra Jasa sets one of their own "Tidak tersedia" ranges. */
export async function tambahTidakTersedia(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
    fitur: "mitra_jasa",
    action: "mitra_jasa.tidak_tersedia",
    resource: (actor) => akunResource(actor.accountId),
    schema: tidakTersediaSchema,
    input: { dari: field(formData, "dari"), sampai: field(formData, "sampai"), alasan: field(formData, "alasan") },
    run: (actor, data) => serverRuntime().layanan.tambahTidakTersedia(actor, data),
  });
  if (!result.ok) return refused(result.error === "input_tidak_valid" ? "tidak_tersedia_tidak_valid" : result.error);
  if (!result.value.ok) return refused(result.value.reason);
  revalidatePath(PEKERJAAN);
  return { status: "berhasil", message: "Rentang Tidak tersedia disimpan." };
}

/** A Mitra Jasa takes one of their own ranges off. */
export async function hapusTidakTersedia(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
    fitur: "mitra_jasa",
    action: "mitra_jasa.tidak_tersedia",
    resource: (actor) => akunResource(actor.accountId),
    schema: z.object({ rangeId: z.string().uuid() }),
    input: { rangeId: field(formData, "rangeId") },
    run: (actor, data) => serverRuntime().layanan.hapusTidakTersedia(actor, data.rangeId),
  });
  if (!result.ok) return refused(result.error);
  if (!result.value.ok) return refused(result.value.reason);
  revalidatePath(PEKERJAAN);
  return { status: "berhasil", message: "Rentang Tidak tersedia dihapus." };
}
