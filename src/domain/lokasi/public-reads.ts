import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { FileStore } from "@/ports/file-store";
import { isLokasiId } from "./lokasi-mitra";
import type { LokasiFacility } from "./profile";
import { lokasiMitra as lokasiMitraTable } from "./schema";

/** How long a signed URL to a Kunjungan Verifikasi visit photo works, on the public Lokasi page. */
export const VISIT_PHOTO_URL_SECONDS = 10 * 60;

type Row = typeof lokasiMitraTable.$inferSelect;

function pinOf(row: Row): { lat: number; lng: number } | null {
  return row.pinLat !== null && row.pinLng !== null ? { lat: row.pinLat, lng: row.pinLng } : null;
}

/** A Terverifikasi Lokasi Mitra's public profile, everything a visitor's Lokasi page needs but the prices (Tariffs). */
export interface PublicLokasiMitra {
  id: string;
  name: string;
  pengelolaName: string;
  address: string;
  city: string;
  pin: { lat: number; lng: number } | null;
  facilities: { checked: LokasiFacility[]; note: string };
  documentChecklist: string[];
  /** Only the two fields the public Pembatalan section needs. */
  pembatalan: { masaPembatalanDays: number; refundAfterMasaPembatalanPercent: number };
  /** Until true, the page hides the Terencana entry (spec, story 151). */
  terencanaAktif: boolean;
  kunjunganVerifikasi: { photos: string[]; visitedOn: string } | null;
  /** Null until its Admin Lokasi saves one (never invented). */
  jamOperasional: Row["jamOperasional"] | null;
}

function toPublicLokasiMitra(row: Row): PublicLokasiMitra {
  return {
    id: row.id,
    name: row.name,
    pengelolaName: row.pengelolaName,
    address: row.address,
    city: row.city,
    pin: pinOf(row),
    facilities: { checked: row.facilities, note: row.facilitiesNote },
    documentChecklist: row.documentChecklist,
    pembatalan: {
      masaPembatalanDays: row.policies.masaPembatalanDays,
      refundAfterMasaPembatalanPercent: row.policies.refundAfterMasaPembatalanPercent,
    },
    terencanaAktif: row.flags.pemesananTerencanaAktif,
    kunjunganVerifikasi: row.dikunjungiOn !== null ? { photos: row.visitPhotos ?? [], visitedOn: row.dikunjungiOn } : null,
    jamOperasional: row.jamOperasional,
  };
}

/**
 * One Terverifikasi (listed) Lokasi Mitra's public profile; null for an
 * unknown id, one not (yet, or no longer) Terverifikasi, or one marked as
 * example data whatever its status says (ticket 86). No actor: this is the
 * public Lokasi page's own read.
 */
export async function publicLokasiMitra(deps: { db: Database }, lokasiId: string): Promise<PublicLokasiMitra | null> {
  if (!isLokasiId(lokasiId)) return null;
  const [row] = await deps.db.select().from(lokasiMitraTable).where(eq(lokasiMitraTable.id, lokasiId));
  if (!row || row.status !== "terverifikasi" || row.dataContoh) return null;
  return toPublicLokasiMitra(row);
}

/** Not example data: the one condition every public listing shares. */
const bukanDataContoh = eq(lokasiMitraTable.dataContoh, false);

/** One card of the Daftar Lokasi Makam directory. */
export interface PublicLokasiMitraCard {
  id: string;
  name: string;
  city: string;
  address: string;
  pin: { lat: number; lng: number } | null;
  facilities: LokasiFacility[];
  kunjunganVerifikasi: { photos: string[]; visitedOn: string } | null;
}

export interface PublicLokasiMitraQuery {
  city?: string;
  /** Only this Lokasi Mitra, the deep link a visitor came from ("Data & kirim" prices that one). */
  id?: string;
  /** Every one of these must be checked (spec, story 7: filterable by facilities). */
  facilities?: LokasiFacility[];
}

function toCard(row: Row): PublicLokasiMitraCard {
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    address: row.address,
    pin: pinOf(row),
    facilities: row.facilities,
    kunjunganVerifikasi: row.dikunjungiOn !== null ? { photos: row.visitPhotos ?? [], visitedOn: row.dikunjungiOn } : null,
  };
}

/**
 * Every Terverifikasi Lokasi Mitra, by name, for the Daftar Lokasi Makam
 * directory: filtered by city (exact) and by facilities (every one checked).
 * No actor: a Lokasi still Belum Tayang, Ditangguhkan or Berhenti is never
 * listed here, nor one marked as example data (ticket 86).
 */
export async function publicLokasiMitraList(
  deps: { db: Database },
  query: PublicLokasiMitraQuery = {},
): Promise<PublicLokasiMitraCard[]> {
  const conditions = [eq(lokasiMitraTable.status, "terverifikasi"), bukanDataContoh];
  if (query.city) conditions.push(eq(lokasiMitraTable.city, query.city));
  if (query.id) conditions.push(eq(lokasiMitraTable.id, query.id));
  const rows = await deps.db
    .select()
    .from(lokasiMitraTable)
    .where(and(...conditions))
    .orderBy(asc(lokasiMitraTable.name), asc(lokasiMitraTable.id));
  const cards = rows.map(toCard);
  if (!query.facilities?.length) return cards;
  return cards.filter((card) => query.facilities!.every((facility) => card.facilities.includes(facility)));
}

/**
 * Signed URLs to a Terverifikasi Lokasi Mitra's Kunjungan Verifikasi visit
 * photos, in upload order (empty for anything else, or once a key no longer
 * exists in the FileStore). No actor: the public Lokasi page's own read.
 */
export async function publicVisitPhotoUrls(deps: { db: Database; files: FileStore }, lokasiId: string): Promise<string[]> {
  const profile = await publicLokasiMitra(deps, lokasiId);
  if (!profile?.kunjunganVerifikasi) return [];
  const urls = await Promise.all(
    profile.kunjunganVerifikasi.photos.map((key) =>
      deps.files.signedUrl(key, { expiresInSeconds: VISIT_PHOTO_URL_SECONDS }).catch(() => null),
    ),
  );
  return urls.filter((url): url is string => url !== null);
}

/** Every city with at least one Terverifikasi Lokasi Mitra, for the directory's city filter. */
export async function publicLokasiMitraCities(deps: { db: Database }): Promise<string[]> {
  const rows = await deps.db
    .selectDistinct({ city: lokasiMitraTable.city })
    .from(lokasiMitraTable)
    .where(and(eq(lokasiMitraTable.status, "terverifikasi"), bukanDataContoh))
    .orderBy(asc(lokasiMitraTable.city));
  return rows.map((row) => row.city);
}
