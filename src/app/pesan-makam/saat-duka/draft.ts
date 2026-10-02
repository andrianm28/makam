import { z } from "zod";
import { itemHariHTpuSchema } from "@/domain/layanan/tpu-skema";
import { FOTO_IPTM_MAX_BYTES, jenisPenguburanSchema, kelayakanSchema, kuburanTpuSchema, pemegangHakSchema } from "@/domain/pengurusan/skema-pengurusan";
import { fileBase64 } from "@/lib/files/base64";

/**
 * What the Saat Duka wizard's "Data & kirim" screen holds, and what its Kirim
 * hands the Server Action: the draft as one value, the state a Kirim answers
 * with, and the city's own filter. No wording of the module's facts here, only
 * the shape a screen collects and this boundary validates (AGENTS.md).
 *
 * The Pengurusan module's own boundary schemas are taken from *its file*, not
 * from its barrel: this file is on a Client Component's import graph, and a
 * bundler keeps a module whole — a value out of a barrel that reaches the
 * database would put `pg` in the browser.
 */

/** The cookie the city filter is prefilled from on the next visit. */
export const KOTA_PILIHAN = "kota_pilihan";

/** The draft, as the form collects it; the Server Action re-validates it with the same schema. */
export const draftSchema = z.object({
  pemesanName: z.string().trim().min(1, "Tulis nama lengkap Anda.").max(200),
  email: z.email("Alamat email tidak valid. Contoh: nama@contoh.id."),
  phoneNumber: z.string().trim().min(1, "Tulis nomor telepon.").max(30),
  almarhumName: z.string().trim().min(1, "Tulis nama almarhum / almarhumah.").max(200),
  tanggalWafat: z.iso.date("Tanggal wafat belum benar."),
  /** The planned burial as a `datetime-local` input holds it (a local WIB time); empty when the family has none. */
  rencanaPemakamanAt: z.union([z.iso.datetime({ local: true, message: "Waktu pemakaman yang direncanakan belum benar." }), z.literal("")]),
  keinginanPenempatan: z.string().trim().max(1000),
  pemegangHak: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("pemesan") }),
    z.object({
      mode: z.literal("lain"),
      name: z.string().trim().min(1, "Tulis nama Pemegang Hak."),
      phoneNumber: z.string().trim().min(1, "Tulis nomor telepon Pemegang Hak."),
      email: z.string().trim(),
    }),
  ]),
  lokasiId: z.string().trim().min(1),
  jenisMakamId: z.string().trim().min(1),
  /** The hari-H Layanan the family added (story 23, ticket 53): a variant and its text each; priced onto the Tagihan when the Lokasi confirms. */
  layananHariH: z.array(itemHariHTpuSchema).max(10).default([]),
});

export type DraftSaatDuka = z.infer<typeof draftSchema>;

/** The IPTM photo a Tumpang carries, as the browser read it and the action takes it. */
const fotoIptmSchema = z.object({
  nama: z.string().trim().max(200),
  contentType: z.string().trim().min(1).max(120),
  isi: fileBase64(FOTO_IPTM_MAX_BYTES),
});

/**
 * The Saat Duka TPU form's draft: the family's own data as "Data & kirim" of a
 * TPU collects it, how the grave is made, the two eligibility answers and the
 * Pemegang Hak for the IPTM. What a Tumpang cannot do without — the grave
 * described and its IPTM photographed — is refused here as well as by the module,
 * so the screen says which field has to be filled in rather than the button
 * turning red.
 */
export const draftTpuSchema = z
  .object({
    pemesanName: z.string().trim().min(1, "Tulis nama lengkap Anda.").max(200),
    email: z.email("Alamat email tidak valid. Contoh: nama@contoh.id."),
    phoneNumber: z.string().trim().min(1, "Tulis nomor telepon.").max(30),
    almarhumName: z.string().trim().min(1, "Tulis nama almarhum / almarhumah.").max(200),
    tanggalWafat: z.iso.date("Tanggal wafat belum benar."),
    tpuId: z.string().trim().min(1),
    jenis: jenisPenguburanSchema,
    kelayakan: kelayakanSchema,
    kuburan: kuburanTpuSchema.nullable(),
    fotoIptm: fotoIptmSchema.nullable(),
    pemegangHak: pemegangHakSchema,
    /** The hari-H Layanan the family added (story 23): a variant and its text each; priced onto the Tagihan at the confirmation. */
    layananHariH: z.array(itemHariHTpuSchema).max(10).default([]),
  })
  .superRefine((draft, ctx) => {
    if (draft.jenis !== "tumpang") return;
    if (!draft.kuburan) ctx.addIssue({ code: "custom", path: ["kuburan", "blokNomor"], message: "Tulis blok dan nomor makam yang akan ditumpang." });
    if (!draft.fotoIptm) ctx.addIssue({ code: "custom", path: ["fotoIptm"], message: "Unggah foto IPTM makam yang akan ditumpang." });
  });

export type DraftTpu = z.infer<typeof draftTpuSchema>;

/**
 * The fields "Data & kirim" collects, each named as the draft names it, with
 * the Pemegang Hak's own fields one level down (`pemegangHak.name`). The draft
 * schema's Zod issues are keyed by exactly these, so a refusal can say which
 * field to fix without the screen mapping names of its own.
 */
export type MasalahDraft = Readonly<Record<string, string>>;

/**
 * What a Kirim answers: placed, waiting for the Kode Masuk that proves the email,
 * or refused in words. A refused draft also says which field to fix, so each
 * message lands under the field that caused it (the design system's inline
 * errors) instead of only under the button.
 */
export type KirimState =
  | { status: "idle" }
  /** The order is placed; the visitor is on its page. */
  | { status: "selesai"; nomor: string }
  /** No session yet: the Kode Masuk step opens under the form. */
  | { status: "perlu_kode_masuk" }
  | { status: "gagal"; message: string; pesan?: MasalahDraft };

export const initialKirimState: KirimState = { status: "idle" };

/** The order page one Pemesanan Makam is read on: the only place its Nomor Pemesanan lives. */
export function pesananPath(nomor: string): string {
  return `/pesanan/${encodeURIComponent(nomor)}`;
}

/** The page one Pengurusan order is read on, the way a Saat Duka TPU submission lands there. */
export function pengurusanPath(nomor: string): string {
  return `/pengurusan/${encodeURIComponent(nomor)}`;
}
