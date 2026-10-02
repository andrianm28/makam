/**
 * The Terencana wizard's own boundaries, as Zod (AGENTS.md: every Server Action and
 * every page validates at its edge). They are the one source of the shape a screen
 * collects and the module accepts, so a form cannot ask for more than an order takes
 * and cannot disagree about the Pemegang Hak's name.
 *
 * This file is deliberately nothing but `zod`: a wizard screen (a Client Component)
 * imports these schemas from the module's public interface, and a module the browser
 * must not reach — anything that opens a database connection — cannot sit in the same
 * file, because a bundler keeps a module whole (the same reason `hariLiburNasionalSchema`
 * and the other Lokasi schemas have a file of their own). Keep it that way: no import
 * from `./terencana`, `./deps` or anywhere outside `zod`.
 */
import { z } from "zod";

/**
 * The chosen units: Petak Makam by id, or one whole Kavling Keluarga by id, and never
 * both in one unit. `TERENCANA_MAKS_UNIT` is the one bound a screen's boundary and the
 * module's order share.
 */
export const TERENCANA_MAKS_UNIT = 50;
export const terencanaUnitSchema = z.union([z.object({ petakId: z.uuid() }).strict(), z.object({ kavlingId: z.uuid() }).strict()]);

/** The Pemegang Hak, as a screen collects it: the Pemesan themselves, or another person with their own contact. */
export const terencanaPemegangHakSchema = z.discriminatedUnion("mode", [
  // No name of their own: the Pemesan's own name is recorded as the holder's.
  z.object({ mode: z.literal("pemesan"), name: z.string().trim().min(1).max(200).optional() }),
  z.object({
    mode: z.literal("lain"),
    name: z.string().trim().min(1).max(200),
    phoneNumber: z.string().trim().min(1).max(30),
    email: z.string().trim().max(320),
  }),
]);

/** The Calon Penghuni: the Pemesan themselves by default, else a name the Pemegang Hak may change later. */
export const terencanaCalonPenghuniSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("saya") }),
  z.object({ mode: z.literal("lain"), name: z.string().trim().min(1).max(200) }),
]);

/** What the wizard's "Lanjut" step sends, read back at the boundary before the module sees it. */
export const periksaPilihanTerencanaSchema = z.object({
  lokasiId: z.uuid(),
  units: z.array(terencanaUnitSchema).min(1).max(TERENCANA_MAKS_UNIT),
});
export type PeriksaPilihanTerencanaInput = z.infer<typeof periksaPilihanTerencanaSchema>;

/** What an order is placed with, at its boundary. */
export const placeTerencanaSchema = z.object({
  pemesan: z.object({ accountId: z.string().min(1), email: z.email() }),
  pemesanName: z.string().trim().min(1).max(200),
  phoneNumber: z.string().trim().min(1).max(30),
  lokasiId: z.uuid(),
  units: z.array(terencanaUnitSchema).min(1).max(TERENCANA_MAKS_UNIT),
  pemegangHak: terencanaPemegangHakSchema,
  calonPenghuni: terencanaCalonPenghuniSchema,
  /** Layanan for the empty plot (ticket 53): one Petak Makam only, each on a date the Pemesan picks. */
  layanan: z
    .array(z.object({ layananVariantId: z.uuid(), targetDate: z.iso.date(), teks: z.string().trim().max(500).nullish() }))
    .max(10)
    .default([]),
});
export type PlaceTerencanaInput = z.infer<typeof placeTerencanaSchema>;
