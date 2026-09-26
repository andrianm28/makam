import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { InventoryDeps } from "./deps";
import { findBlok, type BlokRecord } from "./grid";
import { foldKey } from "./ids";
import { jenisMakamBelongsToLokasi } from "./jenis-makam-lookup";
import { lockLokasiInventory } from "./locks";
import { defaultPattern, isValidPattern, numberFromPattern } from "./numbering";
import { inventoryBlok, inventoryPetak } from "./schema";
import { conflictingNomorMakam } from "./uniqueness";

/** Denah size bounds (spec gives none; a Blok this large is almost certainly a mistake). */
export const MAX_BLOK_DIMENSION = 40;

export interface NewBlokInput {
  name: string;
  rows: number;
  cols: number;
  /** Prefixed with the Blok name by convention, but fully editable (e.g. `A-{nn}`). Defaults from `name`. */
  numberPattern?: string;
  /** Every cell starts a Petak Makam of this Jenis Makam. */
  jenisMakamId: string;
}

const newBlokSchema = z.object({
  name: z.string().trim().min(1).max(60),
  rows: z.number().int().min(1).max(MAX_BLOK_DIMENSION),
  cols: z.number().int().min(1).max(MAX_BLOK_DIMENSION),
  numberPattern: z.string().trim().min(1).max(60).optional(),
  jenisMakamId: z.uuid(),
});

export type CreateBlokResult =
  | { ok: true; blok: BlokRecord }
  | WriteRefusal
  | { ok: false; reason: "input_tidak_valid" }
  | { ok: false; reason: "nama_sudah_ada" }
  | { ok: false; reason: "pola_tidak_valid" }
  | { ok: false; reason: "jenis_makam_tidak_ditemukan" }
  | { ok: false; reason: "nomor_sudah_dipakai"; conflicts: string[] };

/**
 * An Admin Lokasi creates a Blok: a `rows` × `cols` grid, every cell starting
 * a Petak Makam of `jenisMakamId`, numbered from `numberPattern` (or a default
 * derived from the name) in reading order. Every new Petak starts Perlu
 * Verifikasi.
 */
export async function createBlok(deps: InventoryDeps, by: Actor, lokasiId: string, input: NewBlokInput): Promise<CreateBlokResult> {
  const refusal = writeRefusal(by, "denah.ubah", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  const parsed = newBlokSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const name = parsed.data.name.replace(/\s+/g, " ");
  const nameKey = foldKey(name);
  const pattern = parsed.data.numberPattern ?? defaultPattern(name, parsed.data.rows * parsed.data.cols);
  if (!isValidPattern(pattern)) return { ok: false, reason: "pola_tidak_valid" };
  if (!(await jenisMakamBelongsToLokasi(deps, by, lokasiId, parsed.data.jenisMakamId))) {
    return { ok: false, reason: "jenis_makam_tidak_ditemukan" };
  }

  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    await lockLokasiInventory(tx, lokasiId);
    const [taken] = await tx
      .select({ id: inventoryBlok.id })
      .from(inventoryBlok)
      .where(and(eq(inventoryBlok.lokasiId, lokasiId), eq(inventoryBlok.nameKey, nameKey)));
    if (taken) return { ok: false as const, reason: "nama_sudah_ada" as const };

    const total = parsed.data.rows * parsed.data.cols;
    const numbers = Array.from({ length: total }, (_, i) => numberFromPattern(pattern, i + 1));
    const conflicts = await conflictingNomorMakam(tx, lokasiId, numbers);
    if (conflicts.length) return { ok: false as const, reason: "nomor_sudah_dipakai" as const, conflicts };

    const [blokRow] = await tx
      .insert(inventoryBlok)
      .values({
        lokasiId,
        name,
        nameKey,
        numberPattern: pattern,
        rows: parsed.data.rows,
        cols: parsed.data.cols,
        defaultJenisMakamId: parsed.data.jenisMakamId,
        createdAt: now,
        createdByAccountId: by.accountId,
      })
      .returning();

    let n = 0;
    const cells = [];
    for (let row = 0; row < parsed.data.rows; row++) {
      for (let col = 0; col < parsed.data.cols; col++) {
        const nomorMakam = numbers[n++];
        cells.push({
          blokId: blokRow.id,
          lokasiId,
          row,
          col,
          kind: "petak" as const,
          nomorMakam,
          nomorMakamKey: foldKey(nomorMakam),
          jenisMakamId: parsed.data.jenisMakamId,
          perluVerifikasi: true,
          createdAt: now,
        });
      }
    }
    if (cells.length) await tx.insert(inventoryPetak).values(cells);

    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "denah.buat_blok",
      entity: { kind: "denah_blok", id: blokRow.id },
      lokasiId,
      before: null,
      after: { name, numberPattern: pattern, rows: parsed.data.rows, cols: parsed.data.cols, jenisMakamId: parsed.data.jenisMakamId },
      reason: null,
    });

    return { ok: true as const, blok: blokRow };
  });
}

export { findBlok };
