import { eq } from "drizzle-orm";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { isLokasiId, writeLokasiMitra, type LokasiDeps, type NotFound, type WriteResult } from "./lokasi-mitra";
import { lokasiMitra } from "./schema";
import { jamOperasionalSchema, type JamOperasional, type OpenHours } from "./jam-operasional-schema";

const workday: OpenHours = { opens: "08:00", closes: "16:00" };

/** The Jam Operasional a Lokasi Mitra has until its Admin Lokasi sets one: Monday–Saturday 08:00–16:00, closed Sunday. */
export const DEFAULT_JAM_OPERASIONAL: JamOperasional = {
  weekly: {
    monday: workday,
    tuesday: workday,
    wednesday: workday,
    thursday: workday,
    friday: workday,
    saturday: workday,
    sunday: null,
  },
  tanggalTutup: [],
};

export type JamOperasionalResult = { ok: true; jamOperasional: JamOperasional } | WriteRefusal | NotFound;

/** A Lokasi Mitra's Jam Operasional, for Admin Platform or one of its Admin Lokasi. */
export async function readJamOperasional(deps: LokasiDeps, by: Actor, lokasiId: string): Promise<JamOperasionalResult> {
  const refusal = writeRefusal(by, "lokasi.lihat", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  const jamOperasional = await scheduleOf(deps, lokasiId);
  return jamOperasional ? { ok: true, jamOperasional } : { ok: false, reason: "tidak_ditemukan" };
}

/** A Lokasi Mitra's Jam Operasional for the calculator (no actor: server code, e.g. deadlines); null for no such Lokasi. */
export async function scheduleOf(deps: Pick<LokasiDeps, "db">, lokasiId: string): Promise<JamOperasional | null> {
  if (!isLokasiId(lokasiId)) return null;
  const [row] = await deps.db
    .select({ jamOperasional: lokasiMitra.jamOperasional })
    .from(lokasiMitra)
    .where(eq(lokasiMitra.id, lokasiId));
  if (!row) return null;
  return row.jamOperasional ?? DEFAULT_JAM_OPERASIONAL;
}

export type SetJamOperasionalResult = WriteResult | { ok: false; reason: "jam_operasional_tidak_valid" };

/**
 * The Admin Lokasi (or Admin Platform) sets a Lokasi Mitra's Jam Operasional:
 * weekly hours per weekday (possibly closed) and its Tanggal Tutup. Audited on
 * the Lokasi with the Jam Operasional before and after.
 */
export async function setJamOperasional(
  deps: LokasiDeps,
  by: Actor,
  lokasiId: string,
  input: JamOperasional,
): Promise<SetJamOperasionalResult> {
  const refusal = writeRefusal(by, "lokasi.atur_operasional", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  const parsed = jamOperasionalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "jam_operasional_tidak_valid" };
  const jamOperasional = parsed.data;
  return writeLokasiMitra(
    deps,
    by,
    lokasiId,
    "lokasi.ubah_jam_operasional",
    (row) => ({
      values: { jamOperasional },
      before: { jamOperasional: row.jamOperasional ?? DEFAULT_JAM_OPERASIONAL },
      after: { jamOperasional },
    }),
    "lokasi.atur_operasional",
  );
}
