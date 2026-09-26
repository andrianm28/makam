"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { lokasiMitraResource, tarifGlobalResource, type Actor, type Resource } from "@/domain/identity";
import {
  GLOBAL_TARIFF_KEYS,
  type CreateJenisMakamResult,
  type MarkTariffsCheckedResult,
  type MissingTariff,
  type SetBiayaPemakamanResult,
  type SetGlobalTariffResult,
  type SetJenisMakamTariffResult,
  type Tenure,
} from "@/domain/tariffs";
import { guarded } from "@/server/guard";
import { optionalRupiahInput, rupiahInput } from "@/server/rupiah-input";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../form-state";
import { guardMessage } from "../../messages";
import { formatRupiah, formatTanggal, globalTariffLabels } from "./format";

type TariffResult =
  | SetGlobalTariffResult
  | CreateJenisMakamResult
  | SetJenisMakamTariffResult
  | SetBiayaPemakamanResult
  | MarkTariffsCheckedResult;
type TariffRefusal = Extract<TariffResult, { ok: false }>;

const missingLabels: Record<MissingTariff, string> = {
  jenis_makam: "Jenis Makam",
  biaya_pemakaman: "Biaya Pemakaman",
  biaya_layanan_platform: "Biaya Layanan Platform",
};

/** What each refusal says on screen, in Bahasa Indonesia. */
function refusalMessage(refusal: TariffRefusal): string {
  switch (refusal.reason) {
    case "tidak_berwenang":
    case "perlu_totp":
      return guardMessage(refusal.reason);
    case "tidak_ditemukan":
      return "Lokasi Mitra atau Jenis Makam ini tidak ditemukan.";
    case "tarif_tidak_valid":
      return "Periksa lagi tarifnya: jumlah dalam rupiah bulat, masa tahun minimal 1, dan harga Perpanjangan diisi hanya untuk masa N tahun.";
    case "tanggal_berlaku_lampau":
      return "Tanggal berlaku tidak boleh sebelum hari ini.";
    case "nama_sudah_ada":
      return "Sudah ada Jenis Makam dengan nama ini di Lokasi Mitra ini.";
    case "tarif_belum_lengkap":
      return `Tarif belum lengkap: isi dulu ${refusal.missing.map((missing) => missingLabels[missing]).join(", ")}.`;
  }
}

const invalidAmount = "Isi jumlah dalam rupiah bulat, misalnya 150.000.";

/**
 * One tariff form: `guarded()` (the actor, `tarif.ubah` on `resource`, the
 * schema), then the Tariffs module; `pages` are revalidated after a save.
 */
async function tariffWrite<S extends z.ZodType, R extends TariffResult>(options: {
  resource: Resource;
  schema: S;
  input: Record<string, unknown>;
  run: (actor: Actor, data: z.infer<S>) => Promise<R>;
  saved: (data: z.infer<S>) => string;
  pages: (data: z.infer<S>) => string[];
}): Promise<FormState> {
  const result = await guarded({
    action: "tarif.ubah",
    resource: () => options.resource,
    schema: options.schema,
    input: options.input,
    run: async (actor, data) => ({ data, written: await options.run(actor, data) }),
  });
  if (!result.ok) {
    return { status: "gagal", message: result.error === "input_tidak_valid" ? invalidAmount : guardMessage(result.error) };
  }
  const { data, written } = result.value;
  if (!written.ok) return { status: "gagal", message: refusalMessage(written as TariffRefusal) };
  for (const page of options.pages(data)) revalidatePath(page);
  return { status: "berhasil", message: options.saved(data) };
}

const id = z.uuid();
const effectiveOn = z.iso.date();
const reason = z
  .string()
  .trim()
  .max(500)
  .transform((value) => value || null);
const field = (formData: FormData, name: string) => formData.get(name) ?? "";
const lokasiPage = (lokasiId: string) => [`/staf/admin-platform/lokasi/${lokasiId}/tarif`];

const globalSchema = z.object({ key: z.enum(GLOBAL_TARIFF_KEYS), amount: rupiahInput, effectiveOn, reason });

/** Admin Platform enters a new version of a global tariff. */
export async function simpanTarifGlobal(_previous: FormState, formData: FormData): Promise<FormState> {
  return tariffWrite({
    resource: tarifGlobalResource(),
    schema: globalSchema,
    input: {
      key: formData.get("key"),
      amount: field(formData, "amount"),
      effectiveOn: formData.get("effectiveOn"),
      reason: field(formData, "reason"),
    },
    run: (actor, data) => serverRuntime().tariffs.setGlobalTariff(actor, data),
    saved: (data) => `${globalTariffLabels[data.key]} ${formatRupiah(data.amount)} berlaku mulai ${formatTanggal(data.effectiveOn)}.`,
    pages: () => ["/staf/admin-platform/tarif"],
  });
}

/** The Jenis Makam tariff fields of a form: tenure "selamanya", or "tahun" with its years and Perpanjangan price. */
const jenisMakamTariffFields = {
  hargaHakPakai: rupiahInput,
  tenure: z.enum(["selamanya", "tahun"]),
  tenureYears: z.union([z.literal("").transform(() => null), z.coerce.number()]),
  hargaPerpanjangan: optionalRupiahInput,
  effectiveOn,
  reason,
};

function tariffOf(data: {
  hargaHakPakai: number;
  tenure: "selamanya" | "tahun";
  tenureYears: number | null;
  hargaPerpanjangan: number | null;
  effectiveOn: string;
}): { hargaHakPakai: number; tenure: Tenure; hargaPerpanjangan: number | null; effectiveOn: string } {
  if (data.tenure === "selamanya") {
    return { hargaHakPakai: data.hargaHakPakai, tenure: { kind: "selamanya" }, hargaPerpanjangan: null, effectiveOn: data.effectiveOn };
  }
  return {
    hargaHakPakai: data.hargaHakPakai,
    // A missing number of years is refused by the module (tarif_tidak_valid).
    tenure: { kind: "tahun", years: data.tenureYears ?? 0 },
    hargaPerpanjangan: data.hargaPerpanjangan,
    effectiveOn: data.effectiveOn,
  };
}

function jenisMakamTariffInput(formData: FormData) {
  return {
    hargaHakPakai: field(formData, "hargaHakPakai"),
    tenure: formData.get("tenure"),
    tenureYears: field(formData, "tenureYears"),
    hargaPerpanjangan: field(formData, "hargaPerpanjangan"),
    effectiveOn: formData.get("effectiveOn"),
    reason: field(formData, "reason"),
  };
}

const newJenisMakamSchema = z.object({
  lokasiId: id,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500),
  ...jenisMakamTariffFields,
});

/** Admin Platform adds a Jenis Makam to a Lokasi Mitra with its first tariff. */
export async function tambahJenisMakam(_previous: FormState, formData: FormData): Promise<FormState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  return tariffWrite({
    resource: lokasiMitraResource(lokasiId),
    schema: newJenisMakamSchema,
    input: { lokasiId, name: formData.get("name"), description: field(formData, "description"), ...jenisMakamTariffInput(formData) },
    run: (actor, data) =>
      serverRuntime().tariffs.createJenisMakam(actor, data.lokasiId, {
        name: data.name,
        description: data.description,
        tariff: tariffOf(data),
        reason: data.reason,
      }),
    saved: (data) => `Jenis Makam ${data.name} ditambahkan.`,
    pages: (data) => lokasiPage(data.lokasiId),
  });
}

const jenisMakamVersionSchema = z.object({ lokasiId: id, jenisMakamId: id, ...jenisMakamTariffFields });

/** Admin Platform enters a new tariff version of a Jenis Makam. */
export async function simpanTarifJenisMakam(_previous: FormState, formData: FormData): Promise<FormState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  return tariffWrite({
    resource: lokasiMitraResource(lokasiId),
    schema: jenisMakamVersionSchema,
    input: { lokasiId, jenisMakamId: formData.get("jenisMakamId"), ...jenisMakamTariffInput(formData) },
    run: (actor, data) =>
      serverRuntime().tariffs.setJenisMakamTariff(actor, data.jenisMakamId, { ...tariffOf(data), reason: data.reason }),
    saved: (data) => `Tarif baru berlaku mulai ${formatTanggal(data.effectiveOn)}.`,
    pages: (data) => lokasiPage(data.lokasiId),
  });
}

const biayaPemakamanSchema = z.object({
  lokasiId: id,
  biayaPemakaman: rupiahInput,
  biayaPemakamanTumpang: optionalRupiahInput,
  effectiveOn,
  reason,
});

/** Admin Platform enters a new Biaya Pemakaman (and tumpang amount) for a Lokasi Mitra. */
export async function simpanBiayaPemakaman(_previous: FormState, formData: FormData): Promise<FormState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  return tariffWrite({
    resource: lokasiMitraResource(lokasiId),
    schema: biayaPemakamanSchema,
    input: {
      lokasiId,
      biayaPemakaman: field(formData, "biayaPemakaman"),
      biayaPemakamanTumpang: field(formData, "biayaPemakamanTumpang"),
      effectiveOn: formData.get("effectiveOn"),
      reason: field(formData, "reason"),
    },
    run: (actor, data) => serverRuntime().tariffs.setBiayaPemakaman(actor, data.lokasiId, data),
    saved: (data) => `Biaya Pemakaman ${formatRupiah(data.biayaPemakaman)} berlaku mulai ${formatTanggal(data.effectiveOn)}.`,
    pages: (data) => lokasiPage(data.lokasiId),
  });
}

const checkedSchema = z.object({ lokasiId: id, reason });

/** Admin Platform marks a Lokasi Mitra's tariffs "diperiksa" (publish gate). */
export async function tandaiTarifDiperiksa(_previous: FormState, formData: FormData): Promise<FormState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  return tariffWrite({
    resource: lokasiMitraResource(lokasiId),
    schema: checkedSchema,
    input: { lokasiId, reason: field(formData, "reason") },
    run: (actor, data) => serverRuntime().tariffs.markTariffsChecked(actor, data.lokasiId, { reason: data.reason }),
    saved: () => "Tarif ditandai sudah diperiksa.",
    pages: (data) => [...lokasiPage(data.lokasiId), `/staf/admin-platform/lokasi/${data.lokasiId}`],
  });
}
