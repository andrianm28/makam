import { z } from "zod";

/**
 * What the Terencana wizard's "Data & kirim" screen holds, and what its Kirim
 * hands the Server Action: the draft as one value and the state a Kirim answers
 * with. No wording of the module's facts here, only the shape a screen collects
 * and this boundary validates (AGENTS.md).
 */

/** One unit the picker chose: a Petak Makam, or one whole Kavling Keluarga. */
export const unitSchema = z.union([z.object({ petakId: z.string().uuid() }).strict(), z.object({ kavlingId: z.string().uuid() }).strict()]);

export const draftSchema = z.object({
  pemesanName: z.string().trim().min(1, "Tulis nama lengkap Anda.").max(200),
  email: z.email("Alamat email tidak valid. Contoh: nama@contoh.id."),
  phoneNumber: z.string().trim().min(1, "Tulis nomor telepon.").max(30),
  lokasiId: z.string().uuid(),
  units: z.array(unitSchema).min(1),
  pemegangHak: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("pemesan") }),
    z.object({
      mode: z.literal("lain"),
      name: z.string().trim().min(1, "Tulis nama Pemegang Hak.").max(200),
      phoneNumber: z.string().trim().min(1, "Tulis nomor telepon Pemegang Hak.").max(30),
      email: z.string().trim().max(320),
    }),
  ]),
  calonPenghuni: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("saya") }),
    z.object({ mode: z.literal("lain"), name: z.string().trim().min(1, "Tulis nama Calon Penghuni.").max(200) }),
  ]),
});

export type DraftTerencana = z.infer<typeof draftSchema>;

/** What a Kirim answers: placed (with its Nomor Pemesanan), waiting for the Kode Masuk that proves the email, or refused in words. */
export type KirimState =
  | { status: "idle" }
  /** No session yet: the Kode Masuk step opens under the form (the wizard's login is that step). */
  | { status: "perlu_kode_masuk" }
  /** The order is placed; its plots are held and the confirmation is shown. */
  | { status: "selesai"; nomor: string }
  | { status: "gagal"; message: string };

export const initialKirimState: KirimState = { status: "idle" };
