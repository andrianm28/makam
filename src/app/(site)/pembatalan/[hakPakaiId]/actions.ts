"use server";

import { revalidatePath } from "next/cache";
import { pemesananResource } from "@/domain/identity";
import {
  ajukanPembatalanTerencanaSchema,
  ajukanUlangPembatalanTerencanaSchema,
  permintaanPembatalanTerencanaSchema,
} from "@/domain/pemesanan";
import { pembatalanFamilyMessage } from "@/lib/pembatalan-labels";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";

export type PembatalanActionState = { status: "idle" } | { status: "gagal"; message: string } | { status: "berhasil"; message: string };

/** The Makam tab, the request's page and the order page all show a request: a change refreshes them together. */
function segarkan(hakPakaiId: string, nomor?: string): void {
  revalidatePath(`/pembatalan/${hakPakaiId}`);
  revalidatePath("/akun/makam");
  if (nomor) revalidatePath(`/pesanan/${nomor}`);
}

/**
 * "Ajukan Pembatalan" (spec, story 102): the Pemegang Hak of a paid Terencana order's Hak Pakai asks to
 * cancel it. The refund is computed by the module from the order's own Syarat; this only carries the
 * caller and the note to it.
 */
export async function ajukanPembatalanAction(_previous: PembatalanActionState, formData: FormData): Promise<PembatalanActionState> {
  const hakPakaiId = String(formData.get("hakPakaiId") ?? "");
  const result = await guarded({
    action: "pembatalan.ajukan",
    resource: (actor) => pemesananResource(actor.accountId),
    schema: ajukanPembatalanTerencanaSchema,
    input: { hakPakaiId, catatan: formData.get("catatan") ?? "" },
    run: (actor, data) => serverRuntime().pemesanan.ajukanPembatalanTerencana({ accountId: actor.accountId, email: actor.email }, data),
  });
  if (!result.ok) return { status: "gagal", message: pembatalanFamilyMessage(result.error) };
  segarkan(hakPakaiId, result.value.ok ? result.value.permintaan.nomor : undefined);
  if (!result.value.ok) return { status: "gagal", message: pembatalanFamilyMessage(result.value.reason) };
  return { status: "berhasil", message: "Permintaan Pembatalan terkirim. Lokasi Mitra menjawab dalam 2 hari kerja, dan jawabannya datang ke email Anda." };
}

/** The Pemegang Hak files a request the Lokasi Mitra sent back for a fix again (Perlu Perbaikan ↺ Diajukan). */
export async function ajukanUlangPembatalanAction(_previous: PembatalanActionState, formData: FormData): Promise<PembatalanActionState> {
  const hakPakaiId = String(formData.get("hakPakaiId") ?? "");
  const result = await guarded({
    action: "pembatalan.ajukan",
    resource: (actor) => pemesananResource(actor.accountId),
    schema: ajukanUlangPembatalanTerencanaSchema,
    input: { id: formData.get("id"), catatan: formData.get("catatan") ?? "" },
    run: (actor, data) => serverRuntime().pemesanan.ajukanUlangPembatalanTerencana({ accountId: actor.accountId, email: actor.email }, data),
  });
  if (!result.ok) return { status: "gagal", message: pembatalanFamilyMessage(result.error) };
  segarkan(hakPakaiId, result.value.ok ? result.value.permintaan.nomor : undefined);
  if (!result.value.ok) return { status: "gagal", message: pembatalanFamilyMessage(result.value.reason) };
  return { status: "berhasil", message: "Permintaan diajukan kembali. Lokasi Mitra menjawab dalam 2 hari kerja." };
}

/** The Pemegang Hak withdraws the request before a decision: nothing on the Hak Pakai changed, and it may be asked again. */
export async function batalkanPermintaanPembatalanAction(_previous: PembatalanActionState, formData: FormData): Promise<PembatalanActionState> {
  const hakPakaiId = String(formData.get("hakPakaiId") ?? "");
  const result = await guarded({
    action: "pembatalan.ajukan",
    resource: (actor) => pemesananResource(actor.accountId),
    schema: permintaanPembatalanTerencanaSchema,
    input: { id: formData.get("id") },
    run: (actor, data) => serverRuntime().pemesanan.batalkanPermintaanPembatalanTerencana({ accountId: actor.accountId, email: actor.email }, data),
  });
  if (!result.ok) return { status: "gagal", message: pembatalanFamilyMessage(result.error) };
  segarkan(hakPakaiId, result.value.ok ? result.value.permintaan.nomor : undefined);
  if (!result.value.ok) return { status: "gagal", message: pembatalanFamilyMessage(result.value.reason) };
  return { status: "berhasil", message: "Permintaan ditarik. Hak Pakai Anda tidak berubah." };
}
