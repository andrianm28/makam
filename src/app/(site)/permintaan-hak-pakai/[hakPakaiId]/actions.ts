"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { pemesananResource } from "@/domain/identity";
import {
  ajukanGantiPemegangHakSchema,
  ajukanPengembalianSchema,
  ajukanUlangPermintaanHakPakaiSchema,
  permintaanHakPakaiIdSchema,
  ubahCalonPenghuniSchema,
} from "@/domain/pemesanan/skema-permintaan-hak-pakai";
import { permintaanHakPakaiText } from "@/lib/permintaan-hak-pakai-labels";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";

export type PermintaanActionState = { status: "idle" } | { status: "gagal"; message: string } | { status: "berhasil"; message: string };

/** The Hak Pakai a form names, validated before it is put in a path to refresh. */
const hakPakaiIdSchema = z.uuid().catch("");

/** The Makam tab and the request's page both show a request: a change refreshes them together. */
function segarkan(hakPakaiIdMentah: FormDataEntryValue | null): void {
  const hakPakaiId = hakPakaiIdSchema.parse(hakPakaiIdMentah);
  if (hakPakaiId !== "") revalidatePath(`/permintaan-hak-pakai/${hakPakaiId}`);
  revalidatePath("/akun/makam");
  revalidatePath("/akun", "layout");
}

const BERKAS_MAKS = 5;

/** The documents a family attached to the form, as bytes for the module to check and store privately. */
async function berkasDari(formData: FormData) {
  const berkas: { body: Uint8Array; contentType: string }[] = [];
  for (const file of formData.getAll("berkas").slice(0, BERKAS_MAKS)) {
    if (file instanceof File && file.size > 0) berkas.push({ body: new Uint8Array(await file.arrayBuffer()), contentType: file.type });
  }
  return berkas;
}

/** "Kembalikan Hak Pakai": an unused plot is given back; compensation is agreed directly with the Lokasi. */
export async function ajukanPengembalianAction(_previous: PermintaanActionState, formData: FormData): Promise<PermintaanActionState> {
  const result = await guarded({
    action: "permintaan_hak_pakai.ajukan",
    resource: (actor) => pemesananResource(actor.accountId),
    schema: ajukanPengembalianSchema,
    input: { hakPakaiId: formData.get("hakPakaiId"), catatan: formData.get("catatan") ?? "" },
    run: (actor, data) => serverRuntime().pemesanan.ajukanPengembalian({ accountId: actor.accountId, email: actor.email }, data),
  });
  if (!result.ok) return { status: "gagal", message: permintaanHakPakaiText(result.error) };
  segarkan(formData.get("hakPakaiId"));
  if (!result.value.ok) return { status: "gagal", message: permintaanHakPakaiText(result.value.reason) };
  return { status: "berhasil", message: "Permintaan terkirim. Lokasi Mitra menjawab dalam 2 hari kerja, dan jawabannya datang ke email Anda." };
}

/** "Ajukan Ganti Pemegang Hak": the new holder, jual or waris, with optional documents. */
export async function ajukanGantiPemegangHakAction(_previous: PermintaanActionState, formData: FormData): Promise<PermintaanActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const result = await guarded({
    action: "permintaan_hak_pakai.ajukan",
    resource: (actor) => pemesananResource(actor.accountId),
    schema: ajukanGantiPemegangHakSchema,
    input: {
      hakPakaiId: formData.get("hakPakaiId"),
      pemegangBaru: { name: formData.get("name"), phoneNumber: formData.get("phoneNumber"), ...(email === "" ? {} : { email }) },
      sebab: formData.get("sebab"),
      berkas: await berkasDari(formData),
      catatan: formData.get("catatan") ?? "",
    },
    run: (actor, data) => serverRuntime().pemesanan.ajukanGantiPemegangHak({ accountId: actor.accountId, email: actor.email }, data),
  });
  if (!result.ok) return { status: "gagal", message: permintaanHakPakaiText(result.error) };
  segarkan(formData.get("hakPakaiId"));
  if (!result.value.ok) return { status: "gagal", message: permintaanHakPakaiText(result.value.reason) };
  return { status: "berhasil", message: "Permintaan terkirim. Lokasi Mitra menjawab dalam 2 hari kerja. Biaya penggantian, bila ada, dibayar langsung ke Lokasi Mitra." };
}

/** The Pemegang Hak files a request the Lokasi Mitra sent back for a fix again (Perlu Perbaikan ↺ Diajukan). */
export async function ajukanUlangPermintaanAction(_previous: PermintaanActionState, formData: FormData): Promise<PermintaanActionState> {
  const result = await guarded({
    action: "permintaan_hak_pakai.ajukan",
    resource: (actor) => pemesananResource(actor.accountId),
    schema: ajukanUlangPermintaanHakPakaiSchema,
    input: { id: formData.get("id"), catatan: formData.get("catatan") ?? "" },
    run: (actor, data) => serverRuntime().pemesanan.ajukanUlangPermintaanHakPakai({ accountId: actor.accountId, email: actor.email }, data),
  });
  if (!result.ok) return { status: "gagal", message: permintaanHakPakaiText(result.error) };
  segarkan(formData.get("hakPakaiId"));
  if (!result.value.ok) return { status: "gagal", message: permintaanHakPakaiText(result.value.reason) };
  return { status: "berhasil", message: "Permintaan diajukan kembali. Lokasi Mitra menjawab dalam 2 hari kerja." };
}

/** The Pemegang Hak withdraws the request before a decision. */
export async function batalkanPermintaanAction(_previous: PermintaanActionState, formData: FormData): Promise<PermintaanActionState> {
  const result = await guarded({
    action: "permintaan_hak_pakai.ajukan",
    resource: (actor) => pemesananResource(actor.accountId),
    schema: permintaanHakPakaiIdSchema,
    input: { id: formData.get("id") },
    run: (actor, data) => serverRuntime().pemesanan.batalkanPermintaanHakPakai({ accountId: actor.accountId, email: actor.email }, data),
  });
  if (!result.ok) return { status: "gagal", message: permintaanHakPakaiText(result.error) };
  segarkan(formData.get("hakPakaiId"));
  if (!result.value.ok) return { status: "gagal", message: permintaanHakPakaiText(result.value.reason) };
  return { status: "berhasil", message: "Permintaan ditarik. Hak Pakai Anda tidak berubah." };
}

/** The Calon Penghuni label of one Petak: immediate, no review; the Admin Lokasi is told. */
export async function ubahCalonPenghuniAction(_previous: PermintaanActionState, formData: FormData): Promise<PermintaanActionState> {
  const label = String(formData.get("label") ?? "").trim();
  const result = await guarded({
    action: "permintaan_hak_pakai.ajukan",
    resource: (actor) => pemesananResource(actor.accountId),
    schema: ubahCalonPenghuniSchema,
    input: { hakPakaiId: formData.get("hakPakaiId"), petakId: formData.get("petakId") ?? undefined, label: label === "" ? null : label },
    run: (actor, data) => serverRuntime().pemesanan.ubahCalonPenghuni({ accountId: actor.accountId, email: actor.email }, data),
  });
  if (!result.ok) return { status: "gagal", message: permintaanHakPakaiText(result.error) };
  segarkan(formData.get("hakPakaiId"));
  if (!result.value.ok) return { status: "gagal", message: permintaanHakPakaiText(result.value.reason) };
  return { status: "berhasil", message: result.value.calonPenghuni ? "Calon Penghuni diubah. Lokasi Mitra diberi tahu." : "Calon Penghuni dikosongkan. Lokasi Mitra diberi tahu." };
}
