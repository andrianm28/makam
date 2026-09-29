"use server";

import { revalidatePath } from "next/cache";
import { lokasiMitraResource } from "@/domain/identity";
import {
  konfirmasiTerencanaSchema,
  mintaPerbaikanPembatalanTerencanaSchema,
  permintaanPembatalanTerencanaSchema,
  tolakPembatalanTerencanaSchema,
  tolakTerencanaSchema,
} from "@/domain/pemesanan";
import { pembatalanStafMessage } from "@/lib/pembatalan-labels";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import { guardMessage } from "../../../../messages";
import type { PesananActionState } from "./actions";
import { konfirmasiTerencanaMessage, tolakTerencanaMessage } from "./terencana-messages";

/**
 * The Admin Lokasi confirms a Pemesanan Terencana (spec, story 46): the payment hold
 * starts and the pay-first Tagihan is issued. Nothing is chosen here, because the
 * Pemesan already picked the plots on the Denah.
 */
export async function konfirmasiTerencanaAction(_previous: PesananActionState, formData: FormData): Promise<PesananActionState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  const nomor = String(formData.get("nomor") ?? "");
  const result = await guarded({
    action: "pemesanan.konfirmasi",
    resource: () => lokasiMitraResource(lokasiId),
    schema: konfirmasiTerencanaSchema,
    input: { nomor },
    run: (actor, data) => serverRuntime().pemesanan.konfirmasiTerencana(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(`/staf/admin-lokasi/${lokasiId}/pesanan/${nomor}`);
  revalidatePath(`/staf/admin-lokasi/${lokasiId}/antrean`);
  revalidatePath(`/pesanan/${nomor}`);
  if (!result.value.ok) return { status: "gagal", message: konfirmasiTerencanaMessage(result.value.reason) };
  return {
    status: "berhasil",
    message: `Pesanan ${result.value.pesanan.nomor} dikonfirmasi. Petak ditahan dan Tagihan ${result.value.tagihan.nomorTagihan} terbit; keluarga diberi tahu lewat email.`,
  };
}

/**
 * The Admin Lokasi declines a Pemesanan Terencana with a reason off the closed list:
 * the plots are released and the family is sent back to the Lokasi step.
 */
export async function tolakTerencanaAction(_previous: PesananActionState, formData: FormData): Promise<PesananActionState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  const nomor = String(formData.get("nomor") ?? "");
  const result = await guarded({
    action: "pemesanan.tolak",
    resource: () => lokasiMitraResource(lokasiId),
    schema: tolakTerencanaSchema,
    input: { nomor, alasan: formData.get("alasan") },
    run: (actor, data) => serverRuntime().pemesanan.tolakTerencana(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(`/staf/admin-lokasi/${lokasiId}/pesanan/${nomor}`);
  revalidatePath(`/staf/admin-lokasi/${lokasiId}/antrean`);
  revalidatePath(`/pesanan/${nomor}`);
  if (!result.value.ok) return { status: "gagal", message: tolakTerencanaMessage(result.value.reason) };
  return { status: "berhasil", message: `Pesanan ${result.value.pesanan.nomor} ditolak. Petak dilepas dan keluarga diberi tahu.` };
}

/** What every answer to a Pembatalan refreshes: this order's page, the Antrean Lokasi's row, the family's order page and Admin Platform's Antrean. */
function segarkanPembatalan(lokasiId: string, nomor: string): void {
  revalidatePath(`/staf/admin-lokasi/${lokasiId}/pesanan/${nomor}`);
  revalidatePath(`/staf/admin-lokasi/${lokasiId}/antrean`);
  revalidatePath(`/pesanan/${nomor}`);
  revalidatePath("/staf/admin-platform/antrean");
}

/**
 * The Admin Lokasi confirms there is no Pemakaman and approves a Pembatalan (spec, story 125): every Hak Pakai of
 * the order is Dibatalkan, its Petak is Tersedia, the order is Dibatalkan and the refund goes to Admin Platform.
 */
export async function setujuiPembatalanTerencanaAction(_previous: PesananActionState, formData: FormData): Promise<PesananActionState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  const nomor = String(formData.get("nomor") ?? "");
  const result = await guarded({
    action: "pembatalan.putuskan",
    resource: () => lokasiMitraResource(lokasiId),
    schema: permintaanPembatalanTerencanaSchema,
    input: { id: formData.get("id") },
    run: (actor, data) => serverRuntime().pemesanan.setujuiPembatalanTerencana(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  segarkanPembatalan(lokasiId, nomor);
  if (!result.value.ok) return { status: "gagal", message: pembatalanStafMessage(result.value.reason) };
  return {
    status: "berhasil",
    message: result.value.pengembalian
      ? "Pembatalan disetujui. Hak Pakai dibatalkan, petak kembali Tersedia, dan pengembalian dana menunggu persetujuan Admin Platform."
      : "Pembatalan disetujui. Hak Pakai dibatalkan dan petak kembali Tersedia; tidak ada pengembalian dana menurut Syarat pesanan.",
  };
}

/** The Admin Lokasi declines a Pembatalan with the reason the family is told. */
export async function tolakPembatalanTerencanaAction(_previous: PesananActionState, formData: FormData): Promise<PesananActionState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  const nomor = String(formData.get("nomor") ?? "");
  const result = await guarded({
    action: "pembatalan.putuskan",
    resource: () => lokasiMitraResource(lokasiId),
    schema: tolakPembatalanTerencanaSchema,
    input: { id: formData.get("id"), alasan: formData.get("alasan") ?? "" },
    run: (actor, data) => serverRuntime().pemesanan.tolakPembatalanTerencana(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  segarkanPembatalan(lokasiId, nomor);
  if (!result.value.ok) return { status: "gagal", message: pembatalanStafMessage(result.value.reason) };
  return { status: "berhasil", message: "Pembatalan ditolak. Hak Pakai tidak berubah dan keluarga diberi tahu alasannya lewat email." };
}

/** The Admin Lokasi sends a Pembatalan back for a fix, saying what has to be fixed. */
export async function mintaPerbaikanPembatalanTerencanaAction(_previous: PesananActionState, formData: FormData): Promise<PesananActionState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  const nomor = String(formData.get("nomor") ?? "");
  const result = await guarded({
    action: "pembatalan.putuskan",
    resource: () => lokasiMitraResource(lokasiId),
    schema: mintaPerbaikanPembatalanTerencanaSchema,
    input: { id: formData.get("id"), catatan: formData.get("catatan") ?? "" },
    run: (actor, data) => serverRuntime().pemesanan.mintaPerbaikanPembatalanTerencana(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  segarkanPembatalan(lokasiId, nomor);
  if (!result.value.ok) return { status: "gagal", message: pembatalanStafMessage(result.value.reason) };
  return { status: "berhasil", message: "Permintaan dikembalikan ke keluarga untuk diperbaiki. Barisnya kembali ke Antrean Lokasi setelah diajukan kembali." };
}
