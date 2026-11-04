"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { lokasiMitraResource } from "@/domain/identity";
import { FOTO_GALERI_MAX_BYTES, KETERANGAN_FOTO_MAX, kategoriFotoGaleri, type UnggahFotoGaleriResult } from "@/domain/lokasi";
import { GAMBAR_TIPE_KAVLING_MAX_BYTES, type SetGambarTipeKavlingResult } from "@/domain/tariffs";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../../../form-state";
import { guardMessage } from "../../../../messages";

type Refused<T> = T extends { ok: false; reason: infer R } ? R : never;

const refusals: Record<Refused<UnggahFotoGaleriResult | SetGambarTipeKavlingResult>, string> = {
  tidak_berwenang: guardMessage("tidak_berwenang"),
  tidak_ditemukan: "Tidak ditemukan: muat ulang halaman ini.",
  berkas_tidak_didukung: "Berkas harus JPG, PNG atau WebP (isi berkas diperiksa), paling besar 10 MB.",
  keterangan_wajib: `Tulis keterangan gambar, paling banyak ${KETERANGAN_FOTO_MAX} karakter.`,
  pernyataan_wajib: "Centang pernyataan bahwa gambar tidak menampilkan nisan atau area pemakaman.",
  galeri_penuh: "Galeri Lokasi sudah berisi 12 foto. Hapus satu dulu.",
  berkas_gagal_disimpan: "Berkas tidak bisa disimpan. Penyimpanan berkas sedang bermasalah, coba lagi.",
};

const path = (lokasiId: string) => `/staf/admin-platform/lokasi/${lokasiId}/foto`;
const id = z.uuid();
const keterangan = z.string().trim().max(KETERANGAN_FOTO_MAX);
const tanpaMakam = z.literal("ya").optional().transform((value) => value === "ya");

function hasil(lokasiId: string, written: { ok: true } | { ok: false; reason: keyof typeof refusals }, saved: string): FormState {
  if (!written.ok) return { status: "gagal", message: refusals[written.reason] };
  revalidatePath(path(lokasiId));
  return { status: "berhasil", message: saved };
}

const unggahFotoSchema = z.object({
  lokasiId: id,
  foto: z.instanceof(File).refine((file) => file.size <= FOTO_GALERI_MAX_BYTES),
  kategori: z.enum(kategoriFotoGaleri),
  keterangan,
  tanpaMakam,
});

/** Admin Platform adds a Galeri Lokasi photo. */
export async function unggahFotoGaleri(_previous: FormState, formData: FormData): Promise<FormState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  const result = await guarded({
    fitur: "inti",
    action: "lokasi.ubah",
    resource: () => lokasiMitraResource(lokasiId),
    schema: unggahFotoSchema,
    input: {
      lokasiId,
      foto: formData.get("foto"),
      kategori: formData.get("kategori"),
      keterangan: formData.get("keterangan"),
      tanpaMakam: formData.get("tanpaMakam") ?? undefined,
    },
    run: async (actor, data) =>
      serverRuntime().lokasi.unggahFotoGaleri(actor, data.lokasiId, {
        foto: { body: new Uint8Array(await data.foto.arrayBuffer()), contentType: data.foto.type },
        kategori: data.kategori,
        keterangan: data.keterangan,
        tanpaMakam: data.tanpaMakam,
      }),
  });
  if (!result.ok) return { status: "gagal", message: result.error === "input_tidak_valid" ? "Periksa lagi isian Anda. Foto paling besar 10 MB." : guardMessage(result.error) };
  return hasil(lokasiId, result.value, "Foto ditambahkan ke Galeri Lokasi.");
}

/** Admin Platform takes a Galeri Lokasi photo off. */
export async function hapusFotoGaleri(_previous: FormState, formData: FormData): Promise<FormState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  const result = await guarded({
    fitur: "inti",
    action: "lokasi.ubah",
    resource: () => lokasiMitraResource(lokasiId),
    schema: z.object({ lokasiId: id, fotoId: id }),
    input: { lokasiId, fotoId: formData.get("fotoId") },
    run: (actor, data) => serverRuntime().lokasi.hapusFotoGaleri(actor, data.lokasiId, data.fotoId),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  return hasil(lokasiId, result.value, "Foto dihapus dari Galeri Lokasi.");
}

const gambarSchema = z.object({
  lokasiId: id,
  jenisMakamId: id,
  gambar: z.instanceof(File).refine((file) => file.size <= GAMBAR_TIPE_KAVLING_MAX_BYTES),
  keterangan,
  tanpaMakam,
});

/** Admin Platform sets a Jenis Makam's Gambar Tipe Kavling. */
export async function simpanGambarTipeKavling(_previous: FormState, formData: FormData): Promise<FormState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  const result = await guarded({
    fitur: "inti",
    action: "tarif.ubah",
    resource: () => lokasiMitraResource(lokasiId),
    schema: gambarSchema,
    input: {
      lokasiId,
      jenisMakamId: formData.get("jenisMakamId"),
      gambar: formData.get("gambar"),
      keterangan: formData.get("keterangan"),
      tanpaMakam: formData.get("tanpaMakam") ?? undefined,
    },
    run: async (actor, data) =>
      serverRuntime().tariffs.setGambarTipeKavling(actor, data.jenisMakamId, {
        gambar: { body: new Uint8Array(await data.gambar.arrayBuffer()), contentType: data.gambar.type },
        keterangan: data.keterangan,
        tanpaMakam: data.tanpaMakam,
      }),
  });
  if (!result.ok) return { status: "gagal", message: result.error === "input_tidak_valid" ? "Periksa lagi isian Anda. Gambar paling besar 10 MB." : guardMessage(result.error) };
  return hasil(lokasiId, result.value, "Gambar Tipe Kavling tersimpan.");
}

/** Admin Platform takes a Jenis Makam's Gambar Tipe Kavling off. */
export async function hapusGambarTipeKavling(_previous: FormState, formData: FormData): Promise<FormState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  const result = await guarded({
    fitur: "inti",
    action: "tarif.ubah",
    resource: () => lokasiMitraResource(lokasiId),
    schema: z.object({ lokasiId: id, jenisMakamId: id }),
    input: { lokasiId, jenisMakamId: formData.get("jenisMakamId") },
    run: (actor, data) => serverRuntime().tariffs.hapusGambarTipeKavling(actor, data.jenisMakamId),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  return hasil(lokasiId, result.value, "Gambar Tipe Kavling dihapus.");
}
