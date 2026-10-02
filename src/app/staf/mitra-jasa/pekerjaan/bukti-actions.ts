"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { akunResource } from "@/domain/identity";
import { kirimPesanThreadSchema } from "@/domain/layanan/pesanan-schema";
import { pekerjaanTpuIdSchema } from "@/domain/layanan/tpu-skema";
import { pesanThreadMessages, type PesanThreadState } from "@/lib/thread-labels";
import { guarded } from "@/server/guard";
import { inputPesanThread } from "@/server/thread-form";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../form-state";
import { refusalMessage } from "../../messages";

/*
 * The Mitra Jasa's photo proof of a TPU job (spec, Pekerjaan Layanan; ticket 57): one shot
 * at a time from the in-app camera, then Kirim. Each is `guarded()` (session, role, Zod) and
 * one call into the Layanan module, which checks the job is theirs and which shots are due.
 */

const PEKERJAAN = "/staf/mitra-jasa/pekerjaan";

const pesanRefusal: Record<string, string> = {
  berkas_tidak_didukung: "Berkas bukti tidak bisa dipakai. Ambil ulang dengan kamera.",
  penyimpanan_belum_tersedia: "Bukti belum bisa disimpan. Coba lagi sebentar.",
  tidak_ditemukan: "Pekerjaan ini tidak ada di daftar Anda.",
  tidak_bisa_diubah: "Bukti pekerjaan ini sedang diperiksa atau sudah selesai, jadi tidak bisa diubah.",
  tidak_bisa_dikirim: "Pekerjaan ini belum bisa dikirim.",
  input_tidak_valid: "Berkas bukti tidak bisa dipakai. Ambil ulang dengan kamera.",
  bukti_kurang: "Masih ada foto yang belum diambil.",
};

const unggahSchema = z.object({
  pekerjaanId: z.uuid(),
  kind: z.enum(["foto_sebelum", "foto_sesudah", "video"]),
  takenAt: z.coerce.date(),
  file: z.custom<File>((value) => value instanceof File && value.size > 0, "Bukti belum diterima."),
});

const pesan = (reason: string): string => refusalMessage(reason, pesanRefusal);

/** Saves one shot the in-app camera just took; `takenAt` is the camera's own moment. */
export async function simpanBuktiTpu(_previous: FormState, formData: FormData): Promise<FormState> {
  const hasil = await guarded({
    fitur: "mitra_jasa",
    action: "pekerjaan_tpu.jawab",
    resource: (actor) => akunResource(actor.accountId),
    schema: unggahSchema,
    input: {
      pekerjaanId: formData.get("pekerjaanId"),
      kind: formData.get("kind"),
      takenAt: formData.get("takenAt"),
      file: formData.get("file"),
    },
    run: async (actor, { pekerjaanId, kind, takenAt, file }) =>
      serverRuntime().layanan.simpanBuktiTpu(actor, { pekerjaanId, kind, takenAt, file: { body: new Uint8Array(await file.arrayBuffer()), contentType: file.type } }),
  });
  if (!hasil.ok) return { status: "gagal", message: pesan(hasil.error) };
  if (!hasil.value.ok) return { status: "gagal", message: pesan(hasil.value.reason) };
  revalidatePath(PEKERJAAN);
  return { status: "berhasil", message: "Bukti tersimpan." };
}

/** Sends the proof for approval once every shot the Layanan asks for is in. */
export async function kirimBuktiTpu(_previous: FormState, formData: FormData): Promise<FormState> {
  const hasil = await guarded({
    fitur: "mitra_jasa",
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

/**
 * The Mitra Jasa writes in the thread of a job they hold (story 180). Thin, in order: authenticate, check the role,
 * validate with Zod, call the Layanan module, which decides they hold the job, the thread is open, and emails the
 * Pemesan a link without the message.
 */
export async function kirimPesanThreadMitraJasa(_previous: PesanThreadState, formData: FormData): Promise<PesanThreadState> {
  const hasil = await guarded({
    fitur: "mitra_jasa",
    action: "pekerjaan_tpu.jawab",
    resource: (actor) => akunResource(actor.accountId),
    schema: kirimPesanThreadSchema,
    input: await inputPesanThread(formData),
    run: (actor, data) => serverRuntime().layanan.kirimPesanStaf(actor, data),
  });
  if (!hasil.ok) return { status: "gagal", message: pesanThreadMessages[hasil.error] ?? "Periksa lagi isian Anda." };
  revalidatePath(PEKERJAAN);
  if (!hasil.value.ok) return { status: "gagal", message: pesanThreadMessages[hasil.value.reason] ?? "Pesan gagal dikirim." };
  return { status: "berhasil", message: "Pesan terkirim. Keluarga diberi tahu lewat email." };
}
