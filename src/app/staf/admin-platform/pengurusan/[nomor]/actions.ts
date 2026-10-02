"use server";

import { revalidatePath } from "next/cache";
import { pengurusanTpuResource } from "@/domain/identity";
import { konfirmasiSaatDukaTpuSchema, tawarkanTpuLainSchema } from "@/domain/pengurusan";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../../form-state";
import { guardMessage } from "../../../messages";

/** Why a confirmation was refused, in the words the confirm screen shows. */
const KONFIRMASI_GAGAL: Record<string, string> = {
  pengurusan_tidak_ditemukan: "Pengurusan ini tidak ditemukan.",
  pengurusan_sudah_dikonfirmasi: "Pengurusan ini sudah dikonfirmasi atau sudah ditutup.",
  tpu_tidak_ada: "TPU ini sudah tidak ada di daftar.",
  tpu_tidak_menerima_makam_baru: "TPU ini sudah tidak menerima makam baru.",
  waktu_pemakaman_tidak_terbuka:
    "Waktu pemakaman harus di masa depan dan di dalam jam layanan TPU (pukul 06.00–18.00).",
  bukan_petugas_lapangan: "PetugasLapangan itu tidak ada atau tidak memegang peran Petugas Lapangan.",
  kontak_pemesan_kosong: "Tidak ada nomor telepon Pemesan atau Pemegang Hak untuk Tagihan.",
  harga_tidak_tersedia: "Harga TPU belum bisa dihitung atau melebihi batas pembayaran.",
  tagihan_tidak_terbit: "Tagihan belum bisa diterbitkan. Pengaturan Operator mungkin belum lengkap.",
};

/**
 * Admin Platform confirms a Saat Duka TPU order: the burial agreed with the TPU,
 * the TPU office contact, the Petugas who fetches the surat pengantar, and the
 * pay-after Tagihan. The whole step is one domain call (AGENTS.md).
 */
export async function konfirmasiPengurusan(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
    fitur: "tpu",
    action: "pengurusan.konfirmasi",
    resource: () => pengurusanTpuResource(),
    schema: konfirmasiSaatDukaTpuSchema,
    input: {
      nomor: formData.get("nomor"),
      pemakamanAt: formData.get("pemakamanAt"),
      kontakTpu: {
        name: formData.get("kontakTpuName"),
        phoneNumber: formData.get("kontakTpuPhone"),
      },
      petugasAccountId: formData.get("petugasAccountId"),
      catatan: formData.get("catatan") ?? "",
    },
    run: (actor, data) => serverRuntime().pengurusan.konfirmasiSaatDukaTpu(actor, data),
  });

  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath("/staf/admin-platform/antrean");
  if (!result.value.ok) {
    return { status: "gagal", message: KONFIRMASI_GAGAL[result.value.reason] ?? "Gagal mengonfirmasi pengurusan." };
  }
  return {
    status: "berhasil",
    message: `Pengurusan ${result.value.pengurusan.nomor} dikonfirmasi. Tagihan ${result.value.tagihan.nomorTagihan} terbit.`,
  };
}

/** Admin Platform offers the family another TPU for the same burial. */
export async function tawarkanTpuLain(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
    fitur: "tpu",
    action: "pengurusan.konfirmasi",
    resource: () => pengurusanTpuResource(),
    schema: tawarkanTpuLainSchema,
    input: { nomor: formData.get("nomor"), tpuId: formData.get("tpuId"), alasan: formData.get("alasan") },
    run: (actor, data) => serverRuntime().pengurusan.tawarkanTpuLain(actor, data),
  });

  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath("/staf/admin-platform/antrean");
  if (!result.value.ok) {
    const message: Record<string, string> = {
      pengurusan_tidak_ditemukan: "Pengurusan ini tidak ditemukan atau sudah bukan menunggu konfirmasi.",
      tpu_tidak_ada: "TPU itu tidak ada di daftar.",
      tpu_tidak_menerima_makam_baru: "TPU itu sudah tidak menerima makam baru.",
      tpu_sama: "TPU itu sama dengan yang sudah dipilih keluarga.",
    };
    return { status: "gagal", message: message[result.value.reason] ?? "Gagal menawarkan TPU lain." };
  }
  return { status: "berhasil", message: `TPU lain ditawarkan: ${result.value.tpu.name}.` };
}
