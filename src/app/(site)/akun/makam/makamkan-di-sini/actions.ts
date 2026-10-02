"use server";

import { redirect } from "next/navigation";
import { pemesananResource } from "@/domain/identity";
import { ajukanTumpangSchema } from "@/domain/pemesanan";
import { tumpangMessage } from "@/lib/tumpang-labels";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";

export type MakamkanActionState = { status: "idle" } | { status: "gagal"; message: string };

/**
 * "Makamkan di sini" from the Makam keluarga hub: asks only for the Almarhum and the
 * Pemesan. The Pemesan is the signed-in Akun, so the Akun and email are taken from the
 * session, never from the form. Consent resolves in the domain; a request that waits
 * for the Pemegang Hak has Notifications email them a link.
 */
export async function ajukanTumpangAction(_previous: MakamkanActionState, formData: FormData): Promise<MakamkanActionState> {
  const result = await guarded({
    action: "pemesanan.buat",
    resource: (actor) => pemesananResource(actor.accountId),
    schema: ajukanTumpangSchema.omit({ pemesanAccountId: true, pemesanEmail: true }),
    input: {
      pemesanName: formData.get("pemesanName"),
      phoneNumber: formData.get("phoneNumber") || undefined,
      lokasiId: formData.get("lokasiId"),
      hakPakaiId: formData.get("hakPakaiId"),
      petakId: formData.get("petakId") || undefined,
      jenis: formData.get("jenis"),
      almarhumName: formData.get("almarhumName"),
      tanggalWafat: formData.get("tanggalWafat"),
      rencanaPemakamanAt: formData.get("rencanaPemakamanAt") || undefined,
      keinginanPenempatan: formData.get("keinginanPenempatan") || undefined,
    },
    run: (actor, data) => serverRuntime().pemesanan.ajukanTumpang({ ...data, pemesanAccountId: actor.accountId, pemesanEmail: actor.email }),
  });
  if (!result.ok) return { status: "gagal", message: result.error === "belum_masuk" ? "Silakan masuk lagi." : "Periksa lagi isian Anda." };
  if (!result.value.ok) return { status: "gagal", message: tumpangMessage(result.value.reason) };
  redirect(`/pesanan/${result.value.pesanan.nomor}`);
}
