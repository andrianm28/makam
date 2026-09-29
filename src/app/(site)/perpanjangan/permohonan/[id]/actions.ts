"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { pemesananResource } from "@/domain/identity";
import { batalkanPermohonanSchema, perbaikiPermohonanSchema, pesanDariPermohonanSchema } from "@/domain/perpanjangan";
import { documentPagePath } from "@/lib/document-links";
import { alasanPermohonanText } from "@/lib/permohonan-labels";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";

export type PermohonanActionState = { status: "idle" } | { status: "gagal" | "berhasil"; message: string };

const idSchema = z.object({ id: z.uuid() });

/** A field that was left empty is not sent, so it keeps what is on record. */
function isi(formData: FormData, name: string): Record<string, string> {
  const value = String(formData.get(name) ?? "").trim();
  return value === "" ? {} : { [name]: value };
}

/** The applicant corrects a request that the Admin Lokasi sent back: only the documents it picked again are replaced. */
export async function perbaikiPermohonanAction(_previous: PermohonanActionState, formData: FormData): Promise<PermohonanActionState> {
  const berkas = [];
  for (const [name, value] of formData.entries()) {
    if (name.startsWith("berkas_") && value instanceof File && value.size > 0) {
      berkas.push({ kunci: name.slice("berkas_".length), body: new Uint8Array(await value.arrayBuffer()), contentType: value.type });
    }
  }
  const id = idSchema.safeParse({ id: formData.get("permohonanId") });
  const result = await guarded({
    action: "pemesanan.buat",
    resource: (actor) => pemesananResource(actor.accountId),
    schema: perbaikiPermohonanSchema,
    input: { permohonanId: formData.get("permohonanId"), ...isi(formData, "nama"), ...isi(formData, "nomorTelepon"), ...isi(formData, "catatan"), berkas },
    run: (actor, data) => serverRuntime().perpanjangan.perbaikiPermohonan({ accountId: actor.accountId, email: actor.email }, data),
  });
  if (!result.ok) {
    if (result.error === "belum_masuk") return { status: "gagal", message: "Silakan masuk lagi." };
    return { status: "gagal", message: "Periksa lagi isian Anda." };
  }
  if (id.success) revalidatePath(`/perpanjangan/permohonan/${id.data.id}`);
  if (!result.value.ok) return { status: "gagal", message: alasanPermohonanText(result.value) };
  return { status: "berhasil", message: "Permohonan diajukan lagi. Admin Lokasi akan memeriksanya." };
}

/** The applicant withdraws a request before any decision. */
export async function batalkanPermohonanAction(_previous: PermohonanActionState, formData: FormData): Promise<PermohonanActionState> {
  const id = idSchema.safeParse({ id: formData.get("permohonanId") });
  const result = await guarded({
    action: "pemesanan.buat",
    resource: (actor) => pemesananResource(actor.accountId),
    schema: batalkanPermohonanSchema,
    input: { permohonanId: formData.get("permohonanId") },
    run: (actor, data) => serverRuntime().perpanjangan.batalkanPermohonan({ accountId: actor.accountId, email: actor.email }, data),
  });
  if (!result.ok) return { status: "gagal", message: result.error === "belum_masuk" ? "Silakan masuk lagi." : "Permohonan tidak valid." };
  if (id.success) revalidatePath(`/perpanjangan/permohonan/${id.data.id}`);
  if (!result.value.ok) return { status: "gagal", message: alasanPermohonanText(result.value) };
  return { status: "berhasil", message: "Permohonan dibatalkan." };
}

/** Orders the Perpanjangan on an approved request, landing on its Tagihan (the same order step as the direct path). */
export async function pesanDariPermohonanAction(_previous: PermohonanActionState, formData: FormData): Promise<PermohonanActionState> {
  const result = await guarded({
    action: "pemesanan.buat",
    resource: (actor) => pemesananResource(actor.accountId),
    schema: pesanDariPermohonanSchema.extend({ terms: z.coerce.number().int().min(1).max(100) }),
    input: { permohonanId: formData.get("permohonanId"), terms: formData.get("terms") },
    run: (actor, data) => serverRuntime().perpanjangan.pesanDariPermohonan({ accountId: actor.accountId, email: actor.email }, data),
  });
  if (!result.ok) return { status: "gagal", message: result.error === "belum_masuk" ? "Silakan masuk lagi." : "Pilih jumlah masa terlebih dahulu." };
  const hasil = result.value;
  if (hasil.ok) redirect(documentPagePath(hasil.perpanjangan.tagihan.link));
  if (hasil.reason === "tagihan_terbuka") redirect(documentPagePath(hasil.tagihanTerbuka.link));
  return { status: "gagal", message: alasanPermohonanText(hasil) };
}
