"use server";

import { revalidatePath } from "next/cache";
import { pekerjaanTpuSemuaResource } from "@/domain/identity";
import { putuskanKeluhanTpuSchema } from "@/domain/layanan/tpu-skema";
import { putuskanKeluhanTpuMessages } from "@/lib/layanan-tpu-labels";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../../form-state";
import { refusalMessage } from "../../../messages";

/**
 * Admin Platform decides one Keluhan on a TPU job (ticket 57): rejected, or a redo by the Mitra Jasa it names.
 * Thin, in order: authenticate, check the role, validate with Zod, call the Layanan module, which is where the
 * redo is handed over and its pay rules follow from the decision.
 */
export async function putuskanKeluhanTpuAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const keluhanId = String(formData.get("keluhanId") ?? "");
  const mitraJasaId = String(formData.get("mitraJasaId") ?? "");
  const hasil = await guarded({
    action: "pekerjaan_tpu.kelola",
    resource: () => pekerjaanTpuSemuaResource(),
    schema: putuskanKeluhanTpuSchema,
    input: { keluhanId, keputusan: formData.get("keputusan"), catatan: formData.get("catatan"), mitraJasaId: mitraJasaId === "" ? undefined : mitraJasaId },
    run: (actor, data) => serverRuntime().layanan.putuskanKeluhanTpu(actor, data),
  });
  const gagal = !hasil.ok ? hasil.error : !hasil.value.ok ? hasil.value.reason : null;
  revalidatePath(`/staf/admin-platform/keluhan-tpu/${keluhanId}`);
  revalidatePath("/staf/admin-platform/antrean");
  if (gagal) return { status: "gagal", message: refusalMessage(gagal, putuskanKeluhanTpuMessages) };
  return { status: "berhasil", message: "Keputusan tersimpan." };
}
