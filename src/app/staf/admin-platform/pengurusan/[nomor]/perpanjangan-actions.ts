"use server";

import { revalidatePath } from "next/cache";
import { pengurusanTpuResource } from "@/domain/identity";
import {
  koreksiIptmBerakhirSchema,
  mintaPerbaikanSchema,
  putuskanCekTpuSchema,
  type KoreksiIptmBerakhirResult,
  type MintaPerbaikanResult,
  type PutuskanCekTpuResult,
} from "@/domain/pengurusan";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../../form-state";
import { guardMessage } from "../../../messages";

type Hasil = KoreksiIptmBerakhirResult | MintaPerbaikanResult | PutuskanCekTpuResult;
const GAGAL: Partial<Record<Extract<Hasil, { ok: false }>["reason"], string>> = {
  input_tidak_valid: "Isian belum lengkap.",
  pengurusan_tidak_ditemukan: "Perpanjangan TPU ini tidak ditemukan.",
  status_tidak_sesuai: "Perpanjangan TPU ini belum atau sudah melewati langkah ini.",
  dokumen_tidak_dikenal: "Salah satu dokumen yang dipilih tidak ada di daftar pesanan ini.",
};

function hasil(value: Hasil, nomor: string, berhasil: string): FormState {
  if (!value.ok) return { status: "gagal", message: GAGAL[value.reason] ?? "Langkah ini gagal." };
  revalidatePath(`/staf/admin-platform/pengurusan/${nomor}`);
  revalidatePath("/staf/admin-platform/antrean");
  return { status: "berhasil", message: berhasil };
}

/** The TPU's answer to a request past the masa tenggang: on to the document check, or Ditolak with no charge. */
export async function putuskanCekTpuAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const nomor = String(formData.get("nomor") ?? "");
  const putusan = formData.get("putusan");
  const result = await guarded({
    fitur: "tpu",
    action: "pengurusan.konfirmasi",
    resource: () => pengurusanTpuResource(),
    schema: putuskanCekTpuSchema,
    input: { nomor, putusan, alasan: formData.get("alasan") ?? undefined },
    run: (actor, data) => serverRuntime().pengurusan.putuskanCekTpu(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  return hasil(result.value, nomor, putusan === "tolak" ? "Permohonan ditolak tanpa biaya; alasannya dibaca keluarga." : "TPU bersedia memperpanjang. Lanjut ke pemeriksaan dokumen.");
}

/** A document of the Perpanjangan TPU needs fixing, before any Tagihan: Perlu Perbaikan. */
export async function mintaPerbaikanAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const nomor = String(formData.get("nomor") ?? "");
  const result = await guarded({
    fitur: "tpu",
    action: "pengurusan.konfirmasi",
    resource: () => pengurusanTpuResource(),
    schema: mintaPerbaikanSchema,
    input: { nomor, alasan: formData.get("alasan"), dokumen: formData.getAll("dokumen") },
    run: (actor, data) => serverRuntime().pengurusan.mintaPerbaikan(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  return hasil(result.value, nomor, "Dikembalikan ke keluarga untuk diperbaiki, tanpa Tagihan.");
}

/** The IPTM expiry date read off the photo is corrected, audited with the reason. */
export async function koreksiIptmBerakhirAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const nomor = String(formData.get("nomor") ?? "");
  const result = await guarded({
    fitur: "tpu",
    action: "pengurusan.konfirmasi",
    resource: () => pengurusanTpuResource(),
    schema: koreksiIptmBerakhirSchema,
    input: { nomor, berlakuSampai: formData.get("berlakuSampai"), alasan: formData.get("alasan") },
    run: (actor, data) => serverRuntime().pengurusan.koreksiIptmBerakhir(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  return hasil(result.value, nomor, "Tanggal berakhir IPTM dikoreksi.");
}
