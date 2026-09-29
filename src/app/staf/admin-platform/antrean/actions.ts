"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { antreanResource, lokasiMitraResource } from "@/domain/identity";
import { catatanInternalInputSchema, matikanBertugasInputSchema } from "@/domain/queues";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../form-state";
import { guardMessage } from "../../messages";

const PATH = "/staf/admin-platform/antrean";

const ambilSchema = z.object({
  type: z.string().trim().min(1),
  subjectId: z.string().trim().min(1),
});

/** Any Admin Platform takes (Ambil) an Antrean row, replacing any earlier claim (spec, story 141). */
export async function ambilAntreanRow(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
    action: "antrean.ambil",
    resource: () => antreanResource(),
    schema: ambilSchema,
    input: { type: formData.get("type"), subjectId: formData.get("subjectId") },
    run: (actor, data) => serverRuntime().queues.ambilRow(actor, data),
  });

  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(PATH);
  if (!result.value.ok) return { status: "gagal", message: "Baris ini sudah diambil orang lain sesaat lalu; coba lagi." };
  return { status: "berhasil", message: "Baris diambil." };
}

const lokasiIdSchema = z.object({ lokasiId: z.uuid() });

/**
 * Admin Platform records that a Lokasi Mitra still meets the publish gate,
 * closing the Antrean's Tier 4 "publish-gate check" row (spec, Work Queues;
 * ticket 17).
 */
export async function konfirmasiSyaratTayangMasihTerpenuhi(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
    action: "lokasi.konfirmasi_syarat_tayang",
    resource: () => lokasiMitraResource(String(formData.get("lokasiId") ?? "")),
    schema: lokasiIdSchema,
    input: { lokasiId: formData.get("lokasiId") },
    run: (actor, data) => serverRuntime().lokasi.recordPublishGateMasihTerpenuhi(actor, data.lokasiId),
  });

  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(PATH);
  if (!result.value.ok) return { status: "gagal", message: "Lokasi Mitra tidak ditemukan." };
  return { status: "berhasil", message: "Dikonfirmasi: Lokasi Mitra ini masih memenuhi syarat tayang." };
}

const domainRefusalMessages: Record<string, string> = {
  tidak_berwenang: guardMessage("tidak_berwenang"),
  perlu_totp: guardMessage("perlu_totp"),
  catatan_tidak_valid: "Isi Catatan Internal tidak boleh kosong (maksimum 2000 karakter).",
};

/** Admin Platform adds a Catatan Internal on any Antrean row or order (CONTEXT.md); never shown to the Pemesan, Mitra Jasa or Admin Lokasi. */
export async function tambahCatatanInternalAntrean(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
    action: "catatan_internal.tambah",
    resource: () => antreanResource(),
    schema: catatanInternalInputSchema,
    input: {
      subjectKind: formData.get("subjectKind"),
      subjectId: formData.get("subjectId"),
      body: formData.get("body"),
    },
    run: (actor, data) => serverRuntime().queues.tambahCatatanInternal(actor, data),
  });

  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(PATH);
  const written = result.value;
  if (!written.ok) return { status: "gagal", message: domainRefusalMessages[written.reason] ?? "Gagal menambah Catatan Internal." };
  return { status: "berhasil", message: "Catatan Internal ditambahkan." };
}

const kosong = z.object({});

const bertugasRefusalMessages: Record<string, string> = {
  tidak_berwenang: guardMessage("tidak_berwenang"),
  perlu_totp: guardMessage("perlu_totp"),
  perlu_perangkat_push:
    "Bertugas hanya bisa dinyalakan dengan push aktif. Nyalakan push di perangkat ini lewat panel di atas halaman, lalu coba lagi.",
  sudah_bertugas: "Anda sudah Bertugas.",
  tidak_bertugas: "Anda tidak sedang Bertugas.",
  input_tidak_valid: "Periksa lagi isian Anda.",
};

/** The signed-in Admin Platform goes on duty (spec, story 142); refused without an active Perangkat Push (ADR 0004). */
export async function aktifkanBertugas(): Promise<FormState> {
  const result = await guarded({
    action: "bertugas.ubah",
    resource: () => antreanResource(),
    schema: kosong,
    input: {},
    run: (actor) => serverRuntime().queues.aktifkanBertugas(actor),
  });

  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(PATH);
  if (!result.value.ok) return { status: "gagal", message: bertugasRefusalMessages[result.value.reason] ?? "Gagal menyalakan Bertugas." };
  return { status: "berhasil", message: "Anda Bertugas sekarang." };
}

/** What the off-duty form sent: for each row the staff member holds, released or kept with a Catatan Internal. */
function penangananDariForm(formData: FormData): unknown {
  const type = formData.getAll("type");
  const subjectId = formData.getAll("subjectId");
  return {
    penanganan: type.map((value, index) => ({
      type: value,
      subjectId: subjectId[index],
      aksi: formData.get(`aksi-${index}`),
      catatan: String(formData.get(`catatan-${index}`) ?? ""),
    })),
  };
}

/** The signed-in Admin Platform goes off duty; each row they hold is released or annotated first (spec, Work Queues). */
export async function matikanBertugas(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
    action: "bertugas.ubah",
    resource: () => antreanResource(),
    schema: matikanBertugasInputSchema,
    input: penangananDariForm(formData),
    run: (actor, data) => serverRuntime().queues.matikanBertugas(actor, data),
  });

  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(PATH);
  const off = result.value;
  if (!off.ok) {
    if (off.reason === "perlu_penanganan") {
      return { status: "gagal", message: `Lepas atau beri Catatan Internal untuk setiap baris yang Anda ambil (${off.baris.length} belum).` };
    }
    return { status: "gagal", message: bertugasRefusalMessages[off.reason] ?? "Gagal mematikan Bertugas." };
  }
  return { status: "berhasil", message: "Bertugas dimatikan." };
}
