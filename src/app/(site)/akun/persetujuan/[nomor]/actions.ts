"use server";

import { revalidatePath } from "next/cache";
import { pemesananResource } from "@/domain/identity";
import { jawabKonsenSchema } from "@/domain/pemesanan";
import { tumpangMessage } from "@/lib/tumpang-labels";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";

export type KonsenActionState = { status: "idle" } | { status: "gagal" | "berhasil"; message: string };

/**
 * The Pemegang Hak answers Setujui or Tolak under Perlu tindakan, signed in with the
 * usual Kode Masuk (no code of its own). The domain checks that the signed-in Akun is the
 * holder the Hak Pakai records.
 */
export async function jawabKonsenAction(_previous: KonsenActionState, formData: FormData): Promise<KonsenActionState> {
  const result = await guarded({
    fitur: "perpanjangan_lanjutan",
    action: "pemesanan.buat",
    resource: (actor) => pemesananResource(actor.accountId),
    schema: jawabKonsenSchema,
    input: { nomor: formData.get("nomor"), jawaban: formData.get("jawaban") },
    run: (actor, data) => serverRuntime().pemesanan.jawabKonsenTumpang(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: result.error === "belum_masuk" ? "Silakan masuk lagi." : "Periksa lagi isian Anda." };
  revalidatePath("/akun");
  if (!result.value.ok) return { status: "gagal", message: tumpangMessage(result.value.reason) };
  return { status: "berhasil", message: result.value.pesanan.status === "ditolak" ? "Permintaan ditolak." : "Terima kasih, persetujuan Anda tercatat." };
}
