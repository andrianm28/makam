"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { semuaTpuDkiResource, tpuDkiResource, type Actor, type Resource } from "@/domain/identity";
import { TPU_LIMITS, type CreateTpuDkiResult, type TpuProfileInput, type UpdateTpuDkiFlagResult, type UpdateTpuDkiResult } from "@/domain/lokasi";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../form-state";
import { guardMessage } from "../../messages";
import {
  menerimaMakamBaruOf,
  newTpuFormSchema,
  tpuProfileEditSchema,
  tpuStatusEditSchema,
  type TpuProfileForm,
} from "./schema";

type TpuResult = CreateTpuDkiResult | UpdateTpuDkiResult | UpdateTpuDkiFlagResult;
type TpuRefusal = Extract<TpuResult, { ok: false }>;

/** What each refusal says on screen, in Bahasa Indonesia. */
const refusalMessages: Record<TpuRefusal["reason"], string> = {
  tidak_berwenang: guardMessage("tidak_berwenang"),
  perlu_totp: guardMessage("perlu_totp"),
  tidak_ditemukan: "TPU ini tidak ada di daftar TPU DKI.",
  tpu_tidak_valid: "Profil TPU ini tidak bisa disimpan: periksa nama, alamat, kota dan sumber data.",
  nama_sudah_ada: "Sudah ada TPU dengan nama ini.",
};

const staleForm = "Formulir ini tidak lengkap. Muat ulang halaman lalu coba lagi.";

/** What each field says when it is not valid, in Bahasa Indonesia. */
const fieldMessages: Record<string, string> = {
  name: `Isi nama TPU (paling banyak ${TPU_LIMITS.name} huruf).`,
  address: "Isi alamat TPU.",
  city: "Isi kota atau kabupaten TPU.",
  dataSource: "Isi sumber data TPU.",
  pinLat: "Isi titik peta (latitud dan longitude) bila TPU punya, atau kosongkan bila belum.",
  pinLng: "Isi titik peta (latitud dan longitude) bila TPU punya, atau kosongkan bila belum.",
  tpuId: staleForm,
  nama: staleForm,
  menerimaMakamBaru: "Pilih apakah TPU ini menerima makam baru.",
};

/** The message for the first field of `input` that `schema` refuses. */
function invalidFieldMessage(schema: z.ZodType, input: unknown): string {
  const field = schema.safeParse(input).error?.issues[0]?.path[0];
  return (typeof field === "string" && fieldMessages[field]) || staleForm;
}

const field = (formData: FormData, name: string) => formData.get(name) ?? "";

/** A pin as the form typed it, or null when it left both fields empty. */
function pinOf({ pinLat, pinLng }: Pick<TpuProfileForm, "pinLat" | "pinLng">) {
  if (pinLat === "" || pinLng === "") return null;
  return { lat: Number(pinLat.replace(",", ".")), lng: Number(pinLng.replace(",", ".")) };
}

/** The profile the Lokasi module takes, from what the form typed. */
function profileOf({ pinLat, pinLng, ...profile }: TpuProfileForm): TpuProfileInput {
  return { ...profile, pin: pinOf({ pinLat, pinLng }) };
}

/** The pages a saved TPU changes: the list, its own page and the Antrean's Tier 4 row. */
const tpuPages = (tpuId?: string) => [
  "/staf/admin-platform/tpu",
  ...(tpuId ? [`/staf/admin-platform/tpu/${tpuId}`] : []),
  "/staf/admin-platform/antrean",
];

/**
 * One TPU write: `guarded()` (the actor, the action on `resource`, the schema),
 * then the Lokasi module. Nothing about a TPU is decided here.
 */
async function tpuWrite<S extends z.ZodType, R extends TpuResult>(options: {
  action: "tpu.buat" | "tpu.ubah";
  resource: (actor: Actor) => Resource;
  schema: S;
  input: unknown;
  run: (actor: Actor, data: z.infer<S>) => Promise<R>;
  saved: (data: z.infer<S>) => string;
  pages: (data: z.infer<S>) => string[];
}): Promise<FormState> {
  const result = await guarded({
    action: options.action,
    resource: options.resource,
    schema: options.schema,
    input: options.input,
    run: async (actor, data) => ({ data, written: await options.run(actor, data) }),
  });
  if (!result.ok) {
    // guarded() has authenticated and authorised the caller before it validated, so naming the field is safe.
    if (result.error === "input_tidak_valid") {
      return { status: "gagal", message: invalidFieldMessage(options.schema, options.input) };
    }
    return { status: "gagal", message: guardMessage(result.error) };
  }
  const { data, written } = result.value;
  if (!written.ok) return { status: "gagal", message: refusalMessages[written.reason] };
  for (const page of options.pages(data)) revalidatePath(page);
  return { status: "berhasil", message: options.saved(data) };
}

/** The TPU profile fields of a form, as the form types them. */
function profileInput(formData: FormData) {
  return {
    name: field(formData, "name"),
    address: field(formData, "address"),
    city: field(formData, "city"),
    dataSource: field(formData, "dataSource"),
    pinLat: field(formData, "pinLat"),
    pinLng: field(formData, "pinLng"),
  };
}

/** Admin Platform adds a DKI TPU, with the new-plot status as found today. */
export async function tambahTpu(_previous: FormState, formData: FormData): Promise<FormState> {
  return tpuWrite({
    action: "tpu.buat",
    resource: () => semuaTpuDkiResource(),
    schema: newTpuFormSchema,
    input: { ...profileInput(formData), menerimaMakamBaru: field(formData, "menerimaMakamBaru") },
    run: (actor, data) =>
      serverRuntime().lokasi.createTpuDki(actor, {
        ...profileOf(data),
        menerimaMakamBaru: menerimaMakamBaruOf(data.menerimaMakamBaru),
      }),
    saved: (data) => `${data.name} ditambahkan.`,
    pages: () => tpuPages(),
  });
}

/** Admin Platform corrects a TPU's name, address, city, pin or data source. */
export async function simpanProfilTpu(_previous: FormState, formData: FormData): Promise<FormState> {
  const tpuId = String(formData.get("tpuId") ?? "");
  return tpuWrite({
    action: "tpu.ubah",
    resource: () => tpuDkiResource(tpuId),
    schema: tpuProfileEditSchema,
    input: { ...profileInput(formData), tpuId: formData.get("tpuId") },
    run: (actor, data) => serverRuntime().lokasi.updateTpuDki(actor, data.tpuId, profileOf(data)),
    saved: (data) => `Profil ${data.name} disimpan.`,
    pages: (data) => tpuPages(data.tpuId),
  });
}

/** Admin Platform records what a TPU takes today, which stamps the date it was checked. */
export async function simpanStatusTpu(_previous: FormState, formData: FormData): Promise<FormState> {
  const tpuId = String(formData.get("tpuId") ?? "");
  return tpuWrite({
    action: "tpu.ubah",
    resource: () => tpuDkiResource(tpuId),
    schema: tpuStatusEditSchema,
    input: {
      tpuId: formData.get("tpuId"),
      menerimaMakamBaru: field(formData, "menerimaMakamBaru"),
      nama: field(formData, "nama"),
    },
    run: (actor, data) =>
      serverRuntime().lokasi.updateTpuDkiFlag(actor, data.tpuId, {
        menerimaMakamBaru: menerimaMakamBaruOf(data.menerimaMakamBaru),
      }),
    saved: (data) =>
      `Status ${data.nama || "TPU"} disimpan: ${data.menerimaMakamBaru === "ya" ? "menerima" : "tidak menerima"} makam baru.`,
    pages: (data) => tpuPages(data.tpuId),
  });
}
