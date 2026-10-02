import { z } from "zod";
import { tumpangJenisKeys } from "@/domain/pemesanan/skema-tumpang";

/**
 * What "Makamkan di sini" holds (ticket 35): only the Almarhum and the Pemesan, plus the address of the grave it
 * came from. The grave is chosen at the hub, so there is no plot to pick. On a client import graph: the one value
 * taken from the module is its own small `skema-tumpang` file, never the barrel or the table file (AGENTS.md).
 */
export const draftTumpangSchema = z.object({
  pemesanName: z.string().trim().min(1, "Tulis nama lengkap Anda.").max(200),
  email: z.email("Alamat email tidak valid. Contoh: nama@contoh.id."),
  phoneNumber: z.string().trim().min(1, "Tulis nomor telepon.").max(30),
  almarhumName: z.string().trim().min(1, "Tulis nama almarhum / almarhumah.").max(200),
  tanggalWafat: z.iso.date("Tanggal wafat belum benar."),
  /** The planned burial as a `datetime-local` input holds it; empty when the family has none. */
  rencanaPemakamanAt: z.union([z.iso.datetime({ local: true, message: "Waktu pemakaman yang direncanakan belum benar." }), z.literal("")]),
  lokasiId: z.uuid(),
  hakPakaiId: z.uuid(),
  /** The member Petak of a Kavling Keluarga the burial goes to. */
  petakId: z.uuid().optional(),
  jenis: z.enum(tumpangJenisKeys),
});
export type DraftTumpang = z.infer<typeof draftTumpangSchema>;
