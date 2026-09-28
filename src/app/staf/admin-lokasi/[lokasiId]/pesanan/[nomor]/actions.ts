"use server";

import { revalidatePath } from "next/cache";
import { lokasiMitraResource } from "@/domain/identity";
import { catatPanggilanSchema } from "@/domain/notifications";
import {
  batalkanSaatDukaSchema,
  catatPemakamanOrderSchema,
  centangDokumenSchema,
  konfirmasiSaatDukaSchema,
  tolakSaatDukaSchema,
  tawarkanAlternatifSchema,
} from "@/domain/pemesanan";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import { guardMessage } from "../../../../messages";
import { alternatifMessage, batalkanMessage, catatPemakamanMessage, konfirmasiMessage, tolakMessage } from "./pesanan-messages";

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

/**
 * The Admin Lokasi declines the order with a reason off the closed list (story
 * 118). The list itself is the schema's, so this action can offer nothing else
 * than the fixed reasons and the module can accept nothing else either.
 */
export async function tolakPesanan(_previous: PesananActionState, formData: FormData): Promise<PesananActionState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  const result = await guarded({
    action: "pemesanan.tolak",
    resource: () => lokasiMitraResource(lokasiId),
    schema: tolakSaatDukaSchema,
    input: { nomor: formData.get("nomor"), alasan: formData.get("alasan") },
    run: (actor, data) => serverRuntime().pemesanan.tolakSaatDuka(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(`/staf/admin-lokasi/${lokasiId}/pesanan/${String(formData.get("nomor") ?? "")}`);
  revalidatePath(`/staf/admin-lokasi/${lokasiId}/antrean`);
  if (!result.value.ok) return { status: "gagal", message: tolakMessage(result.value.reason) };
  return { status: "berhasil", message: `Pesanan ${result.value.pesanan.nomor} ditolak. Keluarga diberi tahu dan dapat memilih Lokasi Mitra lain.` };
}

/** The Admin Lokasi offers an alternative: another Jenis Makam, another day, or both (story 31). */
export async function tawarkanAlternatifPesanan(_previous: PesananActionState, formData: FormData): Promise<PesananActionState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  const result = await guarded({
    action: "pemesanan.tawarkan_alternatif",
    resource: () => lokasiMitraResource(lokasiId),
    schema: tawarkanAlternatifSchema,
    input: {
      nomor: formData.get("nomor"),
      jenisMakamId: formData.get("jenisMakamId") ?? "",
      pemakamanAt: formData.get("pemakamanAt") ?? "",
    },
    run: (actor, data) => serverRuntime().pemesanan.tawarkanAlternatif(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(`/staf/admin-lokasi/${lokasiId}/pesanan/${String(formData.get("nomor") ?? "")}`);
  if (!result.value.ok) return { status: "gagal", message: alternatifMessage(result.value.reason) };
  return {
    status: "berhasil",
    message: `Alternatif ditawarkan ke keluarga: total semua biaya ${result.value.alternatif.total.toLocaleString("id-ID")} rupiah.`,
  };
}

/** The Admin Lokasi records a cancellation the family asked for on the phone (story 34). */
export async function batalkanPesanan(_previous: PesananActionState, formData: FormData): Promise<PesananActionState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  const result = await guarded({
    action: "pemesanan.batalkan_untuk_pemesan",
    resource: () => lokasiMitraResource(lokasiId),
    schema: batalkanSaatDukaSchema,
    input: { nomor: formData.get("nomor"), alasan: formData.get("alasan") ?? "" },
    run: (actor, data) => serverRuntime().pemesanan.batalkanUntukPemesan(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(`/staf/admin-lokasi/${lokasiId}/pesanan/${String(formData.get("nomor") ?? "")}`);
  revalidatePath(`/staf/admin-lokasi/${lokasiId}/antrean`);
  if (!result.value.ok) return { status: "gagal", message: batalkanMessage(result.value.reason) };
  return {
    status: "berhasil",
    message: `Pesanan ${result.value.pesanan.nomor} dibatalkan. Petak dikembalikan, Tagihan dibatalkan, dan keluarga diberi tahu.`,
  };
}

/**
 * The burial itself, the day it actually happened: the Hak Pakai's term starts
 * here and the order becomes Dimakamkan (Selesai too, when its Tagihan has
 * already been paid).
 */
export async function catatPemakaman(_previous: PesananActionState, formData: FormData): Promise<PesananActionState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  const nomor = String(formData.get("nomor") ?? "");
  const result = await guarded({
    action: "pemakaman.catat",
    resource: () => lokasiMitraResource(lokasiId),
    schema: catatPemakamanOrderSchema,
    input: {
      nomor: formData.get("nomor"),
      tanggal: formData.get("tanggal"),
      layer: formData.get("layer") || undefined,
    },
    run: (actor, data) => serverRuntime().pemesanan.catatPemakaman(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(`/staf/admin-lokasi/${lokasiId}/pesanan/${nomor}`);
  revalidatePath(`/staf/admin-lokasi/${lokasiId}/antrean`);
  revalidatePath(`/pesanan/${nomor}`);
  if (!result.value.ok) return { status: "gagal", message: catatPemakamanMessage(result.value.reason) };
  return {
    status: "berhasil",
    message: result.value.buktiPemesananNomor
      ? `Pemakaman dicatat. Pesanan selesai dengan Bukti Pemesanan ${result.value.buktiPemesananNomor}.`
      : `Pemakaman dicatat. Pesanan ${result.value.pesanan.nomor} sudah Dimakamkan.`,
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
    schema: catatPanggilanSchema,
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
