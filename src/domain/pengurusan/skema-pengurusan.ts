import { z } from "zod";

/**
 * The Pengurusan module's own boundary schemas, in a file that is nothing but
 * `zod` (the one deep import a Client Component's graph may take, AGENTS.md):
 * the wizard's form takes them from here, never from the module's barrel, so
 * `pg` never reaches the browser. They are the same objects the module's own
 * tables are typed with.
 */

/** How a grave is made at a TPU: a new plot (Baru) or on top of one that already holds a grave (Tumpang). */
export const jenisPenguburanValues = ["baru", "tumpang"] as const;
export const jenisPenguburanSchema = z.enum(jenisPenguburanValues);
export type JenisPenguburan = z.infer<typeof jenisPenguburanSchema>;

/** What a family answers to the two eligibility questions, both "yes" or both "no" being the only combination an order is refused for. */
export const kelayakanSchema = z.object({
  /** "KTP DKI?" — whether the Pemesan's KTP is a DKI one. */
  ktpDki: z.boolean(),
  /** "Meninggal di Jakarta?" — false adds the Pasal 17(2) documents to the filing set. */
  wafatDiJakarta: z.boolean(),
});
export type Kelayakan = z.infer<typeof kelayakanSchema>;

/** How a Pemesan points at a grave that already holds one, which Tumpang cannot do without. */
export const kuburanTpuSchema = z.object({
  /** Blok and number as the TPU's own sign writes them, e.g. "Blok B-12 No. 34". */
  blokNomor: z.string().trim().min(1, "Tulis blok dan nomor makam.").max(120),
  /** The Almarhum already in that grave. */
  nama: z.string().trim().min(1, "Tulis nama almarhum yang sudah dimakamkan di sana.").max(200),
});
export type KuburanTpu = z.infer<typeof kuburanTpuSchema>;

/**
 * The largest IPTM photo a Tumpang may carry, in bytes: a phone photo of one
 * permit page, read in the browser before it is sent and again by the module
 * that keeps it. The Server Action body limit (11 MB, `next.config.ts`) covers
 * one such photo as base64.
 */
export const FOTO_IPTM_MAX_BYTES = 4 * 1024 * 1024;

/**
 * The Pemegang Hak named for the IPTM (CONTEXT.md): the Pemesan themselves by
 * default, else a relative with their own name, a phone number and, when it is
 * known, an email. Never the Almarhum, who can hold nothing.
 */
export const pemegangHakSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("pemesan") }),
  z.object({
    mode: z.literal("lain"),
    name: z.string().trim().min(1, "Tulis nama Pemegang Hak."),
    phoneNumber: z.string().trim().min(1, "Tulis nomor telepon Pemegang Hak."),
    email: z.string().trim(),
  }),
]);
export type PemegangHakInput = z.infer<typeof pemegangHakSchema>;

/** The Pemegang Hak as the order keeps it: resolved from the input, with the name and contact it will be reached at. */
export interface PemegangHak {
  mode: "pemesan" | "lain";
  name: string;
  /** Canonical E.164 (+62…), a contact only: never verified, never a login. */
  phoneNumber: string | null;
  /** Null when the holder has no address on record; the family's own email is never written here. */
  email: string | null;
}

/** One document of either set, as the family reads it off the checklist. */
export interface Dokumen {
  /** What the document is, in the words the checklist shows. */
  nama: string;
  /** Why it is needed, one short line; null when the name already says it. */
  catatan: string | null;
}

/** The two document sets a Saat Duka TPU order carries (spec, Pengurusan): one for the burial, one for the filing. */
export interface DokumenPemakamanDanPengajuan {
  /** Brought to the TPU on the burial day. */
  pemakaman: Dokumen[];
  /** Uploaded within 7 days after the burial, for the Operator to file the IPTM. */
  pengajuan: Dokumen[];
}
