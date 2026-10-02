import { z } from "zod";
import { terencanaCalonPenghuniSchema, terencanaLayananSchema, terencanaPemegangHakSchema, terencanaUnitSchema, TERENCANA_MAKS_UNIT } from "@/domain/pemesanan/skema-terencana";

/**
 * What the Terencana wizard's "Data & kirim" screen holds, and what its Kirim hands
 * the Server Action: the draft as one value and the state a Kirim answers with. The
 * units, the Pemegang Hak and the Calon Penghuni are the Pemesanan module's own shapes,
 * so a form cannot ask for more than an order takes; the words below are this screen's.
 *
 * Those schemas are the one deep import in the wizard, and they are here for a
 * measurable reason: this file is a Client Component, and a bundler keeps a module
 * whole, so a *value* taken from `@/domain/pemesanan` would drag the module's
 * database graph (its transaction helper opens a connection) into the browser and the
 * build would fail. `skema-terencana.ts` is nothing but `zod`, so the same
 * `placeTerencanaSchema` the Server Action validates with is the one the form uses.
 * The Server Action re-validates the whole draft with `placeTerencanaSchema` before
 * the module sees it, so nothing reaches the module unvalidated.
 */

export const draftSchema = z.object({
  pemesanName: z.string().trim().min(1, "Tulis nama lengkap Anda.").max(200),
  email: z.email("Alamat email tidak valid. Contoh: nama@contoh.id."),
  phoneNumber: z.string().trim().min(1, "Tulis nomor telepon.").max(30),
  lokasiId: z.string().uuid(),
  units: z.array(terencanaUnitSchema).min(1).max(TERENCANA_MAKS_UNIT),
  pemegangHak: terencanaPemegangHakSchema,
  calonPenghuni: terencanaCalonPenghuniSchema,
  /** Layanan for the empty plot (ticket 53): one Petak Makam only, each on the date the family picks. */
  layanan: terencanaLayananSchema.default([]),
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
