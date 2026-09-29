"use server";

import { revalidatePath } from "next/cache";
import { lokasiMitraResource } from "@/domain/identity";
import { konfirmasiTerencanaSchema, tolakTerencanaSchema } from "@/domain/pemesanan";
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
