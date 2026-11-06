"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { semuaLokasiMitraResource } from "@/domain/identity";
import { infoMakamSwastaSchema, type AturTampilInfoMakamSwastaResult, type SimpanInfoMakamSwastaResult } from "@/domain/lokasi";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../form-state";
import { guardMessage } from "../../messages";

type Refused<T> = T extends { ok: false; reason: infer R } ? R : never;

const refusals: Record<Refused<SimpanInfoMakamSwastaResult | AturTampilInfoMakamSwastaResult>, string> = {
  tidak_berwenang: guardMessage("tidak_berwenang"),
  tidak_ditemukan: "Entri ini tidak ditemukan: muat ulang halaman ini.",
  isian_tidak_valid: "Periksa lagi isian Anda: nama, kota, alamat, pengelola, segmen dan minimal satu sumber wajib diisi.",
  klaim_terlarang:
    "Lokasi ini belum bermitra: jangan tulis harga, “terverifikasi”, “bermitra”, “bersertifikat” atau ajakan memesan.",
  nama_sudah_ada: "Nama ini sudah ada di daftar Info Makam Swasta.",
};

const PATHS = ["/staf/admin-platform/info-makam-swasta", "/info-makam-swasta", "/lokasi", "/"];

function hasil(written: { ok: true } | { ok: false; reason: keyof typeof refusals }, saved: string): FormState {
  if (!written.ok) return { status: "gagal", message: refusals[written.reason] };
  for (const path of PATHS) revalidatePath(path);
  return { status: "berhasil", message: saved };
}

const FIELDS = ["nama", "kota", "alamat", "pengelola", "segmen", "luas", "fasilitas", "sumber", "urutan"] as const;

const simpanSchema = infoMakamSwastaSchema.extend({ id: z.union([z.uuid(), z.literal("")]) });

/** Admin Platform adds an Info Makam Swasta entry, or corrects one (`id` set). */
export async function simpanInfoMakamSwasta(_previous: FormState, formData: FormData): Promise<FormState> {
  const field = (name: string) => String(formData.get(name) ?? "");
  const isian = Object.fromEntries(FIELDS.map((name) => [name, field(name)]));
  const result = await guarded({
    fitur: "inti",
    action: "lokasi.buat",
    resource: () => semuaLokasiMitraResource(),
    schema: simpanSchema,
    input: { ...isian, id: field("id") },
    // The domain parses the same typed values again with the same schema (its own boundary).
    run: (actor, { id }) => serverRuntime().lokasi.simpanInfoMakamSwasta(actor, id || null, isian),
  });
  if (!result.ok) return { status: "gagal", message: result.error === "input_tidak_valid" ? refusals.isian_tidak_valid : guardMessage(result.error) };
  return hasil(result.value, "Info Makam Swasta tersimpan.");
}

/** Admin Platform shows an entry on the public pages again, or hides it. */
export async function aturTampilInfoMakamSwasta(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
    fitur: "inti",
    action: "lokasi.buat",
    resource: () => semuaLokasiMitraResource(),
    schema: z.object({ id: z.uuid(), tampil: z.enum(["ya", "tidak"]) }),
    input: { id: formData.get("id"), tampil: formData.get("tampil") },
    run: (actor, data) => serverRuntime().lokasi.aturTampilInfoMakamSwasta(actor, data.id, data.tampil === "ya"),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  return hasil(result.value, "Tampilan Info Makam Swasta diperbarui.");
}
