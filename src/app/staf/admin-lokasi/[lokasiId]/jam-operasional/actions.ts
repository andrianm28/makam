"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { lokasiMitraResource, type Actor } from "@/domain/identity";
import { weekdays, type JamOperasional, type PickKontakSiagaResult, type SetJamOperasionalResult } from "@/domain/lokasi";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../../form-state";
import { guardMessage } from "../../../messages";

type Refused<T> = T extends { ok: false; reason: infer R } ? R : never;

const refusalMessages: Record<Refused<SetJamOperasionalResult | PickKontakSiagaResult>, string> = {
  tidak_berwenang: guardMessage("tidak_berwenang"),
  perlu_totp: guardMessage("perlu_totp"),
  tidak_ditemukan: "Lokasi Mitra ini tidak ditemukan.",
  jam_operasional_tidak_valid:
    "Periksa lagi Jam Operasional: jam buka harus sebelum jam tutup, minimal satu hari buka, dan setiap tanggal tutup hanya sekali.",
  bukan_admin_lokasi_di_sini: "Kontak Siaga harus salah satu Admin Lokasi di Lokasi ini.",
};

/**
 * One form on the Jam Operasional screen: `guarded()` (the actor, Jam
 * Operasional and Kontak Siaga on the Lokasi the form names, `schema`), then
 * the Lokasi module.
 */
async function operasionalWrite<S extends z.ZodType<{ lokasiId: string }>>(options: {
  schema: S;
  input: { lokasiId: FormDataEntryValue | null } & Record<string, unknown>;
  run: (actor: Actor, data: z.infer<S>) => Promise<SetJamOperasionalResult | PickKontakSiagaResult>;
  saved: string;
  invalidInput: string;
}): Promise<FormState> {
  const { input } = options;
  const result = await guarded({
    action: "lokasi.atur_operasional",
    resource: () => lokasiMitraResource(typeof input.lokasiId === "string" ? input.lokasiId : ""),
    schema: options.schema,
    input,
    run: async (actor, data) => ({ lokasiId: data.lokasiId, written: await options.run(actor, data) }),
  });
  if (!result.ok) {
    return { status: "gagal", message: result.error === "input_tidak_valid" ? options.invalidInput : guardMessage(result.error) };
  }
  const { lokasiId, written } = result.value;
  if (!written.ok) return { status: "gagal", message: refusalMessages[written.reason] };
  revalidatePath(`/staf/admin-lokasi/${lokasiId}/jam-operasional`);
  return { status: "berhasil", message: options.saved };
}

const lokasiId = z.uuid();
const clockTime = z.string().trim().max(5);
const CLOSURE_LINE = /^(\d{4}-\d{2}-\d{2})(?:\s+(.*))?$/;

/** Dated closures typed one per line: "2026-12-25 Natal" (the note is optional); blank lines are dropped. */
const closureLines = z
  .string()
  .max(20_000)
  .transform((text, context) => {
    const closures: { date: string; note: string }[] = [];
    for (const line of text.split(/\r?\n/).map((typed) => typed.trim())) {
      if (line === "") continue;
      const match = CLOSURE_LINE.exec(line);
      if (!match) {
        context.addIssue({ code: "custom", message: "closure line" });
        return z.NEVER;
      }
      closures.push({ date: match[1], note: (match[2] ?? "").trim() });
    }
    return closures;
  });

const jamOperasionalSchema = z.object({
  lokasiId,
  closures: closureLines,
  ...Object.fromEntries(
    weekdays.flatMap((weekday) => [
      [`${weekday}Open`, z.literal("ya").optional()],
      [`${weekday}Opens`, clockTime],
      [`${weekday}Closes`, clockTime],
    ]),
  ),
}) as z.ZodType<{ lokasiId: string; closures: { date: string; note: string }[] } & Record<string, string | undefined>>;

/** The Admin Lokasi (or Admin Platform) saves the Jam Operasional: weekly hours per weekday and dated closures. */
export async function simpanJamOperasional(_previous: FormState, formData: FormData): Promise<FormState> {
  const fields = Object.fromEntries(
    weekdays.flatMap((weekday) => [
      [`${weekday}Open`, formData.get(`${weekday}Open`) ?? undefined],
      [`${weekday}Opens`, formData.get(`${weekday}Opens`) ?? ""],
      [`${weekday}Closes`, formData.get(`${weekday}Closes`) ?? ""],
    ]),
  );
  return operasionalWrite({
    schema: jamOperasionalSchema,
    input: { ...fields, lokasiId: formData.get("lokasiId"), closures: formData.get("closures") ?? "" },
    run: (actor, data) =>
      serverRuntime().lokasi.setJamOperasional(actor, data.lokasiId, {
        weekly: Object.fromEntries(
          weekdays.map((weekday) => [
            weekday,
            data[`${weekday}Open`] === "ya" ? { opens: data[`${weekday}Opens`] ?? "", closes: data[`${weekday}Closes`] ?? "" } : null,
          ]),
        ) as JamOperasional["weekly"],
        closures: data.closures,
      }),
    saved: "Jam Operasional tersimpan.",
    invalidInput: "Periksa lagi isian Anda. Tanggal tutup: satu tanggal per baris, mis. 2026-12-25 Natal.",
  });
}

const kontakSiagaSchema = z.object({ lokasiId, accountId: z.string().min(1).max(64) });

/** The Admin Lokasi (or Admin Platform) picks the Kontak Siaga from the Lokasi's Admin Lokasi. */
export async function pilihKontakSiaga(_previous: FormState, formData: FormData): Promise<FormState> {
  return operasionalWrite({
    schema: kontakSiagaSchema,
    input: { lokasiId: formData.get("lokasiId"), accountId: formData.get("accountId") },
    run: (actor, data) => serverRuntime().lokasi.pickKontakSiaga(actor, data.lokasiId, { accountId: data.accountId }),
    saved: "Kontak Siaga tersimpan.",
    invalidInput: "Pilih salah satu Admin Lokasi.",
  });
}
