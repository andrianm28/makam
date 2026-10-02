"use server";

import { revalidatePath } from "next/cache";
import { lokasiMitraResource } from "@/domain/identity";
import { akhiriHakPakaiManualSchema, catatPembongkaranSchema } from "@/domain/inventory";
import { akhiriHakPakaiText, pembongkaranText } from "@/lib/hak-pakai-akhir-labels";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../../../form-state";
import { guardMessage } from "../../../../messages";

function segarkan(lokasiId: string, hakPakaiId: string) {
  revalidatePath(`/staf/admin-lokasi/${lokasiId}/hak-pakai/${hakPakaiId}`);
  revalidatePath(`/staf/admin-lokasi/${lokasiId}/antrean`);
  revalidatePath(`/staf/admin-lokasi/${lokasiId}/denah`, "layout");
}

/** The Admin Lokasi ends a Hak Pakai by hand with a reason; the plot stays Terisi until the Pembongkaran. */
export async function akhiriHakPakaiAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  const hakPakaiId = String(formData.get("hakPakaiId") ?? "");
  const result = await guarded({
    fitur: "inti",
    action: "hak_pakai.akhiri",
    resource: () => lokasiMitraResource(lokasiId),
    schema: akhiriHakPakaiManualSchema,
    input: { hakPakaiId, alasan: formData.get("alasan") },
    run: (actor, data) => serverRuntime().inventory.akhiriHakPakaiManual(actor, lokasiId, data),
  });
  if (!result.ok) return { status: "gagal", message: result.error === "input_tidak_valid" ? akhiriHakPakaiText("input_tidak_valid") : guardMessage(result.error) };
  segarkan(lokasiId, hakPakaiId);
  if (!result.value.ok) return { status: "gagal", message: akhiriHakPakaiText(result.value.reason) };
  return { status: "berhasil", message: "Hak Pakai berakhir. Petak tetap Terisi sampai Pembongkaran dicatat." };
}

/** The Admin Lokasi records that the grave was cleared; only then is the Petak Tersedia again. */
export async function catatPembongkaranAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  const hakPakaiId = String(formData.get("hakPakaiId") ?? "");
  const result = await guarded({
    fitur: "inti",
    action: "hak_pakai.catat_pembongkaran",
    resource: () => lokasiMitraResource(lokasiId),
    schema: catatPembongkaranSchema,
    input: { hakPakaiId },
    run: (actor, data) => serverRuntime().inventory.catatPembongkaran(actor, lokasiId, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  segarkan(lokasiId, hakPakaiId);
  if (!result.value.ok) return { status: "gagal", message: pembongkaranText(result.value.reason) };
  return { status: "berhasil", message: "Pembongkaran tercatat. Petak Tersedia lagi." };
}
