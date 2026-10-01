/**
 * The Denah a Pemesan picks plots on (spec, Inventory > Denah, as the
 * Pemesanan Terencana picker reads it): every Blok with its cells and Kavling
 * Keluarga, each one saying whether it may be picked and why not. No actor: the
 * Terencana wizard's own read, empty for any Lokasi Mitra not listed for
 * Terencana.
 */
import { eq, sql } from "drizzle-orm";
import { wibDateOf } from "@/lib/time/jakarta";
import type { InventoryDeps } from "./deps";
import { loadBloks, loadCells, loadKavlingByBlok, type CellRow, type PetakKind } from "./grid";
import { forStatus, hakPakaiByTarget, type HakPakaiRow, type PemakamanRow } from "./hak-pakai-reads";
import { inventoryPemakaman, inventoryPlotHold } from "./schema";
import { deriveKavlingStatus, derivePetakStatus, type KavlingStatus, type PetakStatus } from "./status";
import { addYears } from "./tenure";

/**
 * What the picker may do with one Petak Makam or Kavling Keluarga. Only
 * `bisa_dipilih` can be picked; each other state has its own words in the legend
 * (Dipesan, Terisi, Tidak Tersedia, Perlu Verifikasi, Masa Hak Pakai habis).
 */
export type PilihanStatus = "bisa_dipilih" | "sedang_dipesan" | "terisi" | "tidak_tersedia" | "perlu_verifikasi" | "masa_berlaku_habis";

/** One Denah cell as the picker shows it. `status` is null for a Jalan or Bukan Petak, which are never pickable. */
export interface PublicDenahCell {
  id: string;
  row: number;
  col: number;
  kind: PetakKind;
  /** The Nomor Makam; null for a Jalan or Bukan Petak. */
  nomorMakam: string | null;
  /** The Jenis Makam that prices it; null for a Jalan, a Bukan Petak and a Petak inside a Kavling Keluarga (priced as one unit). */
  jenisMakamId: string | null;
  /** Set when this Petak is part of a Kavling Keluarga: that Kavling is picked whole. */
  kavlingId: string | null;
  status: PilihanStatus | null;
  /** A Terisi Petak that can still take a tumpang: the picker says "hubungi Admin Lokasi" instead of offering it. */
  tumpangSaja: boolean;
}

export interface PublicDenahKavling {
  id: string;
  nomorKavling: string;
  jenisMakamId: string;
  status: PilihanStatus;
}

export interface PublicDenahBlok {
  id: string;
  name: string;
  rows: number;
  cols: number;
  /** How many units of this Blok a Pemesan may pick (a Kavling Keluarga counts as one); the Blok tab's own count. */
  tersedia: number;
  cells: PublicDenahCell[];
  kavling: PublicDenahKavling[];
}

export interface PublicDenah {
  lokasiId: string;
  /** How many units a Pemesan may pick at this Lokasi Mitra right now, across every Blok. */
  tersedia: number;
  bloks: PublicDenahBlok[];
}

/** The Lokasi Mitra's own tumpang rules, as the picker reads them off the Lokasi module's public profile. */
export interface AturanTumpang {
  allowed: boolean;
  /** Boleh tumpang: how many years must have passed since the last burial. */
  minYears: number;
  maxLayers: number;
  /** A released plot (its Hak Pakai ended, it is not cleared yet) may still take a tumpang. */
  onReleased: boolean;
}

export interface PilihanFacts {
  perluVerifikasi: boolean;
  /** The derived status of the Petak Makam or Kavling Keluarga (never stored, always derived). */
  status: PetakStatus | KavlingStatus;
  /** A Pemesanan Terencana in progress already holds it. */
  held: boolean;
  /** How many are already buried in it. */
  layers: number;
  /** The date of the last burial in it ("YYYY-MM-DD"), or null when none is recorded. */
  terakhirPemakaman: string | null;
  /** The day this is read on, as a WIB calendar date ("YYYY-MM-DD"): the minimum years are counted to it. */
  hariIni: string;
  /** Whether its Hak Pakai has been released (ended or cancelled) while the plot is not cleared yet. */
  released: boolean;
  tumpang: AturanTumpang;
}

/**
 * What the picker may do with one unit, as a pure rule: a Petak needs the Admin
 * Lokasi's clearing before it is sold at all (Perlu Verifikasi, CONTEXT.md), then
 * a hold makes it Dipesan, then its own derived status decides. A Terisi plot that
 * can still take a tumpang is not pickable either, but it is worth saying so: that
 * is a tumpang to arrange with the Admin Lokasi, not a Hak Pakai to buy.
 */
export function pilihanOf(facts: PilihanFacts): { status: PilihanStatus; tumpangSaja: boolean } {
  if (facts.perluVerifikasi) return { status: "perlu_verifikasi", tumpangSaja: false };
  if (facts.held) return { status: "sedang_dipesan", tumpangSaja: false };
  switch (facts.status) {
    case "tersedia":
      return { status: "bisa_dipilih", tumpangSaja: false };
    case "dipesan":
      return { status: "sedang_dipesan", tumpangSaja: false };
    case "tidak_tersedia":
      return { status: "tidak_tersedia", tumpangSaja: false };
    case "masa_berlaku_habis":
      return { status: "masa_berlaku_habis", tumpangSaja: false };
    case "terisi":
      return { status: "terisi", tumpangSaja: bisaTumpang(facts) };
    case "terpakai_sebagian":
    case "penuh":
      return { status: "terisi", tumpangSaja: false };
  }
}

/**
 * Whether this Terisi plot can still take a tumpang (spec, Inventory > Hak Pakai,
 * "boleh tumpang: the minimum years since the last Pemakaman and the most layers in
 * one Petak Makam", and "tumpang on released plots allowed"). Three facts decide it,
 * whichever they apply to: the Lokasi Mitra allows tumpang at all, a released plot
 * needs `tumpangOnReleasedPlots` as well, the last burial is at least `minYears` old,
 * and a layer is still free. A plot with no recorded burial has no years to wait for,
 * so only the Lokasi Mitra's own rule is left to read.
 */
function bisaTumpang(facts: PilihanFacts): boolean {
  if (facts.released ? !facts.tumpang.onReleased : !facts.tumpang.allowed) return false;
  if (facts.layers >= facts.tumpang.maxLayers) return false;
  return facts.terakhirPemakaman === null || addYears(facts.terakhirPemakaman, facts.tumpang.minYears) <= facts.hariIni;
}

/** A Hak Pakai that has ended (Berakhir) or been cancelled, so the plot underneath it is free again. */
function isReleased(hakPakai: HakPakaiRow | null): boolean {
  return hakPakai !== null && (hakPakai.status === "berakhir" || hakPakai.status === "dibatalkan");
}

interface PickerFacts {
  byPetak: Map<string, HakPakaiRow>;
  layers: Map<string, number>;
  /** The date of the last burial in each Petak Makam, for the minimum years a tumpang waits. */
  terakhir: Map<string, string>;
  /** The day this read happens, as a WIB calendar date. */
  hariIni: string;
  held: Set<string>;
  tumpang: AturanTumpang;
}

/** Every Blok of a Lokasi Mitra as the picker shows it; null unless it is listed with Pemesanan Terencana on. */
export async function publicDenah(deps: InventoryDeps, lokasiId: string): Promise<PublicDenah | null> {
  const profile = await deps.lokasi.publicLokasiMitra(lokasiId);
  if (!profile?.terencanaAktif) return null;
  const tumpang: AturanTumpang = {
    allowed: profile.tumpang.allowed,
    minYears: profile.tumpang.minYears,
    maxLayers: profile.tumpang.maxLayers,
    onReleased: profile.tumpang.onReleasedPlots,
  };
  const bloks = await loadBloks(deps.db, lokasiId);
  if (bloks.length === 0) return { lokasiId, tersedia: 0, bloks: [] };

  const [allCells, allKavling, { byPetak, byKavling }, pemakaman, held] = await Promise.all([
    Promise.all(bloks.map((blok) => loadCells(deps.db, blok.id))),
    Promise.all(bloks.map((blok) => loadKavlingByBlok(deps.db, blok.id))),
    hakPakaiByTarget(deps.db, lokasiId),
    pemakamanPerPetak(deps, lokasiId),
    heldUnits(deps, lokasiId),
  ]);
  const facts: PickerFacts = {
    byPetak,
    layers: jumlahPerPetak(pemakaman),
    terakhir: terakhirPerPetak(pemakaman),
    hariIni: wibDateOf(deps.clock.now()),
    held,
    tumpang,
  };

  const tampil = bloks.map((blok, index) => {
      const cells = allCells[index];
      const membersByKavling = new Map<string, string[]>();
      for (const cell of cells) {
        if (!cell.kavlingId) continue;
        membersByKavling.set(cell.kavlingId, [...(membersByKavling.get(cell.kavlingId) ?? []), cell.id]);
      }
    const cellsTampil = cells.map((cell) => publicCell(cell, facts));
    const kavlingTampil = [...allKavling[index].values()].map((row) => {
      const memberIds = membersByKavling.get(row.id) ?? [];
      const withBurial = memberIds.filter((id) => facts.layers.get(id) !== 0).length;
      const withDibongkar = memberIds.filter((id) => cells.find((cell) => cell.id === id)?.pembongkaranAt).length;
      return {
        id: row.id,
        nomorKavling: row.nomorKavling,
        jenisMakamId: row.jenisMakamId,
        status: pilihanOf({
          perluVerifikasi: memberIds.some((id) => cells.find((cell) => cell.id === id)?.perluVerifikasi),
          status: deriveKavlingStatus({
            hakPakai: forStatus(byKavling.get(row.id) ?? null, memberIds.length > 0 && withDibongkar >= memberIds.length),
            totalPetak: memberIds.length,
            petakWithPemakaman: withBurial,
            petakDibongkar: withDibongkar,
          }),
          held: held.has(row.id),
          layers: 0,
          terakhirPemakaman: null,
          hariIni: facts.hariIni,
          released: false,
          tumpang,
        }).status,
      };
    });
    return {
      id: blok.id,
      name: blok.name,
      rows: blok.rows,
      cols: blok.cols,
      tersedia: hitungTersedia(cellsTampil, kavlingTampil),
      cells: cellsTampil,
      kavling: kavlingTampil,
    };
  });
  return { lokasiId, tersedia: tampil.reduce((total, blok) => total + blok.tersedia, 0), bloks: tampil };
}

/** How many units of a Blok a Pemesan may pick, counting a Kavling Keluarga as one: the Blok tab's own count. */
function hitungTersedia(cells: PublicDenahCell[], kavling: PublicDenahKavling[]): number {
  return cells.filter((cell) => cell.status === "bisa_dipilih").length + kavling.filter((satu) => satu.status === "bisa_dipilih").length;
}

function publicCell(cell: CellRow, facts: PickerFacts): PublicDenahCell {
  const base = { id: cell.id, row: cell.row, col: cell.col, kind: cell.kind, nomorMakam: cell.nomorMakam, kavlingId: cell.kavlingId };
  // A Jalan and a Bukan Petak are never a Petak Makam, and a member Petak's state is its Kavling Keluarga's (picked whole).
  if (cell.kind !== "petak" || cell.kavlingId) return { ...base, jenisMakamId: null, status: null, tumpangSaja: false };
  const hakPakai = facts.byPetak.get(cell.id) ?? null;
  const pilihan = pilihanOf({
    perluVerifikasi: cell.perluVerifikasi,
    status: derivePetakStatus({ tidakTersediaReason: cell.tidakTersediaReason, hakPakai: forStatus(hakPakai, cell.pembongkaranAt !== null) }),
    held: facts.held.has(cell.id),
    layers: facts.layers.get(cell.id) ?? 0,
    terakhirPemakaman: facts.terakhir.get(cell.id) ?? null,
    hariIni: facts.hariIni,
    released: isReleased(hakPakai),
    tumpang: facts.tumpang,
  });
  return { ...base, jenisMakamId: cell.jenisMakamId, status: pilihan.status, tumpangSaja: pilihan.tumpangSaja };
}

/** Every Pemakaman of a Lokasi Mitra, oldest first, by the Petak Makam it is in. */
async function pemakamanPerPetak(deps: InventoryDeps, lokasiId: string): Promise<PemakamanRow[]> {
  return deps.db.select().from(inventoryPemakaman).where(eq(inventoryPemakaman.lokasiId, lokasiId)).orderBy(inventoryPemakaman.date);
}

/** How many are buried in each Petak Makam. */
function jumlahPerPetak(pemakaman: readonly PemakamanRow[]): Map<string, number> {
  const jumlah = new Map<string, number>();
  for (const satu of pemakaman) jumlah.set(satu.petakId, (jumlah.get(satu.petakId) ?? 0) + 1);
  return jumlah;
}

/** The date of the last burial in each Petak Makam, which is what a tumpang's minimum years are counted from. */
function terakhirPerPetak(pemakaman: readonly PemakamanRow[]): Map<string, string> {
  const terakhir = new Map<string, string>();
  for (const satu of pemakaman) {
    const ada = terakhir.get(satu.petakId);
    if (ada === undefined || satu.date > ada) terakhir.set(satu.petakId, satu.date);
  }
  return terakhir;
}

/** The Petak Makam and Kavling Keluarga a Pemesanan Terencana in progress holds at a Lokasi Mitra, by unit id. */
async function heldUnits(deps: Pick<InventoryDeps, "db">, lokasiId: string): Promise<Set<string>> {
  const rows = await deps.db
    .select({ unitId: sql<string>`coalesce(${inventoryPlotHold.petakId}, ${inventoryPlotHold.kavlingId})` })
    .from(inventoryPlotHold)
    .where(eq(inventoryPlotHold.lokasiId, lokasiId));
  return new Set(rows.map((row) => row.unitId));
}

/** How many units a Pemesan may pick at each of these Lokasi Mitra; 0 for one that is not listed for Terencana. */
export async function tersediaUntukTerencana(deps: InventoryDeps, lokasiIds: readonly string[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const lokasiId of lokasiIds) {
    const denah = await publicDenah(deps, lokasiId);
    counts[lokasiId] = denah?.tersedia ?? 0;
  }
  return counts;
}
