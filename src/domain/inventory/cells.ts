import { eq } from "drizzle-orm";
import { z } from "zod";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { InventoryDeps } from "./deps";
import { findBlok } from "./grid";
import { isUsed, loadCells, loadKavlingByBlok, type CellRow, type KavlingRow, type PetakKind } from "./grid";
import { petakDipesan } from "./hold";
import { foldKey } from "./ids";
import { jenisMakamBelongsToLokasi } from "./jenis-makam-lookup";
import { lockBlok, lockLokasiInventory, lockTahan } from "./locks";
import { isValidPattern, numberFromPattern } from "./numbering";
import { inventoryPetak, inventoryPetakKinds } from "./schema";
import { conflictingNomorMakam, nextFreeNumbers } from "./uniqueness";

/** How many of the selected cells a bulk edit actually changed, and which it skipped and why. */
export interface BulkEditOutcome {
  changedIds: string[];
  /** Skipped because it (or its Kavling Keluarga) already had a Hak Pakai or Pemakaman: never deleted, moved or retyped. */
  skippedUsed: string[];
  /** Skipped because it is part of a Kavling Keluarga (split it first). */
  skippedKavling: string[];
}

type NotFound = { ok: false; reason: "blok_tidak_ditemukan" };
type NoSelection = { ok: false; reason: "sel_tidak_ditemukan" };
type AllLocked = { ok: false; reason: "sel_terkunci"; skippedUsed: string[]; skippedKavling: string[] };

async function loadBlokState(deps: InventoryDeps, lokasiId: string, blokId: string) {
  const blok = await findBlok(deps.db, lokasiId, blokId);
  if (!blok) return null;
  const [cells, kavling] = await Promise.all([loadCells(deps.db, blokId), loadKavlingByBlok(deps.db, blokId)]);
  return { blok, cells, kavling };
}

/** Cells among `requestedIds` that exist in `cells`, split into editable / used-locked / (optionally) Kavling-locked. */
function partition(
  cells: readonly CellRow[],
  kavling: Map<string, KavlingRow>,
  requestedIds: readonly string[],
  kavlingAlsoLocks: boolean,
): { editable: CellRow[]; skippedUsed: string[]; skippedKavling: string[] } {
  const requested = new Set(requestedIds);
  const editable: CellRow[] = [];
  const skippedUsed: string[] = [];
  const skippedKavling: string[] = [];
  for (const cell of cells) {
    if (!requested.has(cell.id)) continue;
    if (isUsed(cell, kavling)) skippedUsed.push(cell.id);
    else if (kavlingAlsoLocks && cell.kavlingId) skippedKavling.push(cell.id);
    else editable.push(cell);
  }
  return { editable, skippedUsed, skippedKavling };
}

const cellIdsSchema = z.array(z.uuid()).min(1);

// ---------- ubah jenis sel (Petak Makam / Jalan / Bukan Petak / Pintu Masuk) ----------

export interface SetCellKindInput {
  cellIds: string[];
  kind: PetakKind;
  /** Only used when `kind` is `"petak"`; defaults to the Blok's default Jenis Makam. */
  jenisMakamId?: string;
}

export type SetCellKindResult =
  | { ok: true; outcome: BulkEditOutcome }
  | WriteRefusal
  | NotFound
  | NoSelection
  | AllLocked
  | { ok: false; reason: "sudah_jenis_itu" }
  | { ok: false; reason: "jenis_makam_tidak_ditemukan" }
  /** One of the selected cells is a plot an open Pemesanan Terencana hold names; naming the ones that are. */
  | { ok: false; reason: "sel_dipesan"; dipesan: string[] }
  | { ok: false; reason: "nomor_sudah_dipakai"; conflicts: string[] };

/**
 * Bulk-turns selected cells into Petak Makam, Jalan, Bukan Petak or Pintu Masuk.
 *
 * A cell that is already used (it, or its Kavling Keluarga, ever had a Hak Pakai
 * or Pemakaman) is skipped rather than retyped, which is how a used Petak can
 * never become a Pintu Masuk: the Denah's own gate is the rule, not the button.
 *
 * **A held plot is refused, not skipped, when the target is a Pintu Masuk** — the
 * one decision the two flows need between them. The Terencana hold of a
 * Pemesanan Terencana is a promise about a Petak Makam, and a Pintu Masuk is by
 * definition never one and never pickable: a hold left on it could neither be
 * priced (the cell has no Nomor Makam) nor picked up, so the order would sit on
 * a cell that can never become a plot. A Jalan or a Bukan Petak is a different
 * case and stays as it was — the cell is still there, can become a Petak again
 * from the same editor, and its hold releases the ordinary way (the order
 * declining, being withdrawn or lapsing). Both take the hold namespace's lock
 * (`lockTahan`), so a submission and a retyping queue instead of each reading
 * the other as not there yet.
 */
export async function setCellKind(deps: InventoryDeps, by: Actor, lokasiId: string, blokId: string, input: SetCellKindInput): Promise<SetCellKindResult> {
  const refusal = writeRefusal(by, "denah.ubah", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  const parsed = z.object({ cellIds: cellIdsSchema, kind: z.enum(inventoryPetakKinds), jenisMakamId: z.uuid().optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "sel_tidak_ditemukan" };

  const state = await loadBlokState(deps, lokasiId, blokId);
  if (!state) return { ok: false, reason: "blok_tidak_ditemukan" };
  const { blok, cells, kavling } = state;
  const { editable, skippedUsed, skippedKavling } = partition(cells, kavling, parsed.data.cellIds, true);
  if (editable.length === 0 && skippedUsed.length === 0 && skippedKavling.length === 0) return { ok: false, reason: "sel_tidak_ditemukan" };
  const target = editable.filter((cell) => cell.kind !== parsed.data.kind);
  if (target.length === 0) {
    if (editable.length === 0) return { ok: false, reason: "sel_terkunci", skippedUsed, skippedKavling };
    return { ok: false, reason: "sudah_jenis_itu" };
  }

  let jenisMakamId: string | null = null;
  let newNumbers: string[] = [];
  if (parsed.data.kind === "petak") {
    jenisMakamId = parsed.data.jenisMakamId ?? blok.defaultJenisMakamId;
    if (!(await jenisMakamBelongsToLokasi(deps, by, lokasiId, jenisMakamId))) return { ok: false, reason: "jenis_makam_tidak_ditemukan" };
    newNumbers = await nextFreeNumbers(deps.db, lokasiId, blok.numberPattern, target.length, numberFromPattern);
  }

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    await lockBlok(tx, blokId);
    await lockLokasiInventory(tx, lokasiId);
    if (parsed.data.kind === "pintu_masuk") {
      await lockTahan(tx, lokasiId);
      const dipesan = await petakDipesan(tx, lokasiId, target.map((cell) => cell.id));
      if (dipesan.length > 0) return { ok: false as const, reason: "sel_dipesan" as const, dipesan };
    }
    for (const [index, cell] of target.entries()) {
      if (parsed.data.kind === "petak") {
        const nomorMakam = newNumbers[index];
        await tx
          .update(inventoryPetak)
          .set({ kind: "petak", nomorMakam, nomorMakamKey: foldKey(nomorMakam), jenisMakamId, perluVerifikasi: true, kavlingId: null })
          .where(eq(inventoryPetak.id, cell.id));
      } else {
        await tx
          .update(inventoryPetak)
          .set({ kind: parsed.data.kind, nomorMakam: null, nomorMakamKey: null, jenisMakamId: null, perluVerifikasi: false, kavlingId: null })
          .where(eq(inventoryPetak.id, cell.id));
      }
    }
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "denah.ubah_jenis_sel",
      entity: { kind: "denah_blok", id: blokId },
      lokasiId,
      before: { cells: target.map((cell) => ({ id: cell.id, kind: cell.kind, nomorMakam: cell.nomorMakam })) },
      after: { kind: parsed.data.kind, cellIds: target.map((cell) => cell.id) },
      reason: null,
    });
    return { ok: true as const, outcome: { changedIds: target.map((cell) => cell.id), skippedUsed, skippedKavling } };
  });
}

// ---------- atur Jenis Makam ----------

export interface SetJenisMakamInput {
  cellIds: string[];
  jenisMakamId: string;
}

export type SetJenisMakamResult =
  | { ok: true; outcome: BulkEditOutcome }
  | WriteRefusal
  | NotFound
  | NoSelection
  | AllLocked
  | { ok: false; reason: "jenis_makam_tidak_ditemukan" };

/** Bulk-sets the Jenis Makam of selected Petak Makam (Jalan and Bukan Petak have none). */
export async function setJenisMakam(deps: InventoryDeps, by: Actor, lokasiId: string, blokId: string, input: SetJenisMakamInput): Promise<SetJenisMakamResult> {
  const refusal = writeRefusal(by, "denah.ubah", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  const parsed = z.object({ cellIds: cellIdsSchema, jenisMakamId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "sel_tidak_ditemukan" };
  if (!(await jenisMakamBelongsToLokasi(deps, by, lokasiId, parsed.data.jenisMakamId))) return { ok: false, reason: "jenis_makam_tidak_ditemukan" };

  const state = await loadBlokState(deps, lokasiId, blokId);
  if (!state) return { ok: false, reason: "blok_tidak_ditemukan" };
  const { cells, kavling } = state;
  const { editable, skippedUsed, skippedKavling } = partition(cells, kavling, parsed.data.cellIds, true);
  const target = editable.filter((cell) => cell.kind === "petak");
  if (target.length === 0) {
    if (editable.length === 0 && (skippedUsed.length || skippedKavling.length)) return { ok: false, reason: "sel_terkunci", skippedUsed, skippedKavling };
    return { ok: false, reason: "sel_tidak_ditemukan" };
  }

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    await lockBlok(tx, blokId);
    for (const cell of target) {
      await tx.update(inventoryPetak).set({ jenisMakamId: parsed.data.jenisMakamId }).where(eq(inventoryPetak.id, cell.id));
    }
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "denah.atur_jenis_makam",
      entity: { kind: "denah_blok", id: blokId },
      lokasiId,
      before: { cells: target.map((cell) => ({ id: cell.id, jenisMakamId: cell.jenisMakamId })) },
      after: { jenisMakamId: parsed.data.jenisMakamId, cellIds: target.map((cell) => cell.id) },
      reason: null,
    });
    return { ok: true as const, outcome: { changedIds: target.map((cell) => cell.id), skippedUsed, skippedKavling } };
  });
}

// ---------- ubah nomor (bulk renumber) ----------

export interface RenumberInput {
  cellIds: string[];
  pattern: string;
  /** The running number the first (reading order) selected cell gets; default 1. */
  startAt?: number;
}

export type RenumberResult =
  | { ok: true; outcome: BulkEditOutcome }
  | WriteRefusal
  | NotFound
  | NoSelection
  | AllLocked
  | { ok: false; reason: "pola_tidak_valid" }
  | { ok: false; reason: "nomor_sudah_dipakai"; conflicts: string[] };

/** Bulk-renumbers selected Petak Makam in reading order (row by row, left to right) from `pattern`. */
export async function renumberCells(deps: InventoryDeps, by: Actor, lokasiId: string, blokId: string, input: RenumberInput): Promise<RenumberResult> {
  const refusal = writeRefusal(by, "denah.ubah", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  const parsed = z
    .object({ cellIds: cellIdsSchema, pattern: z.string().trim().min(1).max(60), startAt: z.number().int().min(1).max(100_000).optional() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, reason: "sel_tidak_ditemukan" };
  if (!isValidPattern(parsed.data.pattern)) return { ok: false, reason: "pola_tidak_valid" };

  const state = await loadBlokState(deps, lokasiId, blokId);
  if (!state) return { ok: false, reason: "blok_tidak_ditemukan" };
  const { cells, kavling } = state;
  // Kavling membership does not lock renumbering: a member Petak keeps its own Nomor Makam alongside the Kavling's Nomor Kavling.
  const { editable, skippedUsed, skippedKavling } = partition(cells, kavling, parsed.data.cellIds, false);
  const target = editable.filter((cell) => cell.kind === "petak");
  if (target.length === 0) {
    if (skippedUsed.length) return { ok: false, reason: "sel_terkunci", skippedUsed, skippedKavling };
    return { ok: false, reason: "sel_tidak_ditemukan" };
  }

  const startAt = parsed.data.startAt ?? 1;
  const newNumbers = target.map((_, i) => numberFromPattern(parsed.data.pattern, startAt + i));
  const conflicts = await conflictingNomorMakam(
    deps.db,
    lokasiId,
    newNumbers,
    target.map((cell) => cell.id),
  );
  if (conflicts.length) return { ok: false, reason: "nomor_sudah_dipakai", conflicts };

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    await lockBlok(tx, blokId);
    await lockLokasiInventory(tx, lokasiId);
    for (const [index, cell] of target.entries()) {
      const nomorMakam = newNumbers[index];
      await tx.update(inventoryPetak).set({ nomorMakam, nomorMakamKey: foldKey(nomorMakam) }).where(eq(inventoryPetak.id, cell.id));
    }
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "denah.ubah_nomor",
      entity: { kind: "denah_blok", id: blokId },
      lokasiId,
      before: { cells: target.map((cell) => ({ id: cell.id, nomorMakam: cell.nomorMakam })) },
      after: { cells: target.map((cell, i) => ({ id: cell.id, nomorMakam: newNumbers[i] })) },
      reason: null,
    });
    return { ok: true as const, outcome: { changedIds: target.map((cell) => cell.id), skippedUsed, skippedKavling } };
  });
}

// ---------- ubah satu nomor ----------

export type SetSingleNumberResult =
  | { ok: true; nomorMakam: string }
  | WriteRefusal
  | NotFound
  | { ok: false; reason: "sel_tidak_ditemukan" }
  | { ok: false; reason: "bukan_petak" }
  | { ok: false; reason: "pernah_dipakai" }
  | { ok: false; reason: "nomor_wajib" }
  | { ok: false; reason: "nomor_sudah_dipakai"; conflicts: string[] };

/** Sets one Petak Makam's Nomor Makam directly (the inline edit next to a cell's detail). */
export async function setSingleNumber(deps: InventoryDeps, by: Actor, lokasiId: string, blokId: string, cellId: string, nomorMakam: string): Promise<SetSingleNumberResult> {
  const refusal = writeRefusal(by, "denah.ubah", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  const nomor = nomorMakam.trim();
  if (!nomor) return { ok: false, reason: "nomor_wajib" };

  const state = await loadBlokState(deps, lokasiId, blokId);
  if (!state) return { ok: false, reason: "blok_tidak_ditemukan" };
  const cell = state.cells.find((c) => c.id === cellId);
  if (!cell) return { ok: false, reason: "sel_tidak_ditemukan" };
  if (cell.kind !== "petak") return { ok: false, reason: "bukan_petak" };
  if (isUsed(cell, state.kavling)) return { ok: false, reason: "pernah_dipakai" };

  const conflicts = await conflictingNomorMakam(deps.db, lokasiId, [nomor], [cellId]);
  if (conflicts.length) return { ok: false, reason: "nomor_sudah_dipakai", conflicts };

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    await lockLokasiInventory(tx, lokasiId);
    await tx.update(inventoryPetak).set({ nomorMakam: nomor, nomorMakamKey: foldKey(nomor) }).where(eq(inventoryPetak.id, cellId));
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "denah.ubah_nomor",
      entity: { kind: "denah_blok", id: blokId },
      lokasiId,
      before: { id: cellId, nomorMakam: cell.nomorMakam },
      after: { id: cellId, nomorMakam: nomor },
      reason: null,
    });
    return { ok: true as const, nomorMakam: nomor };
  });
}
