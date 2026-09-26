import { eq } from "drizzle-orm";
import type { Actor } from "@/domain/identity";
import { lokasiProfileSchema, type LokasiFacility } from "./profile";
import { isLokasiId, writeLokasiMitra, type LokasiDeps, type WriteResult } from "./lokasi-mitra";
import { lokasiMitra as lokasiMitraTable } from "./schema";

/**
 * What a completed Kunjungan Verifikasi (fieldwork module, ticket 15) confirms
 * on site: the Lokasi's pin (at its gate, per the user's decision of
 * 2026-09-26), its facilities checklist and the visit's dated photos. Every
 * field replaces the Lokasi's record (the on-site visit is authoritative).
 */
export interface KunjunganVerifikasiInput {
  pin: { lat: number; lng: number } | null;
  facilities: { checked: string[]; note: string };
  /** FileStore keys of the visit's photos, at least one. */
  photos: string[];
  /** The calendar date (WIB) the visit confirmed the Lokasi. */
  visitedOn: string;
}

export type RecordKunjunganVerifikasiResult = WriteResult | { ok: false; reason: "kunjungan_tidak_valid" };

/**
 * The fieldwork module calls this once a Kunjungan Verifikasi is marked
 * Selesai: it updates the Lokasi's pin, facilities checklist, visit photos and
 * "dikunjungi" date (spec, Field Work), and is what the publish gate's
 * `kunjungan_verifikasi` item reads (`kunjunganVerifikasiSelesai`). Only the
 * Petugas Lapangan who did the visit calls this (checked by the fieldwork
 * module against its own task before calling in); the Lokasi module only
 * checks the role.
 */
export async function recordKunjunganVerifikasi(
  deps: LokasiDeps,
  by: Actor,
  lokasiId: string,
  input: KunjunganVerifikasiInput,
): Promise<RecordKunjunganVerifikasiResult> {
  if (input.photos.length === 0) return { ok: false, reason: "kunjungan_tidak_valid" };
  const parsed = lokasiProfileSchema
    .pick({ pin: true, facilities: true })
    .safeParse({ pin: input.pin, facilities: input.facilities });
  if (!parsed.success) return { ok: false, reason: "kunjungan_tidak_valid" };
  if (!isCalendarDate(input.visitedOn)) return { ok: false, reason: "kunjungan_tidak_valid" };
  return writeLokasiMitra(
    deps,
    by,
    lokasiId,
    "lokasi.catat_kunjungan_verifikasi",
    (row) => ({
      values: {
        pinLat: parsed.data.pin?.lat ?? null,
        pinLng: parsed.data.pin?.lng ?? null,
        facilities: parsed.data.facilities.checked as LokasiFacility[],
        facilitiesNote: parsed.data.facilities.note,
        visitPhotos: input.photos,
        dikunjungiOn: input.visitedOn,
      },
      before: {
        pin: row.pinLat !== null && row.pinLng !== null ? { lat: row.pinLat, lng: row.pinLng } : null,
        facilities: { checked: row.facilities, note: row.facilitiesNote },
        visitPhotos: row.visitPhotos,
        dikunjungiOn: row.dikunjungiOn,
      },
      after: {
        pin: parsed.data.pin,
        facilities: parsed.data.facilities,
        visitPhotos: input.photos,
        dikunjungiOn: input.visitedOn,
      },
    }),
    "lokasi.catat_kunjungan_verifikasi",
  );
}

/** Whether this Lokasi Mitra has a completed Kunjungan Verifikasi (the publish gate's fact); false for an unknown id. */
export async function kunjunganVerifikasiSelesai(deps: LokasiDeps, lokasiId: string): Promise<boolean> {
  if (!isLokasiId(lokasiId)) return false;
  const [row] = await deps.db
    .select({ dikunjungiOn: lokasiMitraTable.dikunjungiOn })
    .from(lokasiMitraTable)
    .where(eq(lokasiMitraTable.id, lokasiId));
  return row?.dikunjungiOn !== null && row?.dikunjungiOn !== undefined;
}

export type RecordCekDenahResult = WriteResult | { ok: false; reason: "catatan_tidak_valid" };

/**
 * The fieldwork module calls this once a Cek Denah is marked Selesai: it
 * records the spot-check on the Lokasi (ticket 16's Terencana-switch input).
 * Replaces any earlier Cek Denah (only the latest counts).
 */
export async function recordCekDenah(
  deps: LokasiDeps,
  by: Actor,
  lokasiId: string,
  input: { checkedAt: Date; note: string },
): Promise<RecordCekDenahResult> {
  const note = input.note.trim();
  if (note.length > 2000) return { ok: false, reason: "catatan_tidak_valid" };
  return writeLokasiMitra(
    deps,
    by,
    lokasiId,
    "lokasi.catat_cek_denah",
    (row) => ({
      values: { cekDenahAt: input.checkedAt, cekDenahNote: note },
      before: { cekDenah: row.cekDenahAt ? { checkedAt: row.cekDenahAt, note: row.cekDenahNote } : null },
      after: { cekDenah: { checkedAt: input.checkedAt, note } },
    }),
    "lokasi.catat_cek_denah",
  );
}

export interface CekDenahRecord {
  checkedAt: Date;
  note: string;
}

/** The latest Cek Denah recorded on this Lokasi (ticket 16's Terencana-switch input), or null before the first one. */
export async function cekDenahOf(deps: LokasiDeps, lokasiId: string): Promise<CekDenahRecord | null> {
  if (!isLokasiId(lokasiId)) return null;
  const [row] = await deps.db
    .select({ cekDenahAt: lokasiMitraTable.cekDenahAt, cekDenahNote: lokasiMitraTable.cekDenahNote })
    .from(lokasiMitraTable)
    .where(eq(lokasiMitraTable.id, lokasiId));
  if (!row?.cekDenahAt) return null;
  return { checkedAt: row.cekDenahAt, note: row.cekDenahNote ?? "" };
}

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
