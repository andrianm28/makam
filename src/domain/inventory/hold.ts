/**
 * The plot hold of a Pemesanan Terencana (spec, Inventory > Denah: "a plot hold
 * for Terencana is placed at submission and released on decline, withdrawal or
 * lapse"). It belongs here, with the Petak Makam and Kavling Keluarga it keeps,
 * so "another family already took this plot" is a fact of one transaction rather
 * than a promise on a page.
 */
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { InventoryDeps } from "./deps";
import { lockTahan } from "./locks";
import { publicDenah } from "./picker";
import { inventoryPlotHold } from "./schema";

/** One unit a Pemesan may hold: a Petak Makam, or one whole Kavling Keluarga. */
export interface TahanUnit {
  petakId?: string;
  kavlingId?: string;
}

export interface TahanInput {
  lokasiId: string;
  /** Several Petak Makam (across Blok and Jenis Makam) or one whole Kavling Keluarga, never a mix. */
  units: TahanUnit[];
  /** The Nomor Pemesanan of the order being placed, which the hold names. */
  nomorPemesanan: string;
}

export type TahanResult =
  | { ok: true; /** The units now held, as the order records them. */ units: ({ petakId: string } | { kavlingId: string })[] }
  | { ok: false; reason: "tanpa_unit" }
  | { ok: false; reason: "unit_campur" }
  | { ok: false; reason: "unit_ganda"; unit: string }
  /** A unit that is not a pickable Petak Makam or Kavling Keluarga of this Lokasi Mitra. */
  | { ok: false; reason: "unit_tidak_ditemukan"; unit: string }
  /** Named by its Nomor Makam or Nomor Kavling, with the state that keeps it from being picked. */
  | { ok: false; reason: "unit_tidak_bisa_dipilih"; nomor: string; status: string }
  /** Another order already holds it, or took it between this check and its insert. */
  | { ok: false; reason: "sudah_dipesan"; nomor: string };

export type LepasTahanResult = { ok: true; /** How many units were released. */ released: number };

const unitSchema = z
  .object({ petakId: z.uuid().optional(), kavlingId: z.uuid().optional() })
  .refine((unit) => (unit.petakId === undefined) !== (unit.kavlingId === undefined), { message: "satu unit saja" });

/**
 * No cap on the number of units here: how many plots one Terencana order may hold is
 * the Pemesanan module's own rule, and it is written down once, in that module's
 * boundary (`TERENCANA_MAKS_UNIT`, which its form shares). The hold only answers
 * whether each named unit can be held, all of them or none.
 */
const inputSchema = z.object({ lokasiId: z.uuid(), units: z.array(unitSchema).min(1), nomorPemesanan: z.string().trim().min(1).max(60) });

/**
 * Whether a proposed selection is one an order may hold: several Petak Makam (any
 * Blok, any Jenis Makam) **or** one whole Kavling FAMILY, never a mix and never the
 * same plot twice, because a Kavling Keluarga is one indivisible unit under one Hak
 * Pakai (spec, Hak Pakai). A pure rule, so the picker's screen and the order's own
 * check answer the same question.
 */
export function bolehDitahan(units: readonly TahanUnit[]): BolehDitahanResult {
  if (units.length === 0) return { ok: false, reason: "tanpa_unit" };
  const petak = units.filter((unit) => unit.petakId !== undefined);
  const kavling = units.filter((unit) => unit.kavlingId !== undefined);
  if (petak.length > 0 && kavling.length > 0) return { ok: false, reason: "unit_campur" };
  const seen = new Set<string>();
  for (const unit of units) {
    const id = unit.petakId ?? unit.kavlingId!;
    if (seen.has(id)) return { ok: false, reason: "unit_ganda", unit: id };
    seen.add(id);
  }
  return { ok: true };
}

export type BolehDitahanResult =
  | { ok: true }
  | { ok: false; reason: "tanpa_unit" | "unit_campur" }
  | { ok: false; reason: "unit_ganda"; unit: string };

/**
 * Places the hold on every named unit, all or none, and refuses with the first
 * unit that cannot be taken. It answers with exactly the state the picker's Denah
 * shows, so a plot refused here is the plot drawn as unpickable there.
 *
 * Call it `within` the order's own transaction: the advisory lock that queues two
 * submissions for one plot, the check and the insert then share that transaction,
 * and the hold and the order commit together or not at all.
 */
export async function tahan(deps: InventoryDeps, input: TahanInput): Promise<TahanResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "tanpa_unit" };
  const { lokasiId, units, nomorPemesanan } = parsed.data;
  const boleh = bolehDitahan(units);
  if (!boleh.ok) return boleh;

  // One lock for the whole Lokasi Mitra's hold namespace, taken before any read:
  // two submissions naming the same plot queue here instead of both reading it free.
  // A Denah edit that would take a held plot away (`setCellKind` into a Pintu Masuk)
  // takes the same lock, so the two cannot interleave either.
  await lockTahan(deps.db, lokasiId);

  const denah = await publicDenah(deps, lokasiId);
  const nomorOf = new Map<string, string>();
  const statusOf = new Map<string, string | null>();
  for (const blok of denah?.bloks ?? []) {
    for (const cell of blok.cells) {
      if (cell.status === null) continue;
      nomorOf.set(cell.id, cell.nomorMakam ?? "");
      statusOf.set(cell.id, cell.status);
    }
    for (const satu of blok.kavling) {
      nomorOf.set(satu.id, satu.nomorKavling);
      statusOf.set(satu.id, satu.status);
    }
  }
  const held = await ditahan(deps, lokasiId, units);

  for (const unit of units) {
    const id = unit.petakId ?? unit.kavlingId!;
    const nomor = nomorOf.get(id);
    if (nomor === undefined) return { ok: false, reason: "unit_tidak_ditemukan", unit: id };
    if (held.has(id)) return { ok: false, reason: "sudah_dipesan", nomor };
    const status = statusOf.get(id);
    if (status !== "bisa_dipilih") return { ok: false, reason: "unit_tidak_bisa_dipilih", nomor, status: status ?? "tidak_tersedia" };
  }

  try {
    await deps.db.insert(inventoryPlotHold).values(
      units.map((unit) => ({
        lokasiId,
        petakId: unit.petakId ?? null,
        kavlingId: unit.kavlingId ?? null,
        nomorPemesanan,
        placedAt: deps.clock.now(),
      })),
    );
  } catch (error) {
    // The lock above is what serialises two submissions for one plot; the unique index on the held unit is
    // the database's own word on it, so a caller that reaches here without a transaction is refused, not crashed.
    if (sudahDiambil(error)) return { ok: false, reason: "sudah_dipesan", nomor: nomorOf.get(units[0].petakId ?? units[0].kavlingId!) ?? "" };
    throw error;
  }
  return {
    ok: true,
    units: units.map((unit) => ("petakId" in unit ? { petakId: unit.petakId! } : { kavlingId: unit.kavlingId! })),
  };
}

/** Whether this is Postgres' unique-violation, i.e. the plot is already held. */
function sudahDiambil(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}

/**
 * Releases every hold one order placed, so its plots can be picked again
 * (spec, Inventory > Denah: "a plot hold for Terencana is placed at submission and
 * released on decline, withdrawal or lapse"). **Ticket 37** (the Lokasi Mitra's
 * confirmation, and the payment hold it starts) and **ticket 38** (Pembatalan) are
 * its callers: each of them releases this order's hold in the same transaction as
 * the status change that ends it. Nothing calls it until then, which is why
 * `placeTerencana` + `lepasTahan` are locked by a test in the Pemesanan module's
 * `terencana.test.ts` ("a declined order's plots are free for another family").
 * Releasing an order that holds nothing is harmless.
 */
export async function lepasTahan(deps: InventoryDeps, nomorPemesanan: string): Promise<LepasTahanResult> {
  const released = await deps.db
    .delete(inventoryPlotHold)
    .where(eq(inventoryPlotHold.nomorPemesanan, nomorPemesanan))
    .returning({ id: inventoryPlotHold.id });
  return { ok: true, released: released.length };
}

/**
 * Which of these Petak Makam an open plot hold already names at this Lokasi
 * Mitra (spec, Inventory > Denah: the Terencana hold is placed at submission).
 * The Denah edit that must not take a held plot away reads it through here, so
 * one wording of "sedang dipesan" answers both.
 */
export async function petakDipesan(db: InventoryDeps["db"], lokasiId: string, petakIds: readonly string[]): Promise<string[]> {
  if (petakIds.length === 0) return [];
  const rows = await db
    .select({ petakId: inventoryPlotHold.petakId })
    .from(inventoryPlotHold)
    .where(and(eq(inventoryPlotHold.lokasiId, lokasiId), inArray(inventoryPlotHold.petakId, [...petakIds])));
  return rows.flatMap((row) => (row.petakId ? [row.petakId] : []));
}

/** Which of these units an open hold already names. */
async function ditahan(deps: Pick<InventoryDeps, "db">, lokasiId: string, units: TahanUnit[]): Promise<Set<string>> {
  const petakIds = units.flatMap((unit) => (unit.petakId ? [unit.petakId] : []));
  const kavlingIds = units.flatMap((unit) => (unit.kavlingId ? [unit.kavlingId] : []));
  const held = new Set<string>(await petakDipesan(deps.db, lokasiId, petakIds));
  if (kavlingIds.length > 0) {
    const rows = await deps.db
      .select({ kavlingId: inventoryPlotHold.kavlingId })
      .from(inventoryPlotHold)
      .where(and(eq(inventoryPlotHold.lokasiId, lokasiId), inArray(inventoryPlotHold.kavlingId, kavlingIds)));
    for (const row of rows) if (row.kavlingId) held.add(row.kavlingId);
  }
  return held;
}
