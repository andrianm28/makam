/**
 * The signed-in Akun's own Makam Keluarga tab (ticket 27, spec stories 101,
 * 193; ADR 0004: "a Hak Pakai shows in the Akun whose Email Terverifikasi
 * equals the recorded email"). It answers the same question as
 * `makamPemegangHak` (every Hak Pakai whose current Pemegang Hak recorded this
 * email) but for the Akun's own tab rather than the public lookup, so it may
 * carry what the lookup's privacy list forbids: the Hak Pakai's own id (for a
 * later ticket's actions) and every Pemakaman it covers in full, not just the
 * Almarhum's name.
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { normaliseEmail } from "@/domain/identity";
import { wibDateOf } from "@/lib/time/jakarta";
import type { InventoryDeps } from "./deps";
import { anggotaKavling, kavlingOf, petakOf } from "./cari-makam";
import { pemakamanOfHakPakai, type HakPakaiRow, type PemakamanRow } from "./hak-pakai-reads";
import { inventoryHakPakai, inventoryPemegangHak } from "./schema";
import type { HakPakaiStatus } from "./status";

/** One Petak Makam of the Akun's own unit, by its current Nomor Makam. */
export interface PetakMakamSaya {
  petakId: string;
  nomorMakam: string;
}

/** One Hak Pakai of the Akun's own Makam tab: a Petak Makam of its own, or a whole Kavling Keluarga. */
export interface MakamSaya {
  hakPakaiId: string;
  lokasiId: string;
  kavlingId: string | null;
  nomorKavling: string | null;
  /** The one Petak, or every Petak of the Kavling Keluarga, in reading order. */
  petak: PetakMakamSaya[];
  status: HakPakaiStatus;
  tenureYears: number | null;
  /** The end date as a WIB calendar date; null while perpetual, or before the tenure clock has started. */
  tanggalBerakhir: string | null;
  /** Every Pemakaman this Hak Pakai covers, oldest first. */
  pemakaman: PemakamanRow[];
}

/**
 * Every Hak Pakai whose current Pemegang Hak recorded this email, with the
 * Akun's own detail on each: the oldest right first, so the tab lists a
 * family's graves in the order it took them (same rule as `makamPemegangHak`).
 */
export async function makamKeluargaSaya(deps: InventoryDeps, input: { email: string }): Promise<MakamSaya[]> {
  const email = normaliseEmail(input.email);
  if (!email) return [];
  const rows = await deps.db
    .select({ hakPakaiId: inventoryPemegangHak.hakPakaiId })
    .from(inventoryPemegangHak)
    .where(and(eq(inventoryPemegangHak.email, email), isNull(inventoryPemegangHak.endAt)));
  if (rows.length === 0) return [];

  const hakPakai = await deps.db
    .select()
    .from(inventoryHakPakai)
    .where(inArray(inventoryHakPakai.id, rows.map((row) => row.hakPakaiId)))
    .orderBy(asc(inventoryHakPakai.startAt), asc(inventoryHakPakai.id));

  const unit: MakamSaya[] = [];
  for (const hak of hakPakai) {
    const petak = hak.petakId
      ? await satuPetak(deps, hak.lokasiId, hak.petakId)
      : hak.kavlingId
        ? await anggotaKavling(deps, hak.kavlingId)
        : [];
    if (petak.length === 0) continue;
    unit.push({
      hakPakaiId: hak.id,
      lokasiId: hak.lokasiId,
      kavlingId: hak.kavlingId,
      nomorKavling: hak.kavlingId ? ((await kavlingOf(deps, hak.lokasiId, hak.kavlingId))?.nomorKavling ?? null) : null,
      petak: petak.map((satu) => ({ petakId: satu.id, nomorMakam: satu.nomorMakam })),
      status: hak.status,
      tenureYears: hak.tenureYears,
      tanggalBerakhir: tanggalBerakhir(hak),
      pemakaman: await pemakamanOfHakPakai(deps.db, hak.id),
    });
  }
  return unit;
}

/** The Hak Pakai's end date as a WIB calendar date; null while perpetual or before the tenure clock starts. */
function tanggalBerakhir(hakPakai: Pick<HakPakaiRow, "endDate">): string | null {
  return hakPakai.endDate === null ? null : wibDateOf(hakPakai.endDate);
}

async function satuPetak(deps: InventoryDeps, lokasiId: string, petakId: string): Promise<{ id: string; nomorMakam: string }[]> {
  const petak = await petakOf(deps, lokasiId, petakId);
  return petak ? [petak] : [];
}
