"use server";

import { z } from "zod";
import { KTP_CHECK_MAX_BYTES, stafResource, type RecoverAccountResult } from "@/domain/identity";
import { emailInput } from "@/server/code-inputs";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../form-state";
import { guardMessage } from "../../messages";

const schema = z.object({
  // One of them: the Akun's id (picked from the staff roster) or its email on record.
  accountId: z.string().trim().min(1).max(64).optional(),
  currentEmail: emailInput.optional(),
  newEmail: emailInput,
  ktpCheck: z.instanceof(File).refine((file) => file.size <= KTP_CHECK_MAX_BYTES),
  ktpChecked: z.literal("ya").optional(),
  reason: z.string().trim().max(500),
});

/** Pemulihan Akun: Admin Platform moves an Akun to a new Email Terverifikasi after a KTP check. */
export async function pulihkanAkun(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
    action: "akun.pemulihan",
    resource: () => stafResource(),
    schema,
    input: {
      accountId: formData.get("accountId") ?? undefined,
      currentEmail: formData.get("currentEmail") ?? undefined,
      newEmail: formData.get("newEmail"),
      ktpCheck: formData.get("ktpCheck"),
      ktpChecked: formData.get("ktpChecked") ?? undefined,
      reason: formData.get("reason"),
    },
    run: async (actor, data) =>
      serverRuntime().identity.recoverAccount(actor, {
        akun: data.accountId ? { accountId: data.accountId } : { email: data.currentEmail ?? "" },
        newEmail: data.newEmail,
        ktpCheck: { body: new Uint8Array(await data.ktpCheck.arrayBuffer()), contentType: data.ktpCheck.type },
        ktpChecked: data.ktpChecked === "ya",
        reason: data.reason,
      }),
  });
  if (!result.ok) {
    if (result.error === "input_tidak_valid") {
      return { status: "gagal", message: "Periksa lagi isian Anda. Berkas KTP paling besar 10 MB." };
    }
    return { status: "gagal", message: guardMessage(result.error) };
  }
  const moved = result.value;
  if (!moved.ok) return { status: "gagal", message: refusal(moved) };
  const notice =
    moved.notice === "terkirim"
      ? " Email lama sudah menerima pemberitahuan."
      : moved.notice === "gagal"
        ? " Pemberitahuan ke email lama gagal terkirim."
        : "";
  return {
    status: "berhasil",
    message: `Akun dipulihkan: Email Terverifikasi-nya sekarang ${moved.account.email}. Semua sesinya sudah diakhiri; pemilik Akun masuk lagi dengan Kode Masuk ke email itu.${notice}`,
  };
}

function refusal(refused: Extract<RecoverAccountResult, { ok: false }>): string {
  switch (refused.reason) {
    case "ktp_belum_dicek":
      return "Centang dulu bahwa KTP sudah dicocokkan dengan data Akun.";
    case "berkas_ktp_wajib":
      return "Unggah foto atau scan KTP.";
    case "berkas_ktp_tidak_didukung":
      return "Berkas KTP harus foto JPG, PNG, WebP atau scan PDF (isi berkas diperiksa), paling besar 10 MB.";
    case "alasan_wajib":
      return "Tulis alasannya.";
    case "email_tidak_valid":
      return "Periksa lagi kedua email itu.";
    case "akun_ganda":
      return "Email itu tercatat di lebih dari satu Akun. Pilih Akun-nya dari daftar Staf (Perlu Pemulihan Akun).";
    case "email_sama":
      return "Email baru sama dengan Email Terverifikasi Akun ini.";
    case "akun_tidak_ditemukan":
      return "Tidak ada Akun dengan email itu.";
    case "akun_sendiri":
      return "Anda tidak bisa memulihkan Akun Anda sendiri. Minta Admin Platform lain.";
    case "email_sudah_dipakai":
      return "Email baru sudah menjadi Email Terverifikasi Akun lain.";
    case "berkas_gagal_disimpan":
      return "Penyimpanan berkas sedang bermasalah, coba lagi. Email belum dipindah.";
    case "perlu_totp":
    case "tidak_berwenang":
      return guardMessage(refused.reason);
  }
}
