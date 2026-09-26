"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hariLiburNasionalResource, type Actor } from "@/domain/identity";
import type { AddNationalHolidayResult, RemoveNationalHolidayResult } from "@/domain/lokasi";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../form-state";
import { guardMessage } from "../../messages";

type Refused<T> = T extends { ok: false; reason: infer R } ? R : never;

const refusalMessages: Record<Refused<AddNationalHolidayResult | RemoveNationalHolidayResult>, string> = {
  tidak_berwenang: guardMessage("tidak_berwenang"),
  perlu_totp: guardMessage("perlu_totp"),
  tidak_ditemukan: "Tanggal ini tidak ada di daftar hari libur nasional.",
  hari_libur_tidak_valid: "Isi tanggal yang benar dan nama hari liburnya.",
  hari_libur_sudah_ada: "Tanggal ini sudah ada di daftar hari libur nasional.",
};

async function hariLiburWrite<S extends z.ZodType, R extends AddNationalHolidayResult | RemoveNationalHolidayResult>(options: {
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

const date = z.string().trim().max(10);

/** Admin Platform adds a national holiday to the Admin Platform working-day calendar. */
export async function tambahHariLibur(_previous: FormState, formData: FormData): Promise<FormState> {
  return hariLiburWrite({
    schema: z.object({ date, name: z.string().trim().max(120) }),
    input: { date: formData.get("date"), name: formData.get("name") },
    run: (actor, data) => serverRuntime().lokasi.addNationalHoliday(actor, data),
    saved: "Hari libur nasional ditambahkan.",
  });
}

/** Admin Platform removes a national holiday from the list. */
export async function hapusHariLibur(_previous: FormState, formData: FormData): Promise<FormState> {
  return hariLiburWrite({
    schema: z.object({ date, reason: z.string().trim().max(500) }),
    input: { date: formData.get("date"), reason: formData.get("reason") ?? "" },
    run: (actor, data) => serverRuntime().lokasi.removeNationalHoliday(actor, { date: data.date, reason: data.reason || null }),
    saved: "Hari libur nasional dihapus.",
  });
}
