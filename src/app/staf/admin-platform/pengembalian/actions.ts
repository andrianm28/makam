"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { pengembalianResource } from "@/domain/identity";
import { rekeningSchema } from "@/domain/refunds";
import { rupiahSchema } from "@/lib/rupiah";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../form-state";
import { guardMessage } from "../../messages";

const PATH = "/staf/admin-platform/pengembalian";

/** The transfer proof, as the form's file input hands it over. */
async function buktiFromForm(formData: FormData) {
  const file = formData.get("bukti");
  if (!(file instanceof File) || file.size === 0) return null;
  return { body: new Uint8Array(await file.arrayBuffer()), contentType: file.type };
}

const teksAtauKosong = (value: FormDataEntryValue | null) => (value === null || value === "" ? undefined : value);
const setujuiSchema = z.object({
  permintaanId: z.uuid(),
  // One money schema at both boundaries: the form's string is made a number, then `rupiahSchema` (the domain's own).
  biayaLayananPlatform: z.preprocess(
    (value) => (value === null || value === "" ? undefined : Number(value)),
    rupiahSchema.optional(),
  ),
  catatan: z.preprocess(teksAtauKosong, z.string().trim().min(1).optional()),
});

/**
 * Admin Platform approves a refund request: the Tier 3 "refund transfer" row appears with its own deadline.
 * On a Harga Khusus Tagihan the form may also carry the fee to return (`biayaLayananPlatform`, never above the
 * fault rule's default) and, when it differs, the required `catatan` (owner decision 2026-10-01).
 */
export async function setujuiPengembalianAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
    action: "pengembalian.kelola",
    resource: () => pengembalianResource(),
    schema: setujuiSchema,
    input: {
      permintaanId: formData.get("permintaanId"),
      biayaLayananPlatform: formData.get("biayaLayananPlatform"),
      catatan: formData.get("catatan"),
    },
    run: (actor, data) => serverRuntime().refunds.setujuiPengembalian(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(PATH);
  revalidatePath("/staf/admin-platform/antrean");
  if (!result.value.ok) return { status: "gagal", message: GAGAL_SETUJUI[result.value.reason] ?? "Permintaan tidak bisa disetujui." };
  return { status: "berhasil", message: "Permintaan pengembalian disetujui." };
}

const GAGAL_SETUJUI: Record<string, string> = {
  tidak_ditemukan: "Permintaan tidak ditemukan.",
  sudah_diproses: "Permintaan ini sudah diproses.",
  bukan_harga_khusus: "Tagihan ini tanpa Harga Khusus: biaya mengikuti tabel kesalahan.",
  biaya_melebihi_default: "Biaya yang dikembalikan tidak boleh melebihi aturan kesalahan.",
  catatan_wajib: "Catatan wajib diisi bila biaya diubah.",
  melebihi_tagihan: "Jumlah pengembalian melebihi yang dibayar pada Tagihan ini.",
};

const isiRekeningSchema = z.object({ permintaanId: z.uuid(), rekening: rekeningSchema, alasan: z.string().trim().min(1) });

/** Admin Platform records the bank account on the Pemesan's behalf (e.g. taken by phone). */
export async function isiRekeningAdminAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
    action: "pengembalian.kelola",
    resource: () => pengembalianResource(),
    schema: isiRekeningSchema,
    input: {
      permintaanId: formData.get("permintaanId"),
      rekening: { bank: formData.get("bank"), nomor: formData.get("nomor"), nama: formData.get("nama") },
      alasan: formData.get("alasan"),
    },
    run: (actor, data) => serverRuntime().refunds.isiRekeningAdmin(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(PATH);
  if (!result.value.ok) return { status: "gagal", message: "Rekening gagal disimpan." };
  return { status: "berhasil", message: "Rekening tersimpan." };
}

const GAGAL_TRANSFER: Record<string, string> = {
  belum_disetujui: "Permintaan ini belum disetujui, atau sudah ditransfer.",
  rekening_belum_diisi: "Rekening tujuan belum diisi.",
  tanggal_tidak_valid: "Tanggal transfer tidak valid.",
  berkas_tidak_didukung: "Bukti transfer harus berupa foto atau scan (JPG, PNG, PDF).",
  pengaturan_operator_belum_diisi: "Pengaturan Operator belum diisi.",
};

/** Admin Platform transfers by hand, uploads the proof and enters the date: issues one Bukti Pengembalian Dana. */
export async function terbitkanBuktiPengembalianDanaAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const bukti = await buktiFromForm(formData);
  const result = await guarded({
    action: "pengembalian.kelola",
    resource: () => pengembalianResource(),
    schema: z.object({ permintaanId: z.uuid(), ditransferPada: z.string(), bukti: z.object({ body: z.instanceof(Uint8Array), contentType: z.string() }) }),
    input: { permintaanId: formData.get("permintaanId"), ditransferPada: formData.get("ditransferPada"), bukti },
    run: (actor, data) => serverRuntime().refunds.terbitkanBuktiPengembalianDana(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(PATH);
  revalidatePath("/staf/admin-platform/antrean");
  if (!result.value.ok) return { status: "gagal", message: GAGAL_TRANSFER[result.value.reason] ?? "Transfer gagal dicatat." };
  return { status: "berhasil", message: `Bukti Pengembalian Dana ${result.value.bukti.nomor} diterbitkan.` };
}

const goodwillSchema = z.object({
  tagihanId: z.string().trim().min(1),
  nomorTagihan: z.string().trim().min(1),
  nomorPemesanan: z.string().trim().min(1).nullable(),
  jumlah: z.coerce.number().int().min(1),
  catatan: z.string().trim().min(1),
});

/** Admin Platform raises a goodwill refund on any Tagihan: from the Operator's own funds, never netted. */
export async function ajukanGoodwillAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
    action: "pengembalian.kelola",
    resource: () => pengembalianResource(),
    schema: goodwillSchema,
    input: {
      tagihanId: formData.get("tagihanId"),
      nomorTagihan: formData.get("nomorTagihan"),
      nomorPemesanan: formData.get("nomorPemesanan") || null,
      jumlah: formData.get("jumlah"),
      catatan: formData.get("catatan"),
    },
    run: (actor, data) => serverRuntime().refunds.ajukanGoodwill(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(PATH);
  if (!result.value.ok) return { status: "gagal", message: "Permintaan goodwill gagal diajukan." };
  return { status: "berhasil", message: "Permintaan pengembalian goodwill diajukan." };
}
