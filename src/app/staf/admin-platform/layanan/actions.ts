"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { buktiOf, buktiValues, frekuensiValues, jenisLayananValues } from "@/domain/layanan";
import { buktiLabels, jenisLayananLabels } from "@/lib/layanan-labels";
import { layananKatalogResource, lokasiMitraResource, type Actor, type Resource } from "@/domain/identity";
import { guarded } from "@/server/guard";
import { rupiahInput } from "@/server/rupiah-input";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../form-state";
import { guardMessage } from "../../messages";
import { formatRupiah } from "@/lib/rupiah";
import { formatTanggal } from "@/lib/time/jakarta";

/**
 * The Layanan catalog and the Paket Layanan (Admin Platform). Each Server Action
 * is `guarded()` (the actor from the session, the action on its resource, the
 * Zod schema) and then the domain module; nothing here decides anything.
 */

type LayananResult =
  | Awaited<ReturnType<ReturnType<typeof serverRuntime>["layanan"]["createLayanan"]>>
  | Awaited<ReturnType<ReturnType<typeof serverRuntime>["layanan"]["ubahLayanan"]>>
  | Awaited<ReturnType<ReturnType<typeof serverRuntime>["layanan"]["tambahVarian"]>>
  | Awaited<ReturnType<ReturnType<typeof serverRuntime>["layanan"]["hapusVarian"]>>
  | Awaited<ReturnType<ReturnType<typeof serverRuntime>["layanan"]["tandaiBolehDiTpu"]>>
  | Awaited<ReturnType<ReturnType<typeof serverRuntime>["layanan"]["tawarkanLayanan"]>>
  | Awaited<ReturnType<ReturnType<typeof serverRuntime>["layanan"]["stopLayanan"]>>
  | Awaited<ReturnType<ReturnType<typeof serverRuntime>["layanan"]["buatPaket"]>>
  | Awaited<ReturnType<ReturnType<typeof serverRuntime>["layanan"]["ubahPaket"]>>
  | Awaited<ReturnType<ReturnType<typeof serverRuntime>["layanan"]["hapusPaket"]>>
  | Awaited<ReturnType<ReturnType<typeof serverRuntime>["layanan"]["hapusLayanan"]>>
  | Awaited<ReturnType<ReturnType<typeof serverRuntime>["tariffs"]["setHargaLayananDki"]>>
  | Awaited<ReturnType<ReturnType<typeof serverRuntime>["tariffs"]["setTarifMitraJasa"]>>
  | Awaited<ReturnType<ReturnType<typeof serverRuntime>["tariffs"]["setHargaLayananLokasi"]>>;
type LayananRefusal = Extract<LayananResult, { ok: false }>;

/** What each refusal says on screen, in Bahasa Indonesia. */
function refusalMessage(refusal: LayananRefusal): string {
  switch (refusal.reason) {
    case "tidak_berwenang":
    case "perlu_totp":
      return guardMessage(refusal.reason);
    case "tidak_ditemukan":
      return "Layanan, Pilihan, Paket atau Lokasi Mitra ini tidak ditemukan.";
    case "nama_sudah_ada":
      return "Sudah ada nama ini di katalog.";
    case "layanan_tidak_valid":
      return "Layanan ini tidak bisa disimpan: periksa nama, jenis Layanan, waktu paling awal (0–365 hari) dan daftar Pilihan.";
    case "bukti_tidak_cocok":
      return `Bukti untuk ${jenisLayananLabels[refusal.jenis]} adalah ${buktiLabels[buktiOf(refusal.jenis)]}; bukti tidak bisa dipilih bebas.`;
    case "layanan_terpakai":
      return "Layanan ini masih dipakai: salah satu Pilihan-nya pernah ditawarkan di sebuah Lokasi Mitra atau masuk sebuah Paket Layanan.";
    case "paket_tidak_valid":
      return "Paket Layanan ini tidak bisa disimpan: pilih sedikit satu Pilihan, tanpa duplikat, dan frekuensinya salah satu dari empat.";
    case "varian_terpakai":
      return "Pilihan ini masih dipakai: sudah pernah ditawarkan di sebuah Lokasi Mitra atau masuk sebuah Paket Layanan, jadi tidak bisa dihapus.";
    case "tidak_ditawarkan":
      return "Lokasi Mitra ini sedang tidak menawarkan Pilihan tersebut.";
    case "tarif_tidak_valid":
      return "Harga ini tidak bisa disimpan: isilah dalam rupiah bulat tanpa sen.";
    case "tanggal_berlaku_lampau":
      return "Tanggal berlaku tidak boleh sebelum hari ini.";
  }
}

const field = (formData: FormData, name: string) => formData.get(name) ?? "";
const checkbox = (formData: FormData, name: string) => formData.get(name) === "on" || formData.get(name) === "true";
const KATALOG = "/staf/admin-platform/layanan";

const reason = z
  .string()
  .trim()
  .max(500)
  .transform((value) => value || null);
const layananFields = {
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500),
  jenis: z.enum(jenisLayananValues),
  // Not a free choice: the proof belongs to the kind, and the module refuses any
  // other value, so the hidden field the form carries is checked, never trusted.
  bukti: z.enum(buktiValues),
  leadTimeDays: z.coerce.number().int().min(0).max(365),
  bisaHariH: z.boolean(),
  adaDiPetakKosong: z.boolean(),
  teksLabel: z
    .string()
    .trim()
    .max(200)
    .transform((value) => value || null),
  reason,
};

/** A reason the Audit Log needs before a removal or a stop goes through. */
const alasanDiperlukan = z
  .string()
  .trim()
  .min(1, "reason")
  .max(500);

const newLayananSchema = z.object({
  ...layananFields,
  varian: z
    .string()
    .trim()
    .min(1, "varian")
    .transform((value) => value.split("\n").map((name) => name.trim()).filter(Boolean)),
});

const ubahLayananSchema = z.object({ layananId: z.uuid(), ...layananFields });

/** What each form field says when it is not valid, in Bahasa Indonesia. */
const fieldMessages: Record<string, string> = {
  name: "Isi nama (paling banyak 120 huruf).",
  jenis: "Pilih jenis Layanan.",
  bukti: "Bukti mengikuti jenis Layanan; muat ulang halaman lalu coba lagi.",
  description: "Keterangan paling banyak 500 huruf.",
  leadTimeDays: "Isi waktu paling awal dalam hari: bilangan bulat dari 0 sampai 365.",
  teksLabel: "Isian bebas paling banyak 200 huruf.",
  varian: "Isi sedikit satu Pilihan, satu nama per baris dan tanpa duplikat.",
  frekuensi: "Pilih frekuensi: Sekali, Bulanan, 3-bulanan atau Tahunan.",
  itemIds: "Pilih sedikit satu Pilihan isi Paket Layanan.",
  amount: "Isi jumlah dalam rupiah bulat tanpa sen, paling banyak Rp 100.000.000.000.",
  effectiveOn: "Isi tanggal berlaku yang benar.",
  reason: "Alasan paling banyak 500 huruf.",
};
/** A hidden field (the Layanan, the Pilihan, the Paket) that is not valid: the page is stale or was tampered with. */
const staleForm = "Formulir ini tidak lengkap. Muat ulang halaman lalu coba lagi.";

/** The message for the first field of `input` that `schema` refuses. */
function invalidFieldMessage(schema: z.ZodType, input: unknown): string {
  const field = schema.safeParse(input).error?.issues[0]?.path[0];
  return (typeof field === "string" && fieldMessages[field]) || staleForm;
}

const id = z.uuid();

/** One write: `guarded()`, then the domain module, then the pages to revalidate. */
async function write<S extends z.ZodType, R extends LayananResult>(options: {
  action: "layanan.kelola" | "layanan.tawarkan" | "tarif.ubah";
  resource: () => Resource;
  schema: S;
  input: Record<string, unknown>;
  run: (actor: Actor, data: z.infer<S>) => Promise<R>;
  /** What the form says once the write is through: it may name the thing from the result, never from the form. */
  saved: (data: z.infer<S>, written: Extract<R, { ok: true }>) => string;
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
    if (result.error === "input_tidak_valid") return { status: "gagal", message: invalidFieldMessage(options.schema, options.input) };
    return { status: "gagal", message: guardMessage(result.error) };
  }
  const { data, written } = result.value;
  if (!written.ok) return { status: "gagal", message: refusalMessage(written as LayananRefusal) };
  for (const page of options.pages(data)) revalidatePath(page);
  // The cast is the narrowing a generic cannot do for itself, as in lokasi/actions.ts.
  return { status: "berhasil", message: options.saved(data, written as Extract<R, { ok: true }>) };
}

/** Admin Platform adds a Layanan to the catalog with its first variants. */
export async function tambahLayanan(_previous: FormState, formData: FormData): Promise<FormState> {
  return write({
    action: "layanan.kelola",
    resource: () => layananKatalogResource(),
    schema: newLayananSchema,
    input: {
      name: formData.get("name"),
      description: field(formData, "description"),
      jenis: formData.get("jenis"),
      bukti: formData.get("bukti"),
      leadTimeDays: field(formData, "leadTimeDays"),
      bisaHariH: checkbox(formData, "bisaHariH"),
      adaDiPetakKosong: checkbox(formData, "adaDiPetakKosong"),
      teksLabel: field(formData, "teksLabel"),
      varian: field(formData, "varian"),
      reason: field(formData, "reason"),
    },
    run: (actor, data) => serverRuntime().layanan.createLayanan(actor, data),
    saved: (data) => `Layanan ${data.name} ditambahkan ke katalog.`,
    pages: () => [KATALOG],
  });
}

/** Admin Platform changes a Layanan's own fields. */
export async function ubahLayanan(_previous: FormState, formData: FormData): Promise<FormState> {
  return write({
    action: "layanan.kelola",
    resource: () => layananKatalogResource(),
    schema: ubahLayananSchema,
    input: {
      layananId: formData.get("layananId"),
      name: formData.get("name"),
      description: field(formData, "description"),
      jenis: formData.get("jenis"),
      bukti: formData.get("bukti"),
      leadTimeDays: field(formData, "leadTimeDays"),
      bisaHariH: checkbox(formData, "bisaHariH"),
      adaDiPetakKosong: checkbox(formData, "adaDiPetakKosong"),
      teksLabel: field(formData, "teksLabel"),
      reason: field(formData, "reason"),
    },
    run: (actor, data) => serverRuntime().layanan.ubahLayanan(actor, data.layananId, data),
    saved: (data) => `Layanan ${data.name} disimpan.`,
    pages: () => [KATALOG],
  });
}

/** Admin Platform adds a fixed-price variant to a Layanan. */
export async function tambahVarian(_previous: FormState, formData: FormData): Promise<FormState> {
  return write({
    action: "layanan.kelola",
    resource: () => layananKatalogResource(),
    schema: z.object({ layananId: id, name: z.string().trim().min(1, "name").max(120), reason }),
    input: { layananId: formData.get("layananId"), name: formData.get("name"), reason: field(formData, "reason") },
    run: (actor, data) => serverRuntime().layanan.tambahVarian(actor, data.layananId, data),
    saved: (data) => `Pilihan ${data.name} ditambahkan.`,
    pages: () => [KATALOG],
  });
}

/** Admin Platform removes a variant that no Lokasi Mitra has ever offered. */
export async function hapusVarian(_previous: FormState, formData: FormData): Promise<FormState> {
  return write({
    action: "layanan.kelola",
    resource: () => layananKatalogResource(),
    schema: z.object({ layananVariantId: id, reason: alasanDiperlukan }),
    input: { layananVariantId: formData.get("layananVariantId"), reason: field(formData, "reason") },
    run: (actor, data) => serverRuntime().layanan.hapusVarian(actor, data.layananVariantId, data),
    saved: () => "Pilihan dihapus dari katalog.",
    pages: () => [KATALOG],
  });
}

/** Admin Platform marks a variant "boleh di TPU DKI" by hand, or takes the mark off. */
export async function tandaiBolehDiTpu(_previous: FormState, formData: FormData): Promise<FormState> {
  return write({
    action: "layanan.kelola",
    resource: () => layananKatalogResource(),
    schema: z.object({ layananVariantId: id, boleh: z.boolean(), reason }),
    input: { layananVariantId: formData.get("layananVariantId"), boleh: checkbox(formData, "boleh"), reason: field(formData, "reason") },
    run: (actor, data) => serverRuntime().layanan.tandaiBolehDiTpu(actor, data.layananVariantId, data),
    saved: (data) => (data.boleh ? "Pilihan ini boleh di TPU DKI." : "Tanda boleh di TPU DKI dicabut."),
    pages: () => [KATALOG],
  });
}

const hargaSchema = z.object({ layananVariantId: id, amount: rupiahInput, effectiveOn: z.iso.date(), reason });

/** Admin Platform enters a new DKI price for one variant (the same in every TPU). */
export async function simpanHargaDki(_previous: FormState, formData: FormData): Promise<FormState> {
  return write({
    action: "tarif.ubah",
    resource: () => ({ kind: "tarif_global" }),
    schema: hargaSchema,
    input: {
      layananVariantId: formData.get("layananVariantId"),
      amount: field(formData, "amount"),
      effectiveOn: formData.get("effectiveOn"),
      reason: field(formData, "reason"),
    },
    run: (actor, data) => serverRuntime().tariffs.setHargaLayananDki(actor, data.layananVariantId, data),
    saved: (data) => `Harga di TPU DKI ${formatRupiah(data.amount)} berlaku mulai ${formatTanggal(data.effectiveOn)}.`,
    pages: () => [KATALOG],
  });
}

/** Admin Platform enters a new Mitra Jasa rate for one variant; never shown to a Pemesan. */
export async function simpanTarifMitraJasa(_previous: FormState, formData: FormData): Promise<FormState> {
  return write({
    action: "tarif.ubah",
    resource: () => ({ kind: "tarif_global" }),
    schema: hargaSchema,
    input: {
      layananVariantId: formData.get("layananVariantId"),
      amount: field(formData, "amount"),
      effectiveOn: formData.get("effectiveOn"),
      reason: field(formData, "reason"),
    },
    run: (actor, data) => serverRuntime().tariffs.setTarifMitraJasa(actor, data.layananVariantId, data),
    saved: (data) => `Tarif Mitra Jasa ${formatRupiah(data.amount)} berlaku mulai ${formatTanggal(data.effectiveOn)}.`,
    pages: () => [KATALOG],
  });
}

/** Admin Platform switches a Layanan variant on at a Lokasi Mitra, with that place's price. */
export async function tawarkanLayanan(_previous: FormState, formData: FormData): Promise<FormState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  return write({
    action: "layanan.tawarkan",
    resource: () => lokasiMitraResource(lokasiId),
    schema: z.object({ lokasiId: id, layananVariantId: id, amount: rupiahInput, effectiveOn: z.iso.date(), reason }),
    input: {
      lokasiId,
      layananVariantId: formData.get("layananVariantId"),
      amount: field(formData, "amount"),
      effectiveOn: formData.get("effectiveOn"),
      reason: field(formData, "reason"),
    },
    // The switch and the price are two facts of two modules: first the offering,
    // then the price that makes it offerable (an offering without a price is
    // never published, so a failed price leaves nothing half-offered).
    run: async (actor, data) => {
      const ditawarkan = await serverRuntime().layanan.tawarkanLayanan(actor, data.lokasiId, data.layananVariantId, data);
      if (!ditawarkan.ok) return ditawarkan;
      return serverRuntime().tariffs.setHargaLayananLokasi(actor, data.lokasiId, data.layananVariantId, data);
    },
    saved: (data) => `Lokasi Mitra ini menawarkan Pilihan itu seharga ${formatRupiah(data.amount)} mulai ${formatTanggal(data.effectiveOn)}.`,
    pages: (data) => [KATALOG, `/staf/admin-platform/lokasi/${data.lokasiId}/tarif`, `/lokasi/${data.lokasiId}`],
  });
}

/** Admin Platform stops a Lokasi Mitra offering a variant. */
export async function stopLayanan(_previous: FormState, formData: FormData): Promise<FormState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  return write({
    action: "layanan.tawarkan",
    resource: () => lokasiMitraResource(lokasiId),
    schema: z.object({ lokasiId: id, layananVariantId: id, reason: alasanDiperlukan }),
    input: { lokasiId, layananVariantId: formData.get("layananVariantId"), reason: field(formData, "reason") },
    run: (actor, data) => serverRuntime().layanan.stopLayanan(actor, data.lokasiId, data.layananVariantId, data),
    saved: () => "Penawaran dihentikan.",
    pages: (data) => [KATALOG, `/staf/admin-platform/lokasi/${data.lokasiId}/tarif`, `/lokasi/${data.lokasiId}`],
  });
}

const paketSchema = z.object({
  name: z.string().trim().min(1, "name").max(120),
  description: z.string().trim().max(500),
  frekuensi: z.enum(frekuensiValues),
  itemIds: z
    .string()
    .trim()
    .min(1, "itemIds")
    .transform((value) => value.split(",").map((id) => id.trim()).filter(Boolean)),
  reason,
});

const itemIdsOf = (formData: FormData) => formData.getAll("itemIds").map(String).filter(Boolean).join(",");

/** Admin Platform defines a Paket Layanan. */
export async function buatPaket(_previous: FormState, formData: FormData): Promise<FormState> {
  return write({
    action: "layanan.kelola",
    resource: () => layananKatalogResource(),
    schema: paketSchema,
    input: {
      name: formData.get("name"),
      description: field(formData, "description"),
      frekuensi: formData.get("frekuensi"),
      itemIds: itemIdsOf(formData),
      reason: field(formData, "reason"),
    },
    run: (actor, data) => serverRuntime().layanan.buatPaket(actor, data),
    saved: (data) => `Paket Layanan ${data.name} ditambahkan.`,
    pages: () => [KATALOG],
  });
}

/** Admin Platform changes a Paket Layanan's items, frequency or wording. */
export async function ubahPaket(_previous: FormState, formData: FormData): Promise<FormState> {
  return write({
    action: "layanan.kelola",
    resource: () => layananKatalogResource(),
    schema: paketSchema.extend({ paketId: id }),
    input: {
      paketId: formData.get("paketId"),
      name: formData.get("name"),
      description: field(formData, "description"),
      frekuensi: formData.get("frekuensi"),
      itemIds: itemIdsOf(formData),
      reason: field(formData, "reason"),
    },
    run: (actor, data) => serverRuntime().layanan.ubahPaket(actor, data.paketId, data),
    saved: (data) => `Paket Layanan ${data.name} disimpan.`,
    pages: () => [KATALOG],
  });
}

/** Admin Platform removes a Paket Layanan definition. */
export async function hapusPaket(_previous: FormState, formData: FormData): Promise<FormState> {
  return write({
    action: "layanan.kelola",
    resource: () => layananKatalogResource(),
    schema: z.object({ paketId: id, reason: alasanDiperlukan }),
    input: { paketId: formData.get("paketId"), reason: field(formData, "reason") },
    run: (actor, data) => serverRuntime().layanan.hapusPaket(actor, data.paketId, data),
    saved: () => "Paket Layanan dihapus.",
    pages: () => [KATALOG],
  });
}

/** Admin Platform removes a Layanan from the catalog with its variants. */
export async function hapusLayanan(_previous: FormState, formData: FormData): Promise<FormState> {
  return write({
    action: "layanan.kelola",
    resource: () => layananKatalogResource(),
    schema: z.object({ layananId: id, reason: alasanDiperlukan }),
    input: { layananId: formData.get("layananId"), reason: field(formData, "reason") },
    run: (actor, data) => serverRuntime().layanan.hapusLayanan(actor, data.layananId, data),
    saved: (_data, written) => `Layanan ${written.nama} dihapus dari katalog.`,
    pages: () => [KATALOG],
  });
}
