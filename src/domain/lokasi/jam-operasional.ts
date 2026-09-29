import { eq } from "drizzle-orm";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { isLokasiId, writeLokasiMitra, type LokasiDeps, type NotFound, type WriteResult } from "./lokasi-mitra";
import { lokasiMitra } from "./schema";
import { jamOperasionalSchema, type JamOperasional } from "./jam-operasional-schema";
import { deadline, isOpenAt, type WorkingTimeResult } from "./working-time";

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

/**
 * Whether a Lokasi Mitra is inside its Jam Operasional at the Clock's now: the
 * order card's own fact (a closed Lokasi says when it will confirm instead, and
 * names its Kontak Siaga). No actor. False for a Jam Operasional belum diisi.
 */
export async function bukaSekarang(
  deps: Pick<LokasiDeps, "db" | "clock">,
  lokasiId: string,
): Promise<{ ok: true; buka: boolean } | NotFound> {
  const read = await jamOperasionalOf(deps, lokasiId);
  if (!read.ok) return read;
  return { ok: true, buka: isOpenAt(read.jamOperasional, deps.clock.now()) };
}

/**
 * A Lokasi Mitra's document checklist — the documents it asks a family to bring
 * (spec, Lokasi Mitra > document checklist). No actor: every Lokasi's status
 * has a checklist, and the orders of a Lokasi that is no longer Terverifikasi
 * still do. Empty for a Lokasi Mitra that does not exist.
 */
export async function documentChecklistOf(deps: Pick<LokasiDeps, "db">, lokasiId: string): Promise<string[]> {
  if (!isLokasiId(lokasiId)) return [];
  const [row] = await deps.db
    .select({ checklist: lokasiMitra.documentChecklist })
    .from(lokasiMitra)
    .where(eq(lokasiMitra.id, lokasiId));
  return row?.checklist ?? [];
}

/**
 * A Lokasi Mitra's Saat Duka payment window in hours (its policy, 72 by
 * default): the pay-after Tagihan a Saat Duka order carries is due that long
 * after the burial (spec, Pemesanan). No actor: the due-date rule's own input.
 * Null for a Lokasi Mitra that does not exist.
 */
export async function saatDukaPaymentWindowHours(
  deps: Pick<LokasiDeps, "db">,
  lokasiId: string,
): Promise<number | null> {
  if (!isLokasiId(lokasiId)) return null;
  const [row] = await deps.db
    .select({ jam: lokasiMitra.policies })
    .from(lokasiMitra)
    .where(eq(lokasiMitra.id, lokasiId));
  return row ? row.jam.saatDukaPaymentWindowHours : null;
}

/**
 * A Lokasi Mitra's Terencana hold in hours (its policy, 24 by default): how long a
 * confirmed Pemesanan Terencana holds its plots for the Pemesan to pay, and so when
 * its pay-first Tagihan is due (spec, Pemesanan > Terencana; ticket 37). No actor:
 * the hold's own input. Null for a Lokasi Mitra that does not exist.
 */
export async function terencanaHoldHours(deps: Pick<LokasiDeps, "db">, lokasiId: string): Promise<number | null> {
  if (!isLokasiId(lokasiId)) return null;
  const [row] = await deps.db
    .select({ policies: lokasiMitra.policies })
    .from(lokasiMitra)
    .where(eq(lokasiMitra.id, lokasiId));
  return row ? row.policies.terencanaHoldHours : null;
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
  return writeLokasiMitra(
    deps,
    by,
    lokasiId,
    "lokasi.ubah_jam_operasional",
    (row) => {
      const parsed = jamOperasionalSchema.safeParse(input);
      if (!parsed.success) return { ok: false, reason: "jam_operasional_tidak_valid" } as const;
      const jamOperasional = parsed.data;
      return { values: { jamOperasional }, before: { jamOperasional: row.jamOperasional }, after: { jamOperasional } };
    },
    "lokasi.atur_operasional",
  );
}

/** What a Perpanjangan needs of a Lokasi Mitra: its name and its two policies (Masa Tenggang, K). */
export interface AturanPerpanjangan {
  name: string;
  masaTenggangMonths: number;
  maxPerpanjanganTerms: number;
}

/**
 * A Lokasi Mitra's Perpanjangan rules (spec, Perpanjangan: "open ... to the end
 * of the Masa Tenggang", "Terms 1-K"). No actor, and not gated on the listing:
 * a Perpanjangan carries on for a Lokasi that is no longer Terverifikasi. Null
 * for a Lokasi Mitra that does not exist.
 */
export async function aturanPerpanjanganOf(deps: Pick<LokasiDeps, "db">, lokasiId: string): Promise<AturanPerpanjangan | null> {
  if (!isLokasiId(lokasiId)) return null;
  const [row] = await deps.db
    .select({ name: lokasiMitra.name, policies: lokasiMitra.policies })
    .from(lokasiMitra)
    .where(eq(lokasiMitra.id, lokasiId));
  return row
    ? { name: row.name, masaTenggangMonths: row.policies.masaTenggangMonths, maxPerpanjanganTerms: row.policies.maxPerpanjanganTerms }
    : null;
}
