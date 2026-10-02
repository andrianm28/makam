"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { akunResource, type Actor } from "@/domain/identity";
import { batalkanWakafSchema, BERKAS_WAKAF_MAX_BYTES } from "@/domain/wakaf/skema";
import { berkasDariFile, pesanWakaf } from "@/lib/wakaf-tampilan";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "@/app/staf/form-state";

/*
 * The Wakif's own actions in Akun Saya, tab Wakaf: cancel until Menunggu Ikrar, and add documents later.
 * Both act on the signed-in Akun's own Pengajuan; the module answers "tidak ditemukan" for anyone else's.
 */

const guardPesan: Record<string, string> = {
  belum_masuk: "Sesi Anda sudah berakhir. Silakan masuk lagi.",
  perlu_totp: "Masukkan kode dari aplikasi authenticator Anda dulu.",
  tidak_berwenang: "Anda tidak berwenang melakukan ini.",
  input_tidak_valid: "Periksa lagi isian Anda.",
};

async function wakifTulis<S extends z.ZodType>(options: {
  schema: S;
  input: unknown;
  run: (wakif: { accountId: string; email: string }, data: z.infer<S>) => Promise<{ ok: true } | { ok: false; reason: string }>;
  disimpan: string;
}): Promise<FormState> {
  const hasil = await guarded({
    fitur: "wakaf",
    action: "akun.lihat",
    resource: (actor: Actor) => akunResource(actor.accountId),
    schema: options.schema,
    input: options.input,
    run: (actor, data) => options.run({ accountId: actor.accountId, email: actor.email }, data),
  });
  if (!hasil.ok) return { status: "gagal", message: guardPesan[hasil.error] ?? pesanWakaf("input_tidak_valid") };
  if (!hasil.value.ok) return { status: "gagal", message: pesanWakaf(hasil.value.reason) };
  revalidatePath("/akun/wakaf");
  return { status: "berhasil", message: options.disimpan };
}

/** The Wakif cancels a Pengajuan until Menunggu Ikrar. */
export async function batalkanWakafSaya(_sebelumnya: FormState, formData: FormData): Promise<FormState> {
  return wakifTulis({
    schema: batalkanWakafSchema,
    input: { pengajuanId: formData.get("pengajuanId"), alasan: String(formData.get("alasan") ?? "").trim() || undefined },
    run: (wakif, data) => serverRuntime().wakaf.batalkanWakaf(wakif, data),
    disimpan: "Pengajuan dibatalkan.",
  });
}

const tambahSchema = z.object({ pengajuanId: z.uuid(), kunci: z.enum(["bukti_kepemilikan", "ktp_wakif", "lainnya"]), berkas: z.instanceof(File) });

/** The Wakif adds one document to a Pengajuan after filing. */
export async function tambahBerkasSaya(_sebelumnya: FormState, formData: FormData): Promise<FormState> {
  const berkas = formData.get("berkas");
  if (!(berkas instanceof File) || berkas.size === 0) return { status: "gagal", message: "Pilih berkas yang akan diunggah." };
  if (berkas.size > BERKAS_WAKAF_MAX_BYTES) return { status: "gagal", message: pesanWakaf("berkas_tidak_didukung") };
  return wakifTulis({
    schema: tambahSchema,
    input: { pengajuanId: formData.get("pengajuanId"), kunci: formData.get("kunci"), berkas },
    run: async (wakif, data) =>
      serverRuntime().wakaf.tambahBerkasWakaf(wakif, {
        pengajuanId: data.pengajuanId,
        berkas: [await berkasDariFile(data.berkas, data.kunci)],
      }),
    disimpan: "Berkas ditambahkan.",
  });
}
