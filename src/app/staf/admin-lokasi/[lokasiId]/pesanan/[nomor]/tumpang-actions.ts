"use server";

import { revalidatePath } from "next/cache";
import { lokasiMitraResource } from "@/domain/identity";
import { catatKonsenSchema, konfirmasiTumpangSchema } from "@/domain/pemesanan";
import { tumpangMessage } from "@/lib/tumpang-labels";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import { guardMessage } from "../../../../messages";

export type TumpangActionState = { status: "idle" } | { status: "gagal" | "berhasil"; message: string };

/** The Admin Lokasi logs the Pemegang Hak's verbal consent, or the heirship proof brought on the day (which raises the Ganti Pemegang Hak reminder). */
export async function catatKonsenTumpangAction(_previous: TumpangActionState, formData: FormData): Promise<TumpangActionState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  const result = await guarded({
    fitur: "perpanjangan_lanjutan",
    action: "pemesanan.konfirmasi",
    resource: () => lokasiMitraResource(lokasiId),
    schema: catatKonsenSchema,
    input: { nomor: formData.get("nomor"), via: formData.get("via"), catatan: formData.get("catatan"), buktiFileKey: formData.get("buktiFileKey") || undefined },
    run: (actor, data) => serverRuntime().pemesanan.catatKonsenTumpang(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(`/staf/admin-lokasi/${lokasiId}/pesanan/${String(formData.get("nomor") ?? "")}`);
  if (!result.value.ok) return { status: "gagal", message: tumpangMessage(result.value.reason) };
  return { status: "berhasil", message: "Persetujuan Pemegang Hak dicatat." };
}

/** The Admin Lokasi confirms the further burial: tumpang checks, then the pay-after Tagihan. */
export async function konfirmasiTumpangAction(_previous: TumpangActionState, formData: FormData): Promise<TumpangActionState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  const result = await guarded({
    fitur: "perpanjangan_lanjutan",
    action: "pemesanan.konfirmasi",
    resource: () => lokasiMitraResource(lokasiId),
    schema: konfirmasiTumpangSchema,
    input: { nomor: formData.get("nomor"), pemakamanAt: formData.get("pemakamanAt") },
    run: (actor, data) => serverRuntime().pemesanan.konfirmasiTumpang(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(`/staf/admin-lokasi/${lokasiId}/pesanan/${String(formData.get("nomor") ?? "")}`);
  revalidatePath(`/staf/admin-lokasi/${lokasiId}/antrean`);
  if (!result.value.ok) return { status: "gagal", message: "reason" in result.value ? tumpangMessage(result.value.reason) : guardMessage("tidak_berwenang") };
  return { status: "berhasil", message: `Pesanan ${result.value.pesanan.nomor} dikonfirmasi. Tagihan ${result.value.tagihan.nomorTagihan} terbit.` };
}
