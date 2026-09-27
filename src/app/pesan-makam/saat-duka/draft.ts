import { z } from "zod";

/**
 * What the Saat Duka wizard's "Data & kirim" screen holds, and what its Kirim
 * hands the Server Action: the draft as one value, the state a Kirim answers
 * with, and the city's own filter. No wording of the module's facts here, only
 * the shape a screen collects and this boundary validates (AGENTS.md).
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
  /** The planned burial as a `datetime-local` input holds it; empty when the family has none. */
  rencanaPemakamanAt: z.string().trim(),
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
});

export type DraftSaatDuka = z.infer<typeof draftSchema>;

/** What a Kirim answers: placed, waiting for the Kode Masuk that proves the email, or refused in words. */
export type KirimState =
  | { status: "idle" }
  /** The order is placed; the visitor is on its page. */
  | { status: "selesai"; nomor: string }
  /** No session yet: the Kode Masuk step opens under the form. */
  | { status: "perlu_kode_masuk" }
  | { status: "gagal"; message: string };

export const initialKirimState: KirimState = { status: "idle" };

/** The order page one Pemesanan Makam is read on: the only place its Nomor Pemesanan lives. */
export function pesananPath(nomor: string): string {
  return `/pesanan/${encodeURIComponent(nomor)}`;
}
