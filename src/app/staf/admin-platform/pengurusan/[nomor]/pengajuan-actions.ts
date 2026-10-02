"use server";

import { revalidatePath } from "next/cache";
import { pengurusanTpuResource } from "@/domain/identity";
import {
  ajukanIptmSchema,
  buatSuratPengantarSchema,
  catatDimakamkanSchema,
  nomorPengurusanSchema,
  terbitkanIptmSchema,
  tolakPtspSchema,
  type AjukanIptmResult,
  type BuatSuratPengantarResult,
  type CatatDimakamkanResult,
  type PeriksaDokumenResult,
  type TerbitkanIptmResult,
  type TolakPtspResult,
} from "@/domain/pengurusan";
import { guarded } from "@/server/guard";
import { berkasDari, isi } from "@/server/form-fields";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../../form-state";
import { guardMessage } from "../../../messages";

/** Why a filing step was refused, in the words the screen shows. */
type Hasil = CatatDimakamkanResult | PeriksaDokumenResult | AjukanIptmResult | TerbitkanIptmResult | BuatSuratPengantarResult | TolakPtspResult;
type Alasan = Extract<Hasil, { ok: false }>["reason"];
const GAGAL: Partial<Record<Alasan, string>> = {
  input_tidak_valid: "Isian belum lengkap atau berkasnya tidak bisa diterima (JPG, PNG atau PDF, paling besar 8 MB).",
  pengurusan_tidak_ditemukan: "Pengurusan ini tidak ditemukan.",
  status_tidak_sesuai: "Pengurusan ini belum atau sudah melewati langkah ini.",
  dokumen_belum_lengkap: "Dokumen pengajuan belum lengkap.",
  kedaluwarsa_di_masa_lalu: "Tanggal berlaku IPTM harus di masa depan.",
  blok_nomor_wajib: "Isi blok dan nomor makam sesuai IPTM.",
  belum_lunas: "Tagihan belum Lunas: tugas ambil surat pengantar baru bisa dibuat setelah dibayar.",
  sudah_dibuat: "Tugas ambil surat pengantar untuk pesanan ini sudah dibuat.",
  bukan_petugas_lapangan: "Pilih seorang Petugas Lapangan.",
  dokumen_tidak_dikenal: "Salah satu dokumen yang dipilih tidak ada di daftar pesanan ini.",
  bukan_pengurusan_berkas: "Penolakan akhir dengan pengembalian penuh hanya untuk Pengurusan IPTM saja.",
  pengembalian_tidak_terbit: "Permintaan pengembalian dana tidak bisa dibuat; tidak ada yang diubah.",
  tagihan_tidak_terbit: "Tagihan tidak bisa diterbitkan (cek nomor telepon Pemegang Hak dan Pengaturan Operator).",
  harga_tidak_tersedia: "Harga Biaya Pengurusan belum diatur.",
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
  return hasil(
    result.value,
    nomor,
    result.value.ok && result.value.status === "menunggu_pembayaran"
      ? "Dokumen lengkap. Tagihan terbit dan dikirim ke keluarga; pengajuan menunggu pembayaran."
      : "Dokumen lengkap. Pengajuan IPTM masuk ke Antrean.",
  );
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

/** Admin Platform makes the Ambil surat pengantar Tugas of a paid filing-only order. */
export async function buatSuratPengantarAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const nomor = String(formData.get("nomor") ?? "");
  const result = await guarded({
    action: "pengurusan.konfirmasi",
    resource: () => pengurusanTpuResource(),
    schema: buatSuratPengantarSchema,
    input: { nomor, petugasAccountId: formData.get("petugasAccountId") },
    run: (actor, data) => serverRuntime().pengurusan.buatSuratPengantar(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  return hasil(result.value, nomor, "Tugas ambil surat pengantar dibuat.");
}

/** Admin Platform records the PTSP's answer: back to Perlu Perbaikan (fixable) or Ditolak with a full refund (final). */
export async function tolakPtspAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const nomor = String(formData.get("nomor") ?? "");
  const putusan = formData.get("putusan");
  const result = await guarded({
    action: "pengurusan.konfirmasi",
    resource: () => pengurusanTpuResource(),
    schema: tolakPtspSchema,
    input: { nomor, putusan, alasan: formData.get("alasan"), dokumen: formData.getAll("dokumen") },
    run: (actor, data) => serverRuntime().pengurusan.tolakPtsp(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  return hasil(
    result.value,
    nomor,
    putusan === "final" ? "Pengajuan ditolak. Pengembalian dana penuh diajukan." : "Dikembalikan ke keluarga untuk diperbaiki, tanpa biaya baru.",
  );
}
