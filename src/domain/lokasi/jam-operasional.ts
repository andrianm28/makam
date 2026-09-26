import { eq } from "drizzle-orm";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { isLokasiId, writeLokasiMitra, type LokasiDeps, type NotFound, type WriteResult } from "./lokasi-mitra";
import { lokasiMitra } from "./schema";
import { jamOperasionalSchema, type JamOperasional } from "./jam-operasional-schema";
import { deadline, type WorkingTimeResult } from "./working-time";

/** A Lokasi Mitra's Jam Operasional; null until its Admin Lokasi saves one (there is no default). */
export type JamOperasionalResult = { ok: true; jamOperasional: JamOperasional | null } | WriteRefusal | NotFound;

/** A Lokasi Mitra's Jam Operasional, for Admin Platform or one of its Admin Lokasi. */
export async function readJamOperasional(deps: LokasiDeps, by: Actor, lokasiId: string): Promise<JamOperasionalResult> {
  const refusal = writeRefusal(by, "lokasi.lihat", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  return jamOperasionalOf(deps, lokasiId);
}

/**
 * A Lokasi Mitra's Jam Operasional for the calculator (no actor: server code,
 * e.g. deadlines); null until saved, which the calculator refuses.
 */
export async function jamOperasionalOf(
  deps: Pick<LokasiDeps, "db">,
  lokasiId: string,
): Promise<{ ok: true; jamOperasional: JamOperasional | null } | NotFound> {
  if (!isLokasiId(lokasiId)) return { ok: false, reason: "tidak_ditemukan" };
  const [row] = await deps.db
    .select({ jamOperasional: lokasiMitra.jamOperasional })
    .from(lokasiMitra)
    .where(eq(lokasiMitra.id, lokasiId));
  return row ? { ok: true, jamOperasional: row.jamOperasional } : { ok: false, reason: "tidak_ditemukan" };
}

/**
 * `hours` service hours in a Lokasi Mitra's saved Jam Operasional, from
 * `start`, or from now (the Clock) when the caller gives none: e.g. the Saat
 * Duka confirmation deadline. Refused when the Jam Operasional is belum diisi.
 */
export async function serviceHoursDeadline(
  deps: Pick<LokasiDeps, "db" | "clock">,
  lokasiId: string,
  hours: number,
  start?: Date,
): Promise<WorkingTimeResult | NotFound> {
  const read = await jamOperasionalOf(deps, lokasiId);
  if (!read.ok) return read;
  return deadline(read.jamOperasional, start ?? deps.clock.now(), hours);
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
      before: { jamOperasional: row.jamOperasional },
      after: { jamOperasional },
    }),
    "lokasi.atur_operasional",
  );
}
