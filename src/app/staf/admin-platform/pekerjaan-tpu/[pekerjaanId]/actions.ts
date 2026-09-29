"use server";

import { revalidatePath } from "next/cache";
import { pekerjaanTpuSemuaResource } from "@/domain/identity";
import { lepasPenugasanSchema, tugaskanMitraJasaSchema } from "@/domain/layanan/tpu-skema";
import { penugasanMessages } from "@/lib/layanan-tpu-labels";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../../form-state";
import { guardMessage } from "../../../messages";

/*
 * Admin Platform's two steps on one TPU job (spec, Layanan > Mitra Jasa): hand it to a
 * Mitra Jasa the picker offers, or take it off the one who holds it. Each is `guarded()`
 * (session, role, the module's own Zod schema) and then one call into the Layanan
 * module; the picker's filter and the accept deadline are the module's, not this file's.
 */

const LIST = "/staf/admin-platform/pekerjaan-tpu";
const field = (formData: FormData, name: string) => String(formData.get(name) ?? "");

function refused(reason: keyof typeof penugasanMessages): FormState {
  return { status: "gagal", message: reason === "tidak_berwenang" || reason === "perlu_totp" ? guardMessage(reason) : penugasanMessages[reason] };
}

/** Admin Platform hands the job to one Mitra Jasa, who is told by push and email and must answer by the deadline. */
export async function tugaskanMitraJasa(_previous: FormState, formData: FormData): Promise<FormState> {
  const pekerjaanId = field(formData, "pekerjaanId");
  const hasil = await guarded({
    action: "pekerjaan_tpu.kelola",
    resource: () => pekerjaanTpuSemuaResource(),
    schema: tugaskanMitraJasaSchema,
    input: { pekerjaanId, mitraJasaId: field(formData, "mitraJasaId") },
    run: (actor, data) => serverRuntime().layanan.tugaskanMitraJasa(actor, data),
  });
  if (!hasil.ok) return refused(hasil.error);
  if (!hasil.value.ok) return refused(hasil.value.reason);
  revalidatePath(LIST);
  revalidatePath(`${LIST}/${pekerjaanId}`);
  return { status: "berhasil", message: "Pekerjaan ditugaskan. Mitra Jasa diberi tahu lewat push dan email." };
}

/** Admin Platform takes the job off its Mitra Jasa (flagged for reassignment), with the reason. */
export async function lepasPenugasan(_previous: FormState, formData: FormData): Promise<FormState> {
  const pekerjaanId = field(formData, "pekerjaanId");
  const hasil = await guarded({
    action: "pekerjaan_tpu.kelola",
    resource: () => pekerjaanTpuSemuaResource(),
    schema: lepasPenugasanSchema,
    input: { pekerjaanId, alasan: field(formData, "alasan") },
    run: (actor, data) => serverRuntime().layanan.lepasPenugasan(actor, data),
  });
  if (!hasil.ok) return refused(hasil.error);
  if (!hasil.value.ok) return refused(hasil.value.reason);
  revalidatePath(LIST);
  revalidatePath(`${LIST}/${pekerjaanId}`);
  return { status: "berhasil", message: "Pekerjaan dilepas. Tugaskan ke Mitra Jasa lain." };
}
