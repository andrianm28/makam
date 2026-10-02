"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { akunResource } from "@/domain/identity";
import { pekerjaanTpuIdSchema } from "@/domain/layanan/tpu-skema";
import { buktiPekerjaanSchema } from "@/domain/layanan/pesanan-schema";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../form-state";
import { guardMessage } from "../../messages";

/*
 * The Mitra Jasa's photo proof of a TPU job (spec, Pekerjaan Layanan; ticket 57): one shot
 * at a time from the in-app camera, then Kirim. Each is `guarded()` (session, role, Zod) and
 * one call into the Layanan module, which checks the job is theirs and which shots are due.
 */

const PEKERJAAN = "/staf/mitra-jasa/pekerjaan";

const pesanRefusal = {
  berkas_tidak_didukung: "Berkas bukti tidak bisa dipakai. Ambil ulang dengan kamera.",
  penyimpanan_belum_tersedia: "Bukti belum bisa disimpan. Coba lagi sebentar.",
  tidak_ditemukan: "Pekerjaan ini tidak ada di daftar Anda.",
  tidak_bisa_diubah: "Bukti pekerjaan ini sedang diperiksa atau sudah selesai, jadi tidak bisa diubah.",
  tidak_bisa_dikirim: "Pekerjaan ini belum bisa dikirim.",
  input_tidak_valid: "Periksa lagi isian Anda.",
  bukti_kurang: "Masih ada foto yang belum diambil.",
} as const;

const unggahSchema = z.object({
  pekerjaanId: z.uuid(),
  kind: z.enum(["foto_sebelum", "foto_sesudah", "video"]),
  takenAt: z.coerce.date(),
  file: z.custom<File>((value) => value instanceof File && value.size > 0, "Bukti belum diterima."),
});

function pesan(reason: string): string {
  return reason === "tidak_berwenang" || reason === "perlu_totp" || reason === "belum_masuk" ? guardMessage(reason) : (pesanRefusal as Record<string, string>)[reason] ?? "Gagal. Coba lagi.";
}

/** Saves one shot the in-app camera just took; `takenAt` is the camera's own moment. */
export async function simpanBuktiTpu(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = unggahSchema.safeParse({
    pekerjaanId: formData.get("pekerjaanId"),
    kind: formData.get("kind"),
    takenAt: formData.get("takenAt"),
    file: formData.get("file"),
  });
  if (!parsed.success) return { status: "gagal", message: pesan("berkas_tidak_didukung") };
  const { pekerjaanId, kind, takenAt, file } = parsed.data;
  const hasil = await guarded({
    action: "pekerjaan_tpu.jawab",
    resource: (actor) => akunResource(actor.accountId),
    schema: buktiPekerjaanSchema,
    input: { pekerjaanId, kind, takenAt, file: { body: new Uint8Array(await file.arrayBuffer()), contentType: file.type } },
    run: (actor, data) => serverRuntime().layanan.simpanBuktiTpu(actor, data),
  });
  if (!hasil.ok) return { status: "gagal", message: pesan(hasil.error) };
  if (!hasil.value.ok) return { status: "gagal", message: pesan(hasil.value.reason) };
  revalidatePath(PEKERJAAN);
  return { status: "berhasil", message: "Bukti tersimpan." };
}

/** Sends the proof for approval once every shot the Layanan asks for is in. */
export async function kirimBuktiTpu(_previous: FormState, formData: FormData): Promise<FormState> {
  const hasil = await guarded({
    action: "pekerjaan_tpu.jawab",
    resource: (actor) => akunResource(actor.accountId),
    schema: pekerjaanTpuIdSchema,
    input: { pekerjaanId: String(formData.get("pekerjaanId") ?? "") },
    run: (actor, data) => serverRuntime().layanan.kirimBuktiTpu(actor, data),
  });
  if (!hasil.ok) return { status: "gagal", message: pesan(hasil.error) };
  if (!hasil.value.ok) return { status: "gagal", message: pesan(hasil.value.reason) };
  revalidatePath(PEKERJAAN);
  return { status: "berhasil", message: "Bukti terkirim. Admin Platform memeriksanya dalam 24 jam." };
}
