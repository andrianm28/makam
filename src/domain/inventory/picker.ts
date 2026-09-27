/**
 * The Denah a Pemesan picks plots on (spec, Inventory > Denah, as the
 * Pemesanan Terencana picker reads it): every Blok with its cells and Kavling
 * Keluarga, each one saying whether it may be picked and why not. No actor: the
 * Terencana wizard's own read, empty for any Lokasi Mitra not listed for
 * Terencana.
 */
import { eq, sql } from "drizzle-orm";
import type { InventoryDeps } from "./deps";
import { loadBloks, loadCells, loadKavlingByBlok, type CellRow, type PetakKind } from "./grid";
import { forStatus, hakPakaiByTarget, type HakPakaiRow } from "./hak-pakai-reads";
import { inventoryPemakaman, inventoryPlotHold } from "./schema";
import { deriveKavlingStatus, derivePetakStatus, type KavlingStatus, type PetakStatus } from "./status";

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
  cells: PublicDenahCell[];
  kavling: PublicDenahKavling[];
}

export interface PublicDenah {
  lokasiId: string;
  bloks: PublicDenahBlok[];
}

/** The Lokasi Mitra's own tumpang rules, as the picker reads them off the Lokasi module's public profile. */
export interface AturanTumpang {
  allowed: boolean;
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

/** Whether this Terisi plot can still take a tumpang: a released one only when the Lokasi Mitra allows it, a live one within its layer limit. */
function bisaTumpang(facts: PilihanFacts): boolean {
  if (facts.released) return facts.tumpang.onReleased;
  return facts.tumpang.allowed && facts.layers < facts.tumpang.maxLayers;
}

/** A Hak Pakai that has ended (Berakhir) or been cancelled, so the plot underneath it is free again. */
function isReleased(hakPakai: HakPakaiRow | null): boolean {
  return hakPakai !== null && (hakPakai.status === "berakhir" || hakPakai.status === "dibatalkan");
}

interface PickerFacts {
  byPetak: Map<string, HakPakaiRow>;
  layers: Map<string, number>;
  held: Set<string>;
  tumpang: AturanTumpang;
}

/** Every Blok of a Lokasi Mitra as the picker shows it; null unless it is listed with Pemesanan Terencana on. */
export async function publicDenah(deps: InventoryDeps, lokasiId: string): Promise<PublicDenah | null> {
  const profile = await deps.lokasi.publicLokasiMitra(lokasiId);
  if (!profile?.terencanaAktif) return null;
  const tumpang: AturanTumpang = {
    allowed: profile.tumpang.allowed,
    maxLayers: profile.tumpang.maxLayers,
    onReleased: profile.tumpang.onReleasedPlots,
  };
  const bloks = await loadBloks(deps.db, lokasiId);
  if (bloks.length === 0) return { lokasiId, bloks: [] };

  const [allCells, allKavling, { byPetak }, layers, held] = await Promise.all([
    Promise.all(bloks.map((blok) => loadCells(deps.db, blok.id))),
    Promise.all(bloks.map((blok) => loadKavlingByBlok(deps.db, blok.id))),
    hakPakaiByTarget(deps.db, lokasiId),
    pemakamanLayers(deps, lokasiId),
    heldUnits(deps, lokasiId),
  ]);
  const facts: PickerFacts = { byPetak, layers, held, tumpang };

  return {
    lokasiId,
    bloks: bloks.map((blok, index) => {
      const cells = allCells[index];
      const membersByKavling = new Map<string, string[]>();
      for (const cell of cells) {
        if (!cell.kavlingId) continue;
        membersByKavling.set(cell.kavlingId, [...(membersByKavling.get(cell.kavlingId) ?? []), cell.id]);
      }
      return {
        id: blok.id,
        name: blok.name,
        rows: blok.rows,
        cols: blok.cols,
        cells: cells.map((cell) => publicCell(cell, facts)),
        kavling: [...allKavling[index].values()].map((row) => {
          const memberIds = membersByKavling.get(row.id) ?? [];
          const withBurial = memberIds.filter((id) => (layers.get(id) ?? 0) > 0).length;
          return {
            id: row.id,
            nomorKavling: row.nomorKavling,
            jenisMakamId: row.jenisMakamId,
            status: pilihanOf({
              perluVerifikasi: memberIds.some((id) => cells.find((cell) => cell.id === id)?.perluVerifikasi),
              status: deriveKavlingStatus({ hakPakai: forStatus(byPetak.get(row.id) ?? null), totalPetak: memberIds.length, petakWithPemakaman: withBurial }),
              held: held.has(row.id),
              layers: 0,
              released: false,
              tumpang,
            }).status,
          };
        }),
      };
    }),
  };
}

function publicCell(cell: CellRow, facts: PickerFacts): PublicDenahCell {
  const base = { id: cell.id, row: cell.row, col: cell.col, kind: cell.kind, nomorMakam: cell.nomorMakam, kavlingId: cell.kavlingId };
  // A Jalan and a Bukan Petak are never a Petak Makam, and a member Petak's state is its Kavling Keluarga's (picked whole).
  if (cell.kind !== "petak" || cell.kavlingId) return { ...base, jenisMakamId: null, status: null, tumpangSaja: false };
  const hakPakai = facts.byPetak.get(cell.id) ?? null;
  const pilihan = pilihanOf({
    perluVerifikasi: cell.perluVerifikasi,
    status: derivePetakStatus({ tidakTersediaReason: cell.tidakTersediaReason, hakPakai: forStatus(hakPakai) }),
    held: facts.held.has(cell.id),
    layers: facts.layers.get(cell.id) ?? 0,
    released: isReleased(hakPakai),
    tumpang: facts.tumpang,
  });
  return { ...base, jenisMakamId: cell.jenisMakamId, status: pilihan.status, tumpangSaja: pilihan.tumpangSaja };
}

/** How many are buried in each Petak Makam of a Lokasi Mitra. */
async function pemakamanLayers(deps: InventoryDeps, lokasiId: string): Promise<Map<string, number>> {
  const rows = await deps.db
    .select({ petakId: inventoryPemakaman.petakId, jumlah: sql<number>`count(*)::int` })
    .from(inventoryPemakaman)
    .where(eq(inventoryPemakaman.lokasiId, lokasiId))
    .groupBy(inventoryPemakaman.petakId);
  return new Map(rows.map((row) => [row.petakId, row.jumlah]));
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
    counts[lokasiId] = denah
      ? denah.bloks.reduce(
          (total, blok) =>
            total +
            blok.cells.filter((cell) => cell.status === "bisa_dipilih").length +
            blok.kavling.filter((kavling) => kavling.status === "bisa_dipilih").length,
          0,
        )
      : 0;
  }
  return counts;
}
