/**
 * Recording a Pemakaman on a Hak Pakai (spec, Inventory > Pemakaman: "Almarhum,
 * date, Petak, layer", and the Hak Pakai's "end date… the clock starts at the
 * first Pemakaman, tumpang doesn't reset it"). The Admin Lokasi of the Lokasi
 * Mitra does it (ticket 25), and the Pemesanan module asks for it `within` the
 * transaction that marks its order Dimakamkan, so the burial and the status it
 * brings commit together.
 *
 * The term is read from the Hak Pakai's own row, never from the caller, and the
 * end date is plain calendar arithmetic on the recorded date: a burial entered
 * weeks after it happened still prices the right from the day it did.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { wibDateOf } from "@/lib/time/jakarta";
import type { InventoryDeps } from "./deps";
import { pemakamanOfHakPakai, type PemakamanRow } from "./hak-pakai-reads";
import { inventoryHakPakai, inventoryPemakaman, inventoryPetak } from "./schema";
import { addYears } from "./tenure";

/** What the Admin Lokasi's "Catat Pemakaman" form sends. */
export const catatPemakamanSchema = z.object({
  /** The Hak Pakai the burial happens under (one plot, or a whole Kavling Keluarga). */
  hakPakaiId: z.uuid(),
  almarhumName: z.string().trim().min(1).max(200),
  /** A whole date (WIB has no bearing on which calendar day a burial falls on). */
  tanggal: z.iso.date(),
  /** Which layer of the plot the Almarhum is laid in; the first by default. */
  layer: z.number().int().min(1).max(20).optional(),
});
export type CatatPemakamanInput = z.infer<typeof catatPemakamanSchema>;

export type CatatPemakamanResult =
  | { ok: true; pemakaman: PemakamanRow; masa: MasaHakPakai }
  | WriteRefusal
  | { ok: false; reason: "input_tidak_valid" }
  /** No Hak Pakai of that id at that Lokasi Mitra. */
  | { ok: false; reason: "hak_pakai_tidak_ditemukan" }
  /** A burial cannot be recorded for a day that has not come. */
  | { ok: false; reason: "tanggal_pemakaman_tidak_valid" }
  /** No Petak to bury in: a Hak Pakai always has one, and its target is its own fact. */
  | { ok: false; reason: "petak_tidak_ditemukan" };

/** The Hak Pakai's masa, as a Bukti Pemesanan prints it: whole dates, and no end for a Selamanya Jenis Makam. */
export interface MasaHakPakai {
  /** The first Pemakaman's date, the day the term counts from; null while no burial is recorded. */
  mulai: string | null;
  /** The end of a fixed term, or null for a perpetual one. */
  selesai: string | null;
}

/**
 * Records one Pemakaman on a Hak Pakai and, when it is the first, starts its
 * tenure clock: `tenure_start_at` becomes the burial's date and a fixed-term
 * `end_date` that date plus the Jenis Makam's years. A later burial (a tumpang)
 * is recorded and leaves the clock exactly where the first put it.
 */
export async function catatPemakaman(
  deps: InventoryDeps,
  by: Actor,
  lokasiId: string,
  rawInput: unknown,
): Promise<CatatPemakamanResult> {
  const refusal = writeRefusal(by, "pemakaman.catat", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  const parsed = catatPemakamanSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;

  const now = deps.clock.now();
  const [hakPakai] = await deps.db
    .select()
    .from(inventoryHakPakai)
    .where(and(eq(inventoryHakPakai.id, input.hakPakaiId), eq(inventoryHakPakai.lokasiId, lokasiId)));
  if (!hakPakai) return { ok: false, reason: "hak_pakai_tidak_ditemukan" };
  if (!hakPakai.petakId) return { ok: false, reason: "petak_tidak_ditemukan" };
  // The Clock's own day is the last day a burial may be recorded for: the form
  // takes the date that happened, never one still to come.
  if (input.tanggal > wibDateOf(now)) return { ok: false, reason: "tanggal_pemakaman_tidak_valid" };

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [row] = await tx
      .insert(inventoryPemakaman)
      .values({
        lokasiId,
        petakId: hakPakai.petakId!,
        hakPakaiId: hakPakai.id,
        almarhumName: input.almarhumName,
        date: input.tanggal,
        layer: input.layer ?? 1,
        createdAt: now,
        createdByAccountId: by.accountId,
      })
      .returning();
    // The first burial starts the clock; a later one (a tumpang) never resets it.
    if (!hakPakai.tenureStartAt) {
      await tx
        .update(inventoryHakPakai)
        .set({ tenureStartAt: dateOnly(input.tanggal), endDate: endDateColumn(hakPakai.tenureYears, input.tanggal) })
        .where(eq(inventoryHakPakai.id, hakPakai.id));
    }
    // A plot nobody has ever used becomes used the moment someone is buried in it.
    await tx.update(inventoryPetak).set({ firstUsedAt: now }).where(eq(inventoryPetak.id, hakPakai.petakId!));
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "pemakaman.catat",
      entity: { kind: "pemakaman", id: row.id },
      lokasiId,
      before: { hakPakaiId: hakPakai.id, pemakaman: (await pemakamanOfHakPakai(tx, hakPakai.id)).length },
      after: { hakPakaiId: hakPakai.id, almarhum: input.almarhumName, tanggal: input.tanggal, layer: input.layer ?? 1 },
      reason: null,
    });
    const tercatat = (await pemakamanOfHakPakai(tx, hakPakai.id)).find((satu) => satu.id === row.id);
    if (!tercatat) throw new Error("recorded Pemakaman not found");
    return {
      ok: true as const,
      pemakaman: tercatat,
      masa: masaHakPakaiOf(hakPakai, input.tanggal),
    };
  });
}

/** The masa this recording leaves behind: the burial just made plus its term, or the clock already running. */
function masaHakPakaiOf(hakPakai: { tenureStartAt: Date | null; tenureYears: number | null }, tanggal: string): MasaHakPakai {
  if (hakPakai.tenureStartAt) {
    // `tenure_start_at` is a date column written at UTC midnight, so it reads
    // back as the calendar day it was — never as a WIB instant.
    const mulai = hakPakai.tenureStartAt.toISOString().slice(0, 10);
    return { mulai, selesai: endDateOf(mulai, hakPakai.tenureYears) };
  }
  return { mulai: tanggal, selesai: endDateOf(tanggal, hakPakai.tenureYears) };
}

/** A fixed term's end date, `years` after the date the clock started; null for a Selamanya Jenis Makam. */
function endDateOf(mulai: string, tenureYears: number | null): string | null {
  return tenureYears === null ? null : addYears(mulai, tenureYears);
}

/** The same end date as the `end_date` column keeps it: a date, not an instant. */
function endDateColumn(tenureYears: number | null, mulai: string): Date | null {
  const selesai = endDateOf(mulai, tenureYears);
  return selesai === null ? null : dateOnly(selesai);
}

/** "YYYY-MM-DD" as a `Date` at that calendar day's UTC midnight: `tenure_start_at` and `end_date` are dates, not instants. */
function dateOnly(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}
