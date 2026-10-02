"use server";

import { revalidatePath } from "next/cache";
import { lokasiMitraResource } from "@/domain/identity";
import { mintaPerbaikanPermintaanHakPakaiSchema, setujuiPermintaanHakPakaiSchema, tolakPermintaanHakPakaiSchema } from "@/domain/pemesanan/skema-permintaan-hak-pakai";
import { permintaanHakPakaiText } from "@/lib/permintaan-hak-pakai-labels";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../../../form-state";
import { guardMessage } from "../../../../messages";

function segarkan(lokasiId: string, id: string) {
  revalidatePath(`/staf/admin-lokasi/${lokasiId}/permintaan/${id}`);
  revalidatePath(`/staf/admin-lokasi/${lokasiId}/antrean`);
  revalidatePath(`/staf/admin-lokasi/${lokasiId}/denah`, "layout");
}

/** Setuju: a Pengembalian ends the Hak Pakai and frees the Petak; a Ganti moves it to the new holder (history kept), noting the fee collected offline. */
export async function setujuiPermintaanAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  const id = String(formData.get("id") ?? "");
  const biaya = String(formData.get("biayaGantiOffline") ?? "").trim();
  const result = await guarded({
    fitur: "perpanjangan_lanjutan",
    action: "permintaan_hak_pakai.putuskan",
    resource: () => lokasiMitraResource(lokasiId),
    schema: setujuiPermintaanHakPakaiSchema,
    input: { id, ...(biaya === "" ? {} : { biayaGantiOffline: Number(biaya.replace(/\D/g, "")) }) },
    run: (actor, data) => serverRuntime().pemesanan.setujuiPermintaanHakPakai(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  segarkan(lokasiId, id);
  if (!result.value.ok) return { status: "gagal", message: permintaanHakPakaiText(result.value.reason) };
  return { status: "berhasil", message: "Permintaan disetujui." };
}

/** Tolak, with the reason the family reads. */
export async function tolakPermintaanAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  const id = String(formData.get("id") ?? "");
  const result = await guarded({
    fitur: "perpanjangan_lanjutan",
    action: "permintaan_hak_pakai.putuskan",
    resource: () => lokasiMitraResource(lokasiId),
    schema: tolakPermintaanHakPakaiSchema,
    input: { id, alasan: formData.get("alasan") },
    run: (actor, data) => serverRuntime().pemesanan.tolakPermintaanHakPakai(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  segarkan(lokasiId, id);
  if (!result.value.ok) return { status: "gagal", message: permintaanHakPakaiText(result.value.reason) };
  return { status: "berhasil", message: "Permintaan ditolak." };
}

/** Kirim kembali (Perlu Perbaikan): what to fix; it shows in the family's Perlu tindakan. */
export async function mintaPerbaikanPermintaanAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  const id = String(formData.get("id") ?? "");
  const result = await guarded({
    fitur: "perpanjangan_lanjutan",
    action: "permintaan_hak_pakai.putuskan",
    resource: () => lokasiMitraResource(lokasiId),
    schema: mintaPerbaikanPermintaanHakPakaiSchema,
    input: { id, catatan: formData.get("catatan") },
    run: (actor, data) => serverRuntime().pemesanan.mintaPerbaikanPermintaanHakPakai(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  segarkan(lokasiId, id);
  if (!result.value.ok) return { status: "gagal", message: permintaanHakPakaiText(result.value.reason) };
  return { status: "berhasil", message: "Permintaan dikembalikan ke Pemegang Hak untuk diperbaiki." };
}
