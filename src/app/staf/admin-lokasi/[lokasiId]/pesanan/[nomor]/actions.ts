"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { lokasiMitraResource } from "@/domain/identity";
import { centangDokumenSchema, konfirmasiSaatDukaSchema } from "@/domain/pemesanan";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import { guardMessage } from "../../../../messages";

/** What a Server Action's form state carries back to the screen (the design system's inline errors). */
export type PesananActionState = { status: "idle" } | { status: "gagal"; message: string } | { status: "berhasil"; message: string };

/** The confirmation, in one step: the cleared Tersedia Petak it assigns and the burial the Lokasi agrees. */
export async function konfirmasiPesanan(_previous: PesananActionState, formData: FormData): Promise<PesananActionState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  const result = await guarded({
    action: "pemesanan.konfirmasi",
    resource: () => lokasiMitraResource(lokasiId),
    schema: konfirmasiSaatDukaSchema,
    input: {
      nomor: formData.get("nomor"),
      petakId: formData.get("petakId"),
      pemakamanAt: formData.get("pemakamanAt"),
    },
    run: (actor, data) => serverRuntime().pemesanan.konfirmasiSaatDuka(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  const nomor = String(formData.get("nomor") ?? "");
  revalidatePath(`/staf/admin-lokasi/${lokasiId}/pesanan/${nomor}`);
  revalidatePath(`/staf/admin-lokasi/${lokasiId}/antrean`);
  if (!result.value.ok) return { status: "gagal", message: konfirmasiMessage(result.value.reason) };
  return {
    status: "berhasil",
    message: `Pesanan ${result.value.pesanan.nomor} dikonfirmasi di Petak ${result.value.pesanan.petakNomor}. Tagihan ${result.value.tagihan.nomorTagihan} terbit.`,
  };
}

/** The Admin Lokasi ticks one document off its checklist: they have it in hand. */
export async function centangDokumen(_previous: PesananActionState, formData: FormData): Promise<PesananActionState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  const nomor = String(formData.get("nomor") ?? "");
  const result = await guarded({
    action: "pemesanan.centang_dokumen",
    resource: () => lokasiMitraResource(lokasiId),
    schema: centangDokumenSchema,
    input: { nomor: formData.get("nomor"), nama: formData.get("nama") },
    run: (actor, data) => serverRuntime().pemesanan.centangDokumen(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(`/staf/admin-lokasi/${lokasiId}/pesanan/${nomor}`);
  if (!result.value.ok) return { status: "gagal", message: "Dokumen ini tidak ada di daftar dokumen Lokasi Mitra." };
  return { status: "berhasil", message: `${result.value.nama} ditandai sudah ada.` };
}

/** The Admin Lokasi of that Lokasi Mitra logs the call its own failed message row asked for. */
export async function catatPanggilanLokasi(_previous: PesananActionState, formData: FormData): Promise<PesananActionState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  const result = await guarded({
    action: "telepon_pemesan.catat_lokasi",
    resource: () => lokasiMitraResource(lokasiId),
    schema: z.object({
      teleponId: z.uuid(),
      hasil: z.enum(["sudah_dihubungi", "tidak_diangkat", "nomor_salah"]),
      catatan: z.string().trim().max(500).optional(),
    }),
    input: {
      teleponId: formData.get("teleponId"),
      hasil: formData.get("hasil"),
      catatan: formData.get("catatan") ?? undefined,
    },
    run: (actor, data) => serverRuntime().notifications.catatPanggilan(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(`/staf/admin-lokasi/${lokasiId}/antrean`);
  if (!result.value.ok) return { status: "gagal", message: "Baris panggilan ini sudah ditutup." };
  return { status: "berhasil", message: "Panggilan dicatat. Baris ditutup." };
}

/** Why a confirmation was refused, saying what to do next. */
function konfirmasiMessage(reason: string): string {
  switch (reason) {
    case "pesanan_tidak_ditemukan":
      return "Pesanan tidak ditemukan.";
    case "pesanan_sudah_dikonfirmasi":
      return "Pesanan ini sudah dikonfirmasi, jadi petaknya tidak berubah.";
    case "pesanan_sudah_ditutup":
      return "Pesanan ini sudah ditutup, tidak bisa dikonfirmasi.";
    case "petak_tidak_ditemukan":
      return "Petak ini bukan milik Lokasi Mitra ini. Pilih dari daftar.";
    case "petak_belum_tersedia":
      return "Petak ini sudah terisi atau belum dicek. Bersihkan di Denah lebih dulu, atau pilih petak lain.";
    case "jenis_makam_beda":
      return "Petak ini bukan jenis makam yang dipesan. Pilih petak lain.";
    case "kontak_pemesan_kosong":
      return "Pesan ini tidak punya nomor telepon untuk Tagihan. Minta nomor kepada keluarga, lalu konfirmasi lagi.";
    case "harga_tidak_tersedia":
      return "Harga makam ini belum tersedia atau sudah berubah. Periksa tarif Lokasi Mitra ini.";
    case "tagihan_tidak_terbit":
      return "Tagihan belum bisa diterbitkan, jadi pesanan tidak jadi dikonfirmasi. Periksa Pengaturan Operator.";
    case "lokasi_tidak_terbuka":
      return "Lokasi Mitra ini tidak ditemukan.";
    case "perlu_totp":
    case "tidak_berwenang":
      return "Anda tidak berwenang melakukan ini.";
    default:
      return "Periksa lagi isian Anda.";
  }
}
