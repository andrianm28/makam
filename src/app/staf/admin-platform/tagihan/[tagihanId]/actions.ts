"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { BUKTI_PEMBAYARAN_MAX_BYTES } from "@/domain/billing";
import { hargaKhususSchema } from "@/domain/pemesanan";
import { lokasiMitraResource, tagihanResource } from "@/domain/identity";
import { formatRupiah } from "@/lib/rupiah";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import { guardMessage } from "../../../messages";
import type { FormState } from "../../../form-state";

/** What the form holds: the browser's File, bounded here and read in `run`. */
const buktiForm = z.object({
  tagihanId: z.uuid(),
  metode: z.enum(["transfer_manual", "tunai"]),
  referensi: z.string().trim().max(120).optional(),
  dibayarPada: z.string().trim().max(40).optional(),
  bukti: z.instanceof(File).refine((file) => file.size > 0 && file.size <= BUKTI_PEMBAYARAN_MAX_BYTES),
});

/**
 * Admin Platform records a Tagihan paid by hand (Transfer manual or Tunai) with
 * its proof: the Tagihan becomes Lunas with one Bukti Pembayaran, and the family
 * is sent the receipt through that payment's own effects.
 */
export async function catatPembayaranManual(_previous: FormState, formData: FormData): Promise<FormState> {
  const tagihanId = String(formData.get("tagihanId") ?? "");
  const result = await guarded({
    action: "pembayaran.catat_manual",
    resource: () => tagihanResource(tagihanId),
    schema: buktiForm,
    input: {
      tagihanId: formData.get("tagihanId"),
      metode: formData.get("metode"),
      referensi: formData.get("referensi") || undefined,
      dibayarPada: formData.get("dibayarPada") || undefined,
      bukti: formData.get("bukti"),
    },
    run: async (actor, data) =>
      serverRuntime().billing.catatPembayaranManual(actor, {
        tagihanId: data.tagihanId,
        metode: data.metode,
        referensi: data.referensi ?? null,
        dibayarPada: data.dibayarPada,
        bukti: { body: new Uint8Array(await data.bukti.arrayBuffer()), contentType: data.bukti.type },
      }),
  });
  revalidatePath(`/staf/admin-platform/tagihan/${tagihanId}`);
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  if (!result.value.ok) return { status: "gagal", message: pembayaranMessage(result.value.reason) };
  return {
    status: "berhasil",
    message: `Pembayaran dicatat. Bukti Pembayaran ${result.value.bukti.nomorBukti} terbit untuk Tagihan ${result.value.bukti.tagihan.nomorTagihan}.`,
  };
}

/** What the Harga Khusus form holds, as `datetime-local` and text fields keep it. */
const hargaKhususForm = hargaKhususSchema.extend({
  // Two fields the action reads for the audit and the messages, not for the domain.
  tagihanId: z.uuid(),
  lokasiId: z.string().trim().min(1),
  nomorPemesanan: z.string().trim().max(20),
});

/**
 * Admin Platform gives a family a Harga Khusus on the order this Tagihan is for:
 * the Tagihan is cancelled and replaced with the reduction as its own negative
 * line, and the share the Lokasi Mitra agreed to bear is recorded on the order
 * with it — one audited step.
 */
export async function tambahHargaKhusus(_previous: FormState, formData: FormData): Promise<FormState> {
  const tagihanId = String(formData.get("tagihanId") ?? "");
  const nomorPemesanan = String(formData.get("nomorPemesanan") ?? "");
  const result = await guarded({
    action: "harga_khusus.ubah",
    resource: () => lokasiMitraResource(String(formData.get("lokasiId") ?? "")),
    schema: hargaKhususForm,
    input: {
      nomor: formData.get("nomor"),
      jumlah: Number(formData.get("jumlah") ?? Number.NaN),
      alasan: formData.get("alasan"),
      partnerShare: formData.get("partnerShare") === null ? undefined : Number(formData.get("partnerShare")),
      partnerShareNote: formData.get("partnerShareNote") || undefined,
      tagihanId: formData.get("tagihanId"),
      lokasiId: formData.get("lokasiId"),
      nomorPemesanan: formData.get("nomorPemesanan"),
    },
    run: (actor, data) =>
      serverRuntime().pemesanan.tambahHargaKhusus(actor, {
        nomor: data.nomor,
        jumlah: data.jumlah,
        alasan: data.alasan,
        partnerShare: data.partnerShare,
        partnerShareNote: data.partnerShareNote,
      }),
  });
  revalidatePath(`/staf/admin-platform/tagihan/${tagihanId}`);
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  if (!result.value.ok) return { status: "gagal", message: hargaKhususMessage(result.value.reason, nomorPemesanan) };
  return {
    status: "berhasil",
    message: `Harga Khusus dicatat. Tagihan ${result.value.tagihan.replacesNomorTagihan ?? result.value.tagihan.nomorTagihan} diganti dengan ${result.value.tagihan.nomorTagihan}, total ${formatRupiah(result.value.tagihan.total)}.`,
  };
}

/** Why a manual payment was refused, saying what to do next. */
function pembayaranMessage(reason: string): string {
  switch (reason) {
    case "input_tidak_valid":
      return "Isi metode, waktu pembayaran (boleh dikosongkan) dan berkas bukti pembayaran.";
    case "tagihan_tidak_ditemukan":
      return "Tagihan ini tidak ditemukan.";
    case "pembayaran_sudah_ada":
      return "Tagihan ini sudah Lunas, jadi pembayarannya sudah tercatat lewat jalan lain. Tidak ada Bukti Pembayaran kedua.";
    case "tagihan_dibatalkan":
      return "Tagihan ini sudah dibatalkan, jadi tidak bisa dibayar lagi. Minta keluarga memesan ulang bila masih relevan.";
    case "batas_pembayaran_lewat":
      return "Pembayaran ini sudah lewat batas waktu Tagihan, jadi tidak bisa dicatat di sini. Tangani lewat Antrean atau hubungi CS.";
    case "waktu_pembayaran_tidak_valid":
      return "Waktu pembayaran harus waktu yang benar dan tidak di masa depan.";
    case "bukti_tidak_didukung":
      return "Bukti pembayaran harus foto (JPG, PNG, WebP) atau PDF, paling besar 10 MB.";
    case "penyimpanan_belum_tersedia":
      return "Berkas bukti tidak tersimpan. Coba lagi; kalau tetap gagal, hubungi CS.";
    case "pengaturan_operator_belum_diisi":
      return "Pengaturan Operator belum diisi, jadi Bukti Pembayaran tidak bisa diterbitkan. Isi dulu di Pengaturan Operator.";
    case "perlu_totp":
    case "tidak_berwenang":
      return "Anda tidak berwenang melakukan ini.";
    default:
      return "Periksa lagi isian Anda.";
  }
}

/** Why a Harga Khusus was refused, saying what to do next. */
function hargaKhususMessage(reason: string, nomorPemesanan: string): string {
  switch (reason) {
    case "input_tidak_valid":
      return "Isi jumlah pengurangan dan alasannya. Catatan wajib diisi bila bagian yang ditanggung Lokasi Mitra lebih dari nol.";
    case "pesanan_tidak_ditemukan":
      return "Pesanan ini tidak ditemukan.";
    case "tagihan_belum_ada":
      return "Pesanan ini belum punya Tagihan. Lokasi Mitra harus mengonfirmasi pesanan lebih dulu.";
    case "tagihan_tidak_bisa_diganti":
      return "Tagihan ini sudah Lunas atau dibatalkan, jadi tidak bisa diganti. Untuk mengembalikan uang, ajukan pengembalian dana lewat Antrean.";
    case "batas_pembayaran_lewat":
      return "Tagihan ini sudah lewat jatuh tempo, jadi tidak bisa diganti. Minta keluarga membuat pesanan baru.";
    case "harga_khusus_melebihi_total":
      return "Pengurangan lebih besar dari total Tagihan.";
    case "partner_share_wajib_ada_catatan":
      return "Tuliskan alasan Lokasi Mitra mau menanggung sebagian pengurangan.";
    case "partner_share_melebihi_penyesuaian":
      return "Bagian yang ditanggung Lokasi Mitra tidak boleh melebihi pengurangannya.";
    case "partner_share_sudah_terkunci":
      return "Pencairan untuk pesanan ini sudah terbit, jadi bagian yang ditanggung Lokasi Mitra tidak bisa diubah lagi.";
    case "partner_share_tidak_bisa_dicatat":
      return "Bagian yang ditanggung Lokasi Mitra belum bisa dicatat: sistem belum tahu apakah Pencairan untuk pesanan ini sudah terbit. Kosongkan kolomnya dulu, atau catat bagiannya setelah Pencairan tersedia.";
    case "perlu_totp":
    case "tidak_berwenang":
      return "Anda tidak berwenang melakukan ini.";
    default:
      return nomorPemesanan === "" ? "Periksa lagi isian Anda." : `Periksa lagi isian Anda untuk pesanan ${nomorPemesanan}.`;
  }
}
