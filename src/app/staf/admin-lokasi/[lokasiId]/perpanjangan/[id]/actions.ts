"use server";

import { revalidatePath } from "next/cache";
import { lokasiMitraResource } from "@/domain/identity";
import { putuskanPermohonanSchema, setujuiPermohonanSchema } from "@/domain/perpanjangan";
import { keputusanPermohonanText } from "@/lib/permohonan-labels";
import { isi } from "@/server/form-fields";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../../../form-state";
import { guardMessage } from "../../../../messages";

function segarkan(lokasiId: string, permohonanId: string) {
  revalidatePath(`/staf/admin-lokasi/${lokasiId}/perpanjangan/${permohonanId}`);
  revalidatePath(`/staf/admin-lokasi/${lokasiId}/antrean`);
  revalidatePath(`/perpanjangan/permohonan/${permohonanId}`);
}

/**
 * The Admin Lokasi approves a manual Perpanjangan request after checking its documents: the holder or
 * contact it records, the Perlu Verifikasi completion and the 30 days all happen in the module, in one
 * transaction with their own Entri Audit each.
 */
export async function setujuiPermohonanAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  const permohonanId = String(formData.get("permohonanId") ?? "");
  const result = await guarded({
    action: "perpanjangan.periksa",
    resource: () => lokasiMitraResource(lokasiId),
    schema: setujuiPermohonanSchema,
    input: { permohonanId, alasan: formData.get("alasan"), ...isi(formData, "nama"), ...isi(formData, "nomorTelepon"), ...isi(formData, "endDate") },
    run: (actor, data) => serverRuntime().perpanjangan.setujuiPermohonan(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  segarkan(lokasiId, permohonanId);
  if (!result.value.ok) return { status: "gagal", message: keputusanPermohonanText(result.value) };
  return { status: "berhasil", message: "Permohonan disetujui. Pemohon punya 30 hari untuk memilih masa dan membayar Tagihan." };
}

/** The Admin Lokasi rejects a request with a reason the applicant reads. */
export async function tolakPermohonanAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  const permohonanId = String(formData.get("permohonanId") ?? "");
  const result = await guarded({
    action: "perpanjangan.periksa",
    resource: () => lokasiMitraResource(lokasiId),
    schema: putuskanPermohonanSchema,
    input: { permohonanId, alasan: formData.get("alasan") },
    run: (actor, data) => serverRuntime().perpanjangan.tolakPermohonan(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  segarkan(lokasiId, permohonanId);
  if (!result.value.ok) return { status: "gagal", message: keputusanPermohonanText(result.value) };
  return { status: "berhasil", message: "Permohonan ditolak." };
}

/** The Admin Lokasi sends a request back with what to fix; it shows in the applicant's Perlu tindakan. */
export async function mintaPerbaikanAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  const permohonanId = String(formData.get("permohonanId") ?? "");
  const result = await guarded({
    action: "perpanjangan.periksa",
    resource: () => lokasiMitraResource(lokasiId),
    schema: putuskanPermohonanSchema,
    input: { permohonanId, alasan: formData.get("alasan") },
    run: (actor, data) => serverRuntime().perpanjangan.mintaPerbaikanPermohonan(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  segarkan(lokasiId, permohonanId);
  if (!result.value.ok) return { status: "gagal", message: keputusanPermohonanText(result.value) };
  return { status: "berhasil", message: "Permohonan dikembalikan ke pemohon untuk diperbaiki." };
}
