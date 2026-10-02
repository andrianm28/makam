"use server";

import { revalidatePath } from "next/cache";
import { lokasiMitraResource } from "@/domain/identity";
import { akhiriHakPakaiManualSchema, catatPembongkaranSchema, ubahKontakPemegangHakSchema } from "@/domain/inventory";
import { akhiriHakPakaiText, pembongkaranText } from "@/lib/hak-pakai-akhir-labels";
import { permintaanHakPakaiText } from "@/lib/permintaan-hak-pakai-labels";
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

/** The KTP check the Admin Lokasi uploads is required: the change of a holder's contact rests on it. */
const ubahKontakDenganKtpSchema = ubahKontakPemegangHakSchema.required({ ktp: true });

/**
 * The Admin Lokasi changes the Pemegang Hak's phone number and recorded email after checking the KTP and uploading
 * that check (spec, Inventory; ADR 0004). The name and the history stay; the change is audited without the number.
 */
export async function ubahKontakPemegangHakAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  const hakPakaiId = String(formData.get("hakPakaiId") ?? "");
  const file = formData.get("ktp");
  const email = String(formData.get("email") ?? "").trim();
  if (!(file instanceof File) || file.size === 0) return { status: "gagal", message: "Unggah hasil pemeriksaan KTP (JPEG, PNG atau PDF) sebelum mengubah kontak." };
  const ktp = { body: new Uint8Array(await file.arrayBuffer()), contentType: file.type };
  const result = await guarded({
    action: "hak_pakai.ubah_pemegang",
    resource: () => lokasiMitraResource(lokasiId),
    schema: ubahKontakDenganKtpSchema,
    input: { hakPakaiId, phoneNumber: formData.get("phoneNumber"), ...(email === "" ? {} : { email }), alasan: formData.get("alasan"), ktp },
    run: (actor, data) => serverRuntime().inventory.ubahKontakPemegangHak(actor, lokasiId, data),
  });
  if (!result.ok) return { status: "gagal", message: result.error === "input_tidak_valid" ? permintaanHakPakaiText("input_tidak_valid") : guardMessage(result.error) };
  segarkan(lokasiId, hakPakaiId);
  if (!result.value.ok) {
    const alasan = result.value.reason;
    if (alasan === "nomor_telepon_tidak_valid") return { status: "gagal", message: "Nomor telepon tidak valid. Tulis nomor Indonesia, misalnya 0812 3456 7890." };
    if (alasan === "email_tidak_valid") return { status: "gagal", message: "Email tidak valid." };
    return { status: "gagal", message: permintaanHakPakaiText(alasan) };
  }
  return { status: "berhasil", message: "Kontak Pemegang Hak diubah. Tercatat di Log Audit." };
}
