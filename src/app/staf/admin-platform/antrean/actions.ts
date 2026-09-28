"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { antreanResource, lokasiMitraResource } from "@/domain/identity";
import { catatanInternalInputSchema, matikanBertugasInputSchema } from "@/domain/queues";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../form-state";
import { guardMessage } from "../../messages";

const PATH = "/staf/admin-platform/antrean";

const ambilSchema = z.object({
  type: z.string().trim().min(1),
  subjectId: z.string().trim().min(1),
  /** What the claimed row is about, so a hand-over can write its Catatan Internal thread (ticket 28). */
  subjectKind: z.string().trim().min(1).max(50),
});

/** Any Admin Platform takes (Ambil) an Antrean row, replacing any earlier claim (spec, story 141). */
export async function ambilAntreanRow(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
    action: "antrean.ambil",
    resource: () => antreanResource(),
    schema: ambilSchema,
    input: { type: formData.get("type"), subjectId: formData.get("subjectId"), subjectKind: formData.get("subjectKind") },
    run: (actor, data) => serverRuntime().queues.ambilRow(actor, data),
  });

  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(PATH);
  if (!result.value.ok) return { status: "gagal", message: "Baris ini sudah diambil orang lain sesaat lalu; coba lagi." };
  return { status: "berhasil", message: "Baris diambil." };
}

const lokasiIdSchema = z.object({ lokasiId: z.uuid() });

/**
 * Admin Platform records that a Lokasi Mitra still meets the publish gate,
 * closing the Antrean's Tier 4 "publish-gate check" row (spec, Work Queues;
 * ticket 17).
 */
export async function konfirmasiSyaratTayangMasihTerpenuhi(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
    action: "lokasi.konfirmasi_syarat_tayang",
    resource: () => lokasiMitraResource(String(formData.get("lokasiId") ?? "")),
    schema: lokasiIdSchema,
    input: { lokasiId: formData.get("lokasiId") },
    run: (actor, data) => serverRuntime().lokasi.recordPublishGateMasihTerpenuhi(actor, data.lokasiId),
  });

  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(PATH);
  if (!result.value.ok) return { status: "gagal", message: "Lokasi Mitra tidak ditemukan." };
  return { status: "berhasil", message: "Dikonfirmasi: Lokasi Mitra ini masih memenuhi syarat tayang." };
}

const domainRefusalMessages: Record<string, string> = {
  tidak_berwenang: guardMessage("tidak_berwenang"),
  perlu_totp: guardMessage("perlu_totp"),
  catatan_tidak_valid: "Isi Catatan Internal tidak boleh kosong (maksimum 2000 karakter).",
};

/**
 * An Admin Platform switches itself Bertugas (spec, Work Queues; CONTEXT.md).
 *
 * A form with nothing to fill in, so this is a plain form action that redirects back to the Antrean with
 * the outcome on the query, the way `bacaPeringatanStaf` and the Lokasi Mitra actions do; the page says
 * what happened. Refused without an active Perangkat Push (ADR 0004), so that outcome carries its pointer
 * to the push panel the same page shows.
 */
export async function nyalakanBertugas(): Promise<void> {
  const result = await guarded({
    action: "antrean.bertugas",
    resource: () => antreanResource(),
    schema: z.object({}),
    input: {},
    run: (actor) => serverRuntime().queues.nyalakanBertugas(actor),
  });

  if (!result.ok) {
    if (result.error === "belum_masuk") redirect("/masuk");
    if (result.error === "perlu_totp") redirect("/staf/totp");
    redirect(`${PATH}?bertugas=tidak-berwenang`);
  }
  revalidatePath(PATH);
  if (result.value.ok) redirect(`${PATH}?bertugas=ok`);
  redirect(`${PATH}?bertugas=tidak-ada-push`);
}

/**
 * Coming off duty by hand: for every Ambil claim still held, release it or hand the work over in a
 * Catatan Internal. A claim left undecided refuses the whole switch-off (spec, Work Queues).
 */
export async function matikanBertugas(_previous: FormState, formData: FormData): Promise<FormState> {
  const klaim = formData.getAll("klaim").map((satu) => {
    const [type, ...sisa] = String(satu ?? "").split(":");
    const subjectId = sisa.join(":");
    return {
      type: type ?? "",
      subjectId,
      lepas: formData.get(`lepas:${type}:${subjectId}`) === "true",
      catatan: formData.get(`catatan:${type}:${subjectId}`),
    };
  });
  const result = await guarded({
    action: "antrean.bertugas",
    resource: () => antreanResource(),
    schema: matikanBertugasInputSchema,
    input: { klaim },
    run: (actor, data) => serverRuntime().queues.matikanBertugas(actor, data),
  });

  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(PATH);
  const turun = result.value;
  if (turun.ok) {
    return {
      status: "berhasil",
      message:
        turun.dicatat.length > 0
          ? `Anda turun dari Bertugas. ${turun.dicatat.length} baris diserahkan lewat Catatan Internal.`
          : "Anda turun dari Bertugas.",
    };
  }
  if (turun.reason === "klaim_belum_diputuskan") {
    return { status: "gagal", message: "Pilih untuk setiap baris: dilepas atau diberi Catatan Internal." };
  }
  if (turun.reason === "catatan_wajib") {
    return { status: "gagal", message: "Isi Catatan Internal bila baris tidak dilepas." };
  }
  return { status: "berhasil", message: "Anda sudah tidak Bertugas." };
}

/** Admin Platform adds a Catatan Internal on any Antrean row or order (CONTEXT.md); never shown to the Pemesan, Mitra Jasa or Admin Lokasi. */
export async function tambahCatatanInternalAntrean(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
    action: "catatan_internal.tambah",
    resource: () => antreanResource(),
    schema: catatanInternalInputSchema,
    input: {
      subjectKind: formData.get("subjectKind"),
      subjectId: formData.get("subjectId"),
      body: formData.get("body"),
    },
    run: (actor, data) => serverRuntime().queues.tambahCatatanInternal(actor, data),
  });

  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(PATH);
  const written = result.value;
  if (!written.ok) return { status: "gagal", message: domainRefusalMessages[written.reason] ?? "Gagal menambah Catatan Internal." };
  return { status: "berhasil", message: "Catatan Internal ditambahkan." };
}
