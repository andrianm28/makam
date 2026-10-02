"use server";

import { revalidatePath } from "next/cache";
import { pekerjaanTpuSemuaResource } from "@/domain/identity";
import { batalkanPekerjaanTerlambatTpuSchema, lepasPenugasanSchema, pekerjaanTpuIdSchema, tolakBuktiTpuSchema, tugaskanMitraJasaSchema } from "@/domain/layanan/tpu-skema";
import { batalkanPekerjaanTerlambatTpuMessages, penugasanMessages } from "@/lib/layanan-tpu-labels";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../../form-state";
import { guardMessage, refusalMessage } from "../../../messages";

/*
 * Admin Platform's two steps on one TPU job (spec, Layanan > Mitra Jasa): hand it to a
 * Mitra Jasa the picker offers, or take it off the one who holds it. Each is `guarded()`
 * (session, role, the module's own Zod schema) and then one call into the Layanan
 * module; the picker's filter and the accept deadline are the module's, not this file's.
 */

const LIST = "/staf/admin-platform/pekerjaan-tpu";
const field = (formData: FormData, name: string) => String(formData.get(name) ?? "");

function refused(reason: keyof typeof penugasanMessages): FormState {
  return { status: "gagal", message: reason === "tidak_berwenang" || reason === "perlu_totp" ? guardMessage(reason) : penugasanMessages[reason] };
}

/** Admin Platform hands the job to one Mitra Jasa, who is told by push and email and must answer by the deadline. */
export async function tugaskanMitraJasa(_previous: FormState, formData: FormData): Promise<FormState> {
  const pekerjaanId = field(formData, "pekerjaanId");
  const hasil = await guarded({
    fitur: "mitra_jasa",
    action: "pekerjaan_tpu.kelola",
    resource: () => pekerjaanTpuSemuaResource(),
    schema: tugaskanMitraJasaSchema,
    input: { pekerjaanId, mitraJasaId: field(formData, "mitraJasaId") },
    run: (actor, data) => serverRuntime().layanan.tugaskanMitraJasa(actor, data),
  });
  if (!hasil.ok) return refused(hasil.error);
  if (!hasil.value.ok) return refused(hasil.value.reason);
  revalidatePath(LIST);
  revalidatePath(`${LIST}/${pekerjaanId}`);
  return { status: "berhasil", message: "Pekerjaan ditugaskan. Mitra Jasa diberi tahu lewat push dan email." };
}

/** Admin Platform takes the job off its Mitra Jasa (flagged for reassignment), with the reason. */
export async function lepasPenugasan(_previous: FormState, formData: FormData): Promise<FormState> {
  const pekerjaanId = field(formData, "pekerjaanId");
  const hasil = await guarded({
    fitur: "mitra_jasa",
    action: "pekerjaan_tpu.kelola",
    resource: () => pekerjaanTpuSemuaResource(),
    schema: lepasPenugasanSchema,
    input: { pekerjaanId, alasan: field(formData, "alasan") },
    run: (actor, data) => serverRuntime().layanan.lepasPenugasan(actor, data),
  });
  if (!hasil.ok) return refused(hasil.error);
  if (!hasil.value.ok) return refused(hasil.value.reason);
  revalidatePath(LIST);
  revalidatePath(`${LIST}/${pekerjaanId}`);
  return { status: "berhasil", message: "Pekerjaan dilepas. Tugaskan ke Mitra Jasa lain." };
}

const buktiMessages: Record<string, string> = {
  input_tidak_valid: "Periksa lagi isian Anda. Alasan penolakan wajib diisi.",
  tidak_ditemukan: "Pekerjaan ini tidak ditemukan.",
  bukan_menunggu_verifikasi: "Bukti pekerjaan ini tidak sedang menunggu pemeriksaan.",
  tarif_belum_ada: "Tarif Mitra Jasa untuk layanan ini belum ditetapkan, jadi bukti belum bisa disetujui. Tetapkan tarifnya dulu.",
  pelaksana_tidak_ada: "Tidak ada Mitra Jasa yang memegang pekerjaan ini.",
};

const buktiRefused = (reason: string): FormState => ({ status: "gagal", message: refusalMessage(reason, buktiMessages) });

/** Admin Platform approves the proof: the job is Selesai, the Pemesan is shown the proof and the Keluhan window opens. */
export async function setujuiBukti(_previous: FormState, formData: FormData): Promise<FormState> {
  const pekerjaanId = field(formData, "pekerjaanId");
  const hasil = await guarded({
    fitur: "mitra_jasa",
    action: "pekerjaan_tpu.kelola",
    resource: () => pekerjaanTpuSemuaResource(),
    schema: pekerjaanTpuIdSchema,
    input: { pekerjaanId },
    run: (actor, data) => serverRuntime().layanan.setujuiBuktiTpu(actor, data),
  });
  if (!hasil.ok) return buktiRefused(hasil.error);
  if (!hasil.value.ok) return buktiRefused(hasil.value.reason);
  revalidatePath(LIST);
  revalidatePath(`${LIST}/${pekerjaanId}`);
  return { status: "berhasil", message: "Bukti disetujui. Pemesan diberi tahu dan masa keluhan 3×24 jam dimulai." };
}

/** Admin Platform sends the proof back with the reason: the job returns to Sedang Dikerjakan. */
export async function tolakBukti(_previous: FormState, formData: FormData): Promise<FormState> {
  const pekerjaanId = field(formData, "pekerjaanId");
  const hasil = await guarded({
    fitur: "mitra_jasa",
    action: "pekerjaan_tpu.kelola",
    resource: () => pekerjaanTpuSemuaResource(),
    schema: tolakBuktiTpuSchema,
    input: { pekerjaanId, alasan: field(formData, "alasan") },
    run: (actor, data) => serverRuntime().layanan.tolakBuktiTpu(actor, data),
  });
  if (!hasil.ok) return buktiRefused(hasil.error);
  if (!hasil.value.ok) return buktiRefused(hasil.value.reason);
  revalidatePath(LIST);
  revalidatePath(`${LIST}/${pekerjaanId}`);
  return { status: "berhasil", message: "Bukti ditolak. Mitra Jasa diminta mengambil ulang." };
}

/** Admin Platform cancels a Terlambat job on the family's behalf: the whole Tagihan is refunded and the Mitra Jasa gets no Pencairan. */
export async function batalkanPekerjaanTerlambat(_previous: FormState, formData: FormData): Promise<FormState> {
  const pekerjaanId = field(formData, "pekerjaanId");
  const hasil = await guarded({
    fitur: "mitra_jasa",
    action: "pekerjaan_tpu.kelola",
    resource: () => pekerjaanTpuSemuaResource(),
    schema: batalkanPekerjaanTerlambatTpuSchema,
    input: { pekerjaanId, catatan: formData.get("catatan") },
    run: (actor, data) => serverRuntime().layanan.batalkanPekerjaanTerlambatTpu(actor, data),
  });
  const gagal = !hasil.ok ? hasil.error : !hasil.value.ok ? hasil.value.reason : null;
  revalidatePath(LIST);
  revalidatePath(`${LIST}/${pekerjaanId}`);
  if (gagal) return { status: "gagal", message: refusalMessage(gagal, batalkanPekerjaanTerlambatTpuMessages) };
  return { status: "berhasil", message: "Pekerjaan dibatalkan dan pengembalian dana diajukan." };
}
