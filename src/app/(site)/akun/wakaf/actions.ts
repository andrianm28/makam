"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { akunResource, type Actor } from "@/domain/identity";
import { batalkanWakafSchema, BERKAS_WAKAF_MAX_BYTES } from "@/domain/wakaf/skema";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "@/app/staf/form-state";

/*
 * The Wakif's own actions in Akun Saya, tab Wakaf: cancel until Menunggu Ikrar, and add documents later.
 * Both act on the signed-in Akun's own Pengajuan; the module answers "tidak ditemukan" for anyone else's.
 */

const pesan: Record<string, string> = {
  input_tidak_valid: "Periksa lagi isian Anda.",
  pengajuan_tidak_ditemukan: "Pengajuan ini tidak ditemukan.",
  tidak_dapat_dibatalkan: "Pengajuan sudah melewati tahap yang bisa dibatalkan.",
  pengajuan_sudah_ditutup: "Pengajuan ini sudah selesai atau ditutup.",
  berkas_tidak_didukung: "Berkas harus PDF, JPG atau PNG, paling besar 8 MB.",
  penyimpanan_belum_tersedia: "Penyimpanan berkas belum tersedia. Coba lagi nanti.",
};

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
    action: "akun.lihat",
    resource: (actor: Actor) => akunResource(actor.accountId),
    schema: options.schema,
    input: options.input,
    run: (actor, data) => options.run({ accountId: actor.accountId, email: actor.email }, data),
  });
  if (!hasil.ok) return { status: "gagal", message: guardPesan[hasil.error] ?? guardPesan.input_tidak_valid! };
  if (!hasil.value.ok) return { status: "gagal", message: pesan[hasil.value.reason] ?? pesan.input_tidak_valid! };
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
  if (berkas.size > BERKAS_WAKAF_MAX_BYTES) return { status: "gagal", message: pesan.berkas_tidak_didukung! };
  return wakifTulis({
    schema: tambahSchema,
    input: { pengajuanId: formData.get("pengajuanId"), kunci: formData.get("kunci"), berkas },
    run: async (wakif, data) =>
      serverRuntime().wakaf.tambahBerkasWakaf(wakif, {
        pengajuanId: data.pengajuanId,
        berkas: [{ kunci: data.kunci, body: new Uint8Array(await data.berkas.arrayBuffer()), contentType: data.berkas.type }],
      }),
    disimpan: "Berkas ditambahkan.",
  });
}
