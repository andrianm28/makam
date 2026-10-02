"use server";

import { revalidatePath } from "next/cache";
import { keluhanLayananResource } from "@/domain/identity";
import { kirimPesanThreadSchema } from "@/domain/layanan/pesanan-schema";
import { pesanThreadMessages, type PesanThreadState } from "@/lib/thread-labels";
import { guarded } from "@/server/guard";
import { inputPesanThread } from "@/server/thread-form";
import { serverRuntime } from "@/server/runtime";

/**
 * Admin Platform steps into the thread of any job, at a Lokasi Mitra or a DKI TPU. Thin, in order: authenticate,
 * check the role, validate with Zod, call the Layanan module — which decides the thread is open and who may write.
 * The role check here is the Keluhan one (Admin Platform alone); the module checks the job's own resource again.
 */
export async function kirimPesanThreadPlatform(_previous: PesanThreadState, formData: FormData): Promise<PesanThreadState> {
  const pekerjaanId = String(formData.get("pekerjaanId") ?? "");
  const result = await guarded({
    action: "keluhan.kelola",
    resource: () => keluhanLayananResource(),
    schema: kirimPesanThreadSchema,
    input: await inputPesanThread(formData),
    run: (actor, data) => serverRuntime().layanan.kirimPesanStaf(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: pesanThreadMessages[result.error] ?? "Periksa lagi isian Anda." };
  revalidatePath(`/staf/admin-platform/thread/${pekerjaanId}`);
  if (!result.value.ok) return { status: "gagal", message: pesanThreadMessages[result.value.reason] ?? "Pesan gagal dikirim." };
  return { status: "berhasil", message: "Pesan terkirim. Pemesan diberi tahu lewat email." };
}
