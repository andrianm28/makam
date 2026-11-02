"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { akunResource } from "@/domain/identity";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "@/app/staf/form-state";

/** The family cancels its own Permintaan Kedukaan while it is Diajukan (ADR 0010); anyone else's reads as not found. */
export async function batalkanKedukaanSaya(_sebelumnya: FormState, formData: FormData): Promise<FormState> {
  const hasil = await guarded({
    fitur: "inti",
    action: "akun.lihat",
    resource: (actor) => akunResource(actor.accountId),
    schema: z.object({ permintaanId: z.uuid() }),
    input: { permintaanId: formData.get("permintaanId") },
    run: (actor, data) => serverRuntime().kedukaan.batalkanSaya(actor.accountId, data.permintaanId),
  });
  if (!hasil.ok) return { status: "gagal", message: hasil.error === "belum_masuk" ? "Sesi Anda sudah berakhir. Silakan masuk lagi." : "Permintaan tidak dapat dibatalkan." };
  if (!hasil.value.ok) {
    return { status: "gagal", message: hasil.value.reason === "tidak_bisa_dibatalkan" ? "Tim kami sudah menghubungi Anda; untuk membatalkan, hubungi kami kembali." : "Permintaan tidak ditemukan." };
  }
  revalidatePath("/akun/kedukaan");
  return { status: "berhasil", message: "Permintaan dibatalkan." };
}
