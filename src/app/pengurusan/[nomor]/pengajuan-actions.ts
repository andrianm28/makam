"use server";

import { revalidatePath } from "next/cache";
import { pemesananResource } from "@/domain/identity";
import { batalkanPengurusanSchema, unggahDokumenPengajuanSchema } from "@/domain/pengurusan";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../staf/form-state";
import { guardMessage } from "../../staf/messages";

const GAGAL: Record<string, string> = {
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
  const file = formData.get("berkas");
  const berkas = file instanceof File && file.size > 0 ? { body: new Uint8Array(await file.arrayBuffer()), contentType: file.type } : undefined;
  const result = await guarded({
    action: "pemesanan.lihat",
    resource: (actor) => pemesananResource(actor.accountId),
    schema: unggahDokumenPengajuanSchema,
    input: { nomor, nama: formData.get("nama"), berkas },
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
