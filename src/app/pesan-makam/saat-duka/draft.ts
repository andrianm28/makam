import { z } from "zod";
import { itemHariHTpuSchema } from "@/domain/layanan/tpu-skema";
import { FOTO_IPTM_MAX_BYTES, jenisPenguburanSchema, kelayakanSchema, kuburanTpuSchema, pemegangHakSchema, type JenisPenguburan } from "@/domain/pengurusan/skema-pengurusan";
import { fileBase64 } from "@/lib/files/base64";

/** The hari-H Layanan the family added (story 23, ticket 53): a variant and its text each; priced onto the Tagihan when the Lokasi confirms. */
const layananHariHSchema = z.array(itemHariHTpuSchema).max(10).default([]);

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
  layananHariH: layananHariHSchema,
});

export type DraftSaatDuka = z.infer<typeof draftSchema>;

/** The IPTM photo a Tumpang carries, as the browser read it and the action takes it. */
const fotoIptmSchema = z.object({
  nama: z.string().trim().max(200),
  contentType: z.string().trim().min(1).max(120),
  isi: fileBase64(FOTO_IPTM_MAX_BYTES),
});

/**
 * What a Tumpang is refused with when its family has not ticked that it understands the conditions of a tumpang at a TPU:
 * the IPTM must be in force and the burial before it three years or more ago, and a grave that is not the family's own needs
 * the Pemegang Hak's letter of consent (owner rule C3, 2026-10-05). The one wording, said under the checkbox.
 */
export const PERSETUJUAN_TUMPANG_WAJIB = "Centang dulu persetujuan syarat Tumpang (aturan 3 tahun dan surat persetujuan Pemegang Hak) sebelum mengirim.";

/** Which orders must carry the family's confirmation of the tumpang conditions: a Tumpang, and no other. The form and the schema below ask the same question of the same function. */
export function perluPersetujuanTumpang(jenis: JenisPenguburan): boolean {
  return jenis === "tumpang";
}

/**
 * The Saat Duka TPU form's draft: the family's own data as "Data & kirim" of a
 * TPU collects it, how the grave is made, the two eligibility answers and the
 * Pemegang Hak for the IPTM. What a Tumpang cannot do without — the grave
 * described, its IPTM photographed and the box ticked that the family understands
 * the tumpang conditions — is refused here as well as by the module (the
 * confirmation is the Server Action's alone: staff placements have no checkbox),
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
    layananHariH: layananHariHSchema,
    /** Only a literal `true` is a confirmation: a request that leaves it out, or sends anything else, has not confirmed. */
    persetujuanTumpang: z.boolean().catch(false),
  })
  .superRefine((draft, ctx) => {
    if (!perluPersetujuanTumpang(draft.jenis)) return;
    if (!draft.kuburan) ctx.addIssue({ code: "custom", path: ["kuburan", "blokNomor"], message: "Tulis blok dan nomor makam yang akan ditumpang." });
    if (!draft.fotoIptm) ctx.addIssue({ code: "custom", path: ["fotoIptm"], message: "Unggah foto IPTM makam yang akan ditumpang." });
    if (!draft.persetujuanTumpang) ctx.addIssue({ code: "custom", path: ["persetujuanTumpang"], message: PERSETUJUAN_TUMPANG_WAJIB });
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

/** Where a placed order sends the family, or null when the screen stays (a refusal, or the Kode Masuk step). */
export function tujuanSetelahKirim(hasil: KirimState): string | null {
  return hasil.status === "selesai" ? pesananPath(hasil.nomor) : null;
}

/** The page one Pengurusan order is read on, the way a Saat Duka TPU submission lands there. */
export function pengurusanPath(nomor: string): string {
  return `/pengurusan/${encodeURIComponent(nomor)}`;
}

/**
 * One message per field, keyed by the field that has to be fixed
 * (`pemegangHak.name` for a Pemegang Hak's own name), in the order the schema
 * complained: the first is the one to say under the button.
 */
export function masalahDariIssues(issues: readonly z.core.$ZodIssue[]): MasalahDraft {
  const satuPerField: Record<string, string> = {};
  for (const issue of issues) {
    const field = issue.path.join(".");
    if (field !== "" && !(field in satuPerField))
      satuPerField[field] = issue.message;
  }
  return satuPerField;
}
