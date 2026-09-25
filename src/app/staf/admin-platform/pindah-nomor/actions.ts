"use server";

import { z } from "zod";
import { KTP_CHECK_MAX_BYTES, stafResource, type MoveAccountResult } from "@/domain/identity";
import { guarded } from "@/server/guard";
import { phoneNumberInput } from "@/server/phone-number-input";
import { serverRuntime } from "@/server/runtime";
import { guardMessage } from "../../messages";

export type PindahNomorState = { status: "idle" } | { status: "berhasil" | "gagal"; message: string };

const schema = z.object({
  currentPhoneNumber: phoneNumberInput,
  newPhoneNumber: phoneNumberInput,
  ktpCheck: z.instanceof(File).refine((file) => file.size <= KTP_CHECK_MAX_BYTES),
  ktpChecked: z.literal("ya").optional(),
  reason: z.string().trim().max(500),
});

/** Pindah Nomor: Admin Platform moves an Akun to a new number after a KTP check. */
export async function pindahNomor(_previous: PindahNomorState, formData: FormData): Promise<PindahNomorState> {
  const result = await guarded({
    action: "akun.pindah_nomor",
    resource: () => stafResource(),
    schema,
    input: {
      currentPhoneNumber: formData.get("currentPhoneNumber"),
      newPhoneNumber: formData.get("newPhoneNumber"),
      ktpCheck: formData.get("ktpCheck"),
      ktpChecked: formData.get("ktpChecked") ?? undefined,
      reason: formData.get("reason"),
    },
    run: async (actor, data) =>
      serverRuntime().identity.moveAccountToNewNumber(actor, {
        currentPhoneNumber: data.currentPhoneNumber,
        newPhoneNumber: data.newPhoneNumber,
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
  return {
    status: "berhasil",
    message: `Akun dipindah ke ${moved.account.phoneNumber}. Sesi di nomor lama sudah diakhiri; pemilik Akun masuk lagi dengan nomor baru.`,
  };
}

function refusal(refused: Extract<MoveAccountResult, { ok: false }>): string {
  switch (refused.reason) {
    case "ktp_belum_dicek":
      return "Centang dulu bahwa KTP sudah dicocokkan dengan data Akun.";
    case "berkas_ktp_wajib":
      return "Unggah foto atau scan KTP.";
    case "berkas_ktp_tidak_didukung":
      return "Berkas KTP harus JPG, PNG, WebP atau PDF, paling besar 10 MB.";
    case "alasan_wajib":
      return "Tulis alasannya.";
    case "nomor_sama":
      return "Nomor baru sama dengan nomor lama.";
    case "akun_tidak_ditemukan":
      return "Tidak ada Akun dengan nomor lama itu.";
    case "akun_sendiri":
      return "Anda tidak bisa memindahkan nomor Akun Anda sendiri. Minta Admin Platform lain.";
    case "nomor_sudah_dipakai":
      return "Nomor baru sudah dipakai Akun lain.";
    case "berkas_gagal_disimpan":
      return "Berkas KTP tidak bisa disimpan: penyimpanan berkas belum tersedia di lingkungan ini (menunggu S3, tiket 60). Nomor belum dipindah.";
    case "nomor_tidak_valid":
      return "Nomor WhatsApp tidak valid.";
    case "nomor_bukan_indonesia":
      return "Gunakan nomor WhatsApp Indonesia (+62).";
    case "perlu_totp":
    case "tidak_berwenang":
      return guardMessage(refused.reason);
  }
}
