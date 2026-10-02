"use server";

import { revalidatePath } from "next/cache";
import { pengurusanTpuResource } from "@/domain/identity";
import {
  ajukanIptmSchema,
  catatDimakamkanSchema,
  nomorPengurusanSchema,
  terbitkanIptmSchema,
  type AjukanIptmResult,
  type CatatDimakamkanResult,
  type PeriksaDokumenResult,
  type TerbitkanIptmResult,
} from "@/domain/pengurusan";
import { guarded } from "@/server/guard";
import { berkasDari, isi } from "@/server/form-fields";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../../form-state";
import { guardMessage } from "../../../messages";

/** Why a filing step was refused, in the words the screen shows. */
type Hasil = CatatDimakamkanResult | PeriksaDokumenResult | AjukanIptmResult | TerbitkanIptmResult;
type Alasan = Extract<Hasil, { ok: false }>["reason"];
const GAGAL: Partial<Record<Alasan, string>> = {
  input_tidak_valid: "Isian belum lengkap atau berkasnya tidak bisa diterima (JPG, PNG atau PDF, paling besar 8 MB).",
  pengurusan_tidak_ditemukan: "Pengurusan ini tidak ditemukan.",
  status_tidak_sesuai: "Pengurusan ini belum atau sudah melewati langkah ini.",
  dokumen_belum_lengkap: "Dokumen pengajuan belum lengkap.",
  kedaluwarsa_di_masa_lalu: "Tanggal berlaku IPTM harus di masa depan.",
  blok_nomor_wajib: "Isi blok dan nomor makam sesuai IPTM.",
};

function hasil(value: Hasil, nomor: string, berhasil: string): FormState {
  if (!value.ok) {
    const dasar = GAGAL[value.reason] ?? "Langkah ini gagal.";
    return { status: "gagal", message: "kurang" in value && value.kurang.length > 0 ? `${dasar} Kurang: ${value.kurang.join(", ")}.` : dasar };
  }
  revalidatePath(`/staf/admin-platform/pengurusan/${nomor}`);
  revalidatePath("/staf/admin-platform/antrean");
  return { status: "berhasil", message: berhasil };
}

/** Admin Platform records the burial: Dimakamkan, which starts the 7-day filing window and the Tagihan's overdue clock. */
export async function catatDimakamkanAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const nomor = String(formData.get("nomor") ?? "");
  const result = await guarded({
    action: "pengurusan.konfirmasi",
    resource: () => pengurusanTpuResource(),
    schema: catatDimakamkanSchema,
    input: { nomor },
    run: (actor, data) => serverRuntime().pengurusan.catatDimakamkan(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  return hasil(result.value, nomor, "Pemakaman dicatat. Keluarga punya 7 hari untuk mengunggah dokumen.");
}

/** Admin Platform has checked the family's documents: Dokumen Lengkap. */
export async function periksaDokumenAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const nomor = String(formData.get("nomor") ?? "");
  const result = await guarded({
    action: "pengurusan.konfirmasi",
    resource: () => pengurusanTpuResource(),
    schema: nomorPengurusanSchema,
    input: { nomor },
    run: (actor, data) => serverRuntime().pengurusan.periksaDokumen(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  return hasil(result.value, nomor, "Dokumen lengkap. Pengajuan IPTM masuk ke Antrean.");
}

/** Admin Platform filed on JakEVO: IPTM Diajukan, optionally with a Berkas IPTM Tugas Lapangan to carry the originals. */
export async function ajukanIptmAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const nomor = String(formData.get("nomor") ?? "");
  const result = await guarded({
    action: "pengurusan.konfirmasi",
    resource: () => pengurusanTpuResource(),
    schema: ajukanIptmSchema,
    input: { nomor, ...isi(formData, "berkasPetugasAccountId") },
    run: (actor, data) => serverRuntime().pengurusan.ajukanIptm(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  return hasil(result.value, nomor, "IPTM diajukan.");
}

/** Admin Platform uploads the IPTM scan and its expiry: IPTM Terbit, whatever the Tagihan's status. */
export async function terbitkanIptmAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const nomor = String(formData.get("nomor") ?? "");
  const result = await guarded({
    action: "pengurusan.konfirmasi",
    resource: () => pengurusanTpuResource(),
    schema: terbitkanIptmSchema,
    input: { nomor, berkas: await berkasDari(formData, "berkas"), berlakuSampai: formData.get("berlakuSampai"), ...isi(formData, "blokNomor") },
    run: (actor, data) => serverRuntime().pengurusan.terbitkanIptm(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  return hasil(result.value, nomor, "IPTM terbit dan dikirim ke keluarga. Makam TPU diperbarui.");
}
