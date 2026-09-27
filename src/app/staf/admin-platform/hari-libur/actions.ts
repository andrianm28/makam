"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hariLiburNasionalResource, type Actor } from "@/domain/identity";
import {
  hariLiburNasionalSchema,
  type AddHariLiburNasionalResult,
  type RemoveHariLiburNasionalResult,
} from "@/domain/lokasi";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../form-state";
import { guardMessage } from "../../messages";
import { hapusHariLiburSchema } from "./schema";

type Refused<T> = T extends { ok: false; reason: infer R } ? R : never;

const refusalMessages: Record<Refused<AddHariLiburNasionalResult | RemoveHariLiburNasionalResult>, string> = {
  tidak_berwenang: guardMessage("tidak_berwenang"),
  perlu_totp: guardMessage("perlu_totp"),
  tidak_ditemukan: "Tanggal ini tidak ada di daftar Hari Libur Nasional.",
  hari_libur_tidak_valid: "Isi tanggal yang benar dan nama hari liburnya.",
  hari_libur_sudah_ada: "Tanggal ini sudah ada di daftar Hari Libur Nasional.",
};

async function hariLiburWrite<S extends z.ZodType, R extends AddHariLiburNasionalResult | RemoveHariLiburNasionalResult>(options: {
  schema: S;
  input: Record<string, unknown>;
  run: (actor: Actor, data: z.infer<S>) => Promise<R>;
  saved: string;
}): Promise<FormState> {
  const result = await guarded({
    action: "hari_libur.ubah",
    resource: () => hariLiburNasionalResource(),
    schema: options.schema,
    input: options.input,
    run: options.run,
  });
  if (!result.ok) {
    const message = result.error === "input_tidak_valid" ? refusalMessages.hari_libur_tidak_valid : guardMessage(result.error);
    return { status: "gagal", message };
  }
  if (!result.value.ok) return { status: "gagal", message: refusalMessages[result.value.reason] };
  revalidatePath("/staf/admin-platform/hari-libur");
  return { status: "berhasil", message: options.saved };
}

/** Admin Platform adds a Hari Libur Nasional to the list (the Admin Platform Hari Kerja calendar). */
export async function tambahHariLibur(_previous: FormState, formData: FormData): Promise<FormState> {
  return hariLiburWrite({
    schema: hariLiburNasionalSchema,
    input: { date: formData.get("date"), name: formData.get("name") },
    run: (actor, data) => serverRuntime().lokasi.addHariLiburNasional(actor, data),
    saved: "Hari Libur Nasional ditambahkan.",
  });
}

/** Admin Platform removes a Hari Libur Nasional from the list. */
export async function hapusHariLibur(_previous: FormState, formData: FormData): Promise<FormState> {
  return hariLiburWrite({
    schema: hapusHariLiburSchema,
    input: { date: formData.get("date"), reason: formData.get("reason") ?? "" },
    run: (actor, data) => serverRuntime().lokasi.removeHariLiburNasional(actor, { date: data.date, reason: data.reason || null }),
    saved: "Hari Libur Nasional dihapus.",
  });
}
