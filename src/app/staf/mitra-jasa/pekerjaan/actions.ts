"use server";

import { revalidatePath } from "next/cache";
import { akunResource } from "@/domain/identity";
import { jawabPenugasanSchema } from "@/domain/layanan/tpu-skema";
import { penugasanMessages } from "@/lib/layanan-tpu-labels";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../form-state";
import { guardMessage } from "../../messages";

/*
 * The Mitra Jasa answers a job handed to them (spec, story 176): accept or decline in
 * the app, by the accept deadline. `guarded()` resolves the Akun from the session
 * cookie itself and checks it holds the Mitra Jasa role on its own Akun; the module
 * then checks that the assignment is theirs and still open.
 */

const field = (formData: FormData, name: string) => String(formData.get(name) ?? "");

/** The Mitra Jasa accepts or declines one job. A decline may carry the reason. */
export async function jawabPenugasan(_previous: FormState, formData: FormData): Promise<FormState> {
  const hasil = await guarded({
    fitur: "mitra_jasa",
    action: "pekerjaan_tpu.jawab",
    resource: (actor) => akunResource(actor.accountId),
    schema: jawabPenugasanSchema,
    input: { pekerjaanId: field(formData, "pekerjaanId"), jawaban: field(formData, "jawaban"), alasan: field(formData, "alasan") || null },
    run: (actor, data) => serverRuntime().layanan.jawabPenugasan(actor, data),
  });
  if (!hasil.ok) return { status: "gagal", message: guardMessage(hasil.error) };
  if (!hasil.value.ok) {
    const { reason } = hasil.value;
    return { status: "gagal", message: reason === "tidak_berwenang" || reason === "perlu_totp" ? guardMessage(reason) : penugasanMessages[reason] };
  }
  revalidatePath("/staf/mitra-jasa/pekerjaan");
  return {
    status: "berhasil",
    message: hasil.value.hasil === "diterima" ? "Pekerjaan diterima. Keluarga melihat nama depan dan foto Anda." : "Pekerjaan ditolak. Admin Platform akan menugaskannya ke orang lain.",
  };
}
