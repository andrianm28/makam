/**
 * The Hak Pakai of one Lokasi Mitra that is Kedaluwarsa and still inside its
 * Masa Tenggang (spec, Work Queues; story 130): what the Antrean Lokasi's own
 * "Hak Pakai in masa tenggang" row reads, so the Admin Lokasi decides whether
 * to end the right or wait for a Perpanjangan.
 *
 * The row is a plain projection, never stored work: a Perpanjangan payment
 * makes the Hak Pakai Aktif again and an ending makes it Berakhir, so the row
 * closes itself either way. The Masa Tenggang length is the Lokasi Mitra's own
 * policy (default 3 months).
 */
import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { Lokasi } from "@/domain/lokasi";
import { wibDateOf } from "@/lib/time/jakarta";
import { dalamMasaTenggang, masaTenggangSelesai } from "./expiry";
import { inventoryHakPakai, inventoryKavling, inventoryPetak, inventoryPemegangHak } from "./schema";

/** One Kedaluwarsa Hak Pakai still in its Masa Tenggang, as the Antrean Lokasi row reads it. */
export interface HakPakaiMasaTenggang {
  hakPakaiId: string;
  /** The Petak Makam number or Kavling Keluarga number, and the current Pemegang Hak's name when on record. */
  subjectLabel: string;
  endDate: string;
  /** The last day a Perpanjangan is still accepted. */
  masaTenggangSelesai: string;
}

export async function hakPakaiMasaTenggang(
  deps: { db: Database; clock: { now(): Date }; lokasi: Pick<Lokasi, "aturanPerpanjanganOf"> },
  lokasiId: string,
): Promise<HakPakaiMasaTenggang[]> {
  const hariIni = wibDateOf(deps.clock.now());
  const aturan = await deps.lokasi.aturanPerpanjanganOf(lokasiId);
  const bulan = aturan?.masaTenggangMonths ?? 3;
  const rows = await deps.db
    .select({
      id: inventoryHakPakai.id,
      petakId: inventoryHakPakai.petakId,
      kavlingId: inventoryHakPakai.kavlingId,
      endDate: inventoryHakPakai.endDate,
    })
    .from(inventoryHakPakai)
    .where(and(eq(inventoryHakPakai.lokasiId, lokasiId), eq(inventoryHakPakai.status, "kedaluwarsa")));

  const hasil: HakPakaiMasaTenggang[] = [];
  for (const row of rows) {
    if (!row.endDate) continue;
    const endDate = row.endDate.toISOString().slice(0, 10);
    if (!dalamMasaTenggang(endDate, bulan, hariIni)) continue;
    hasil.push({
      hakPakaiId: row.id,
      subjectLabel: await labelOf(deps.db, row.id, row.petakId, row.kavlingId),
      endDate,
      masaTenggangSelesai: masaTenggangSelesai(endDate, bulan),
    });
  }
  return hasil;
}

async function labelOf(db: Database, hakPakaiId: string, petakId: string | null, kavlingId: string | null): Promise<string> {
  let nomor = "Petak";
  if (petakId) {
    const [petak] = await db.select({ nomor: inventoryPetak.nomorMakam }).from(inventoryPetak).where(eq(inventoryPetak.id, petakId));
    if (petak?.nomor) nomor = petak.nomor;
  } else if (kavlingId) {
    const [kavling] = await db.select({ nomor: inventoryKavling.nomorKavling }).from(inventoryKavling).where(eq(inventoryKavling.id, kavlingId));
    if (kavling?.nomor) nomor = kavling.nomor;
  }
  const [pemegang] = await db
    .select({ name: inventoryPemegangHak.name })
    .from(inventoryPemegangHak)
    .where(and(eq(inventoryPemegangHak.hakPakaiId, hakPakaiId), isNull(inventoryPemegangHak.endAt)));
  return pemegang?.name ? `${nomor} · ${pemegang.name}` : nomor;
}
