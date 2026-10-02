"use server";

import { revalidatePath } from "next/cache";
import { pemesananResource } from "@/domain/identity";
import { jawabTpuLainSchema } from "@/domain/pengurusan";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../staf/form-state";
import { guardMessage } from "../../staf/messages";

/**
 * The Pemesan answers Admin Platform's offer of another TPU: accepting moves the
 * order onto it and starts the confirmation clock again, declining makes the
 * order Ditolak. Their own answer to their own order, so the guard's resource is
 * their own Akun and the domain call takes no actor.
 */
export async function jawabTpuLain(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
    fitur: "tpu",
    action: "pemesanan.lihat",
    resource: (actor) => pemesananResource(actor.accountId),
    schema: jawabTpuLainSchema,
    input: { nomor: formData.get("nomor"), diterima: formData.get("diterima") === "ya" },
    run: (actor, data) => serverRuntime().pengurusan.jawabTpuLain({ accountId: actor.accountId }, data),
  });

  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  const nomor = String(formData.get("nomor") ?? "");
  revalidatePath(`/pengurusan/${nomor}`);
  if (!result.value.ok) {
    const message: Record<string, string> = {
      pengurusan_tidak_ditemukan: "Pengurusan ini tidak ditemukan.",
      tidak_ada_tawaran: "Tawaran TPU lain sudah tidak berlaku.",
    };
    return { status: "gagal", message: message[result.value.reason] ?? "Gagal menjawab tawaran." };
  }
  return result.value.status === "ditolak"
    ? { status: "berhasil", message: "Tawaran ditolak. Pilih TPU lain dari daftar pengurusan." }
    : { status: "berhasil", message: `Tawaran diterima. Pengurusan diteruskan ke ${result.value.tpu.name}.` };
}
