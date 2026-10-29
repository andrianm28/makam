/**
 * What a "use client" file needs from Lokasi: constants and Zod schemas with no database behind them.
 *
 * A client component imports this file directly (`@/domain/lokasi/skema-klien`), never the
 * `@/domain/lokasi` barrel, because a bundler keeps a module whole and the barrel reaches `pg`
 * (AGENTS.md, "Client import rule"). The owning files (`tpu.ts`, `calendars.ts`, `lokasi-list.ts`,
 * `schema.ts`) import and re-export these, so each value is still written once.
 */
import { z } from "zod";
import { tanggalSchema } from "./jam-operasional-schema";

/** Every status a Lokasi Mitra can have. It starts Belum Tayang; later tickets set the others. */
export const lokasiMitraStatuses = ["belum_tayang", "terverifikasi", "ditangguhkan", "berhenti"] as const;

/** The rows a page of the Lokasi Mitra list shows at most, and by default. */
export const LOKASI_LIST_MAX_PAGE_SIZE = 50;
export const LOKASI_LIST_DEFAULT_PAGE_SIZE = 10;

/**
 * How long each of a TPU's own fields may be typed, in one number per field:
 * the module's schema refuses past it, and a form's `maxLength` stops there,
 * so a length is never written twice (the same split as the Operator settings'
 * `pengaturanOperatorLimits`).
 */
export const TPU_LIMITS = {
  name: 120,
  address: 300,
  city: 120,
  dataSource: 200,
} as const;

/** The most characters a Hari Libur Nasional's name may be typed in. */
export const HARI_LIBUR_NASIONAL_NAME_MAX = 120;

/** A valid Hari Libur Nasional: a real date and a name. */
export const hariLiburNasionalSchema = z.object({
  date: tanggalSchema,
  name: z.string().trim().min(1).max(HARI_LIBUR_NASIONAL_NAME_MAX),
});

/** A Hari Libur Nasional to take off the list: its date, and optionally why. */
export const hapusHariLiburSchema = z.object({ date: tanggalSchema, reason: z.string().trim().max(500) });
