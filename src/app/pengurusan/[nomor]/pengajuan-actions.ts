"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { pemesananResource } from "@/domain/identity";
import {
  batalkanPengurusanSchema,
  unggahDokumenPengajuanSchema,
  type BatalkanPengurusanResult,
  type UnggahDokumenResult,
} from "@/domain/pengurusan";
import { berkasDari } from "@/server/form-fields";
import { rekeningSchema } from "@/domain/refunds";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../staf/form-state";
import { guardMessage } from "../../staf/messages";

type Alasan = Extract<UnggahDokumenResult | BatalkanPengurusanResult, { ok: false }>["reason"];
const GAGAL: Partial<Record<Alasan, string>> = {
  input_tidak_valid: "Berkas tidak bisa diterima. Pakai JPG, PNG atau PDF, paling besar 8 MB.",
  pengurusan_tidak_ditemukan: "Pengurusan ini tidak ditemukan.",
  status_tidak_sesuai: "Berkas hanya bisa diunggah setelah pemakaman dicatat dan sebelum dokumen diperiksa.",
  sudah_diajukan: "IPTM sudah diajukan, jadi pengurusan tidak bisa dibatalkan lagi.",
  tagihan_tidak_dibatalkan: "Tagihan belum bisa dibatalkan. Coba lagi.",
  pengembalian_tidak_terbit: "Permintaan pengembalian dana belum bisa dibuat. Coba lagi.",
};

/** The Pemesan uploads one document of the filing checklist (the signed Surat Kuasa is one of them). */
export async function unggahDokumenAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const nomor = String(formData.get("nomor") ?? "");
  const result = await guarded({
    fitur: "tpu",
    action: "pemesanan.lihat",
    resource: (actor) => pemesananResource(actor.accountId),
    schema: unggahDokumenPengajuanSchema,
    input: { nomor, nama: formData.get("nama"), berkas: await berkasDari(formData, "berkas") },
    run: (actor, data) => serverRuntime().pengurusan.unggahDokumenPengajuan({ accountId: actor.accountId }, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  if (!result.value.ok) return { status: "gagal", message: GAGAL[result.value.reason] ?? "Gagal mengunggah berkas." };
  revalidatePath(`/pengurusan/${nomor}`);
  return { status: "berhasil", message: "Berkas diterima." };
}

/** The Pemesan cancels before the IPTM is filed. */
export async function batalkanPengurusanAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const nomor = String(formData.get("nomor") ?? "");
  const result = await guarded({
    fitur: "tpu",
    action: "pemesanan.lihat",
    resource: (actor) => pemesananResource(actor.accountId),
    schema: batalkanPengurusanSchema,
    input: { nomor, alasan: formData.get("alasan") ?? "" },
    run: (actor, data) => serverRuntime().pengurusan.batalkanPengurusan({ accountId: actor.accountId }, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  if (!result.value.ok) return { status: "gagal", message: GAGAL[result.value.reason] ?? "Gagal membatalkan." };
  revalidatePath(`/pengurusan/${nomor}`);
  return {
    status: "berhasil",
    message: result.value.pengembalian > 0 ? "Pengurusan dibatalkan. Permintaan pengembalian dana dibuat." : "Pengurusan dibatalkan.",
  };
}

const REKENING_GAGAL: Record<string, string> = {
  tidak_ditemukan: "Tidak ada pengembalian dana yang menunggu rekening untuk pengurusan ini.",
  terkunci: "Pengembalian dana ini sudah disetujui, jadi rekening tidak bisa diubah di sini. Hubungi CS bila perlu mengubahnya.",
  sudah_ditransfer: "Pengembalian dana ini sudah ditransfer.",
  input_tidak_valid: "Periksa lagi isian rekening Anda.",
};

/** After a paid cancellation the Pemesan says where the refund goes, until Admin Platform approves it: Refunds' own function, as for a Pemesanan order. */
export async function isiRekeningPengembalianPengurusanAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const nomor = String(formData.get("nomor") ?? "");
  const result = await guarded({
    fitur: "tpu",
    action: "pengembalian.isi_rekening",
    resource: (actor) => pemesananResource(actor.accountId),
    schema: z.object({ nomorPemesanan: z.string(), rekening: rekeningSchema }),
    input: {
      nomorPemesanan: nomor,
      rekening: { bank: formData.get("bank"), nomor: formData.get("nomorRekening"), nama: formData.get("nama") },
    },
    run: (actor, data) => serverRuntime().refunds.isiRekeningPemesan(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(`/pengurusan/${nomor}`);
  if (!result.value.ok) return { status: "gagal", message: REKENING_GAGAL[result.value.reason] ?? "Rekening gagal disimpan." };
  return { status: "berhasil", message: "Rekening tersimpan. Kami akan mentransfer pengembalian dana ke rekening ini." };
}
