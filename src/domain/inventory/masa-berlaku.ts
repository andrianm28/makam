/**
 * The end of a fixed-term Hak Pakai (spec, Inventory > Hak Pakai; ticket 42):
 * the transition to Kedaluwarsa the day after its end date, the Masa Tenggang
 * the Lokasi Mitra's own policy sets (default 3 months) during which a
 * Perpanjangan is still accepted, and the Admin Lokasi's own writes at the end
 * of a Hak Pakai: ending it by hand (Berakhir, final) and recording the
 * Pembongkaran that makes the plot Tersedia again.
 *
 * Days are WIB calendar dates, and an end date is a whole date the Hak Pakai is
 * still valid on: Kedaluwarsa starts the day after it, the same day a
 * Perpanjangan's window reads (`perpanjangan/aturan.ts`: open to the end of the
 * Masa Tenggang, both days inclusive).
 */
import { and, eq, inArray, isNotNull, lt, lte } from "drizzle-orm";
import { z } from "zod";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { addWibDateDays, addWibDateMonths, wibDateOf } from "@/lib/time/jakarta";
import type { InventoryDeps } from "./deps";
import { hakPakaiUntukPerpanjangan } from "./perpanjangan";
import { akhiriHakPakai } from "./akhiri-hak-pakai";
import { inventoryHakPakai } from "./schema";

const dateOf = (instant: Date) => instant.toISOString().slice(0, 10);

/**
 * Scheduler tick: every Aktif fixed-term Hak Pakai whose end date is before today (WIB) becomes
 * Kedaluwarsa, so its Petak shows Masa Berlaku Habis. A Selamanya one has no end date and is never
 * touched. Idempotent: a second run finds nothing Aktif left to move. Returns how many it moved.
 */
export async function kedaluwarsaTick(deps: Pick<InventoryDeps, "db">, now: Date): Promise<{ kedaluwarsa: number }> {
  const hariIni = wibDateOf(now);
  const dipindah = await deps.db
    .update(inventoryHakPakai)
    .set({ status: "kedaluwarsa" })
    .where(and(eq(inventoryHakPakai.status, "aktif"), isNotNull(inventoryHakPakai.endDate), lt(inventoryHakPakai.endDate, new Date(`${hariIni}T00:00:00.000Z`))))
    .returning({ id: inventoryHakPakai.id });
  return { kedaluwarsa: dipindah.length };
}

/** A Kedaluwarsa Hak Pakai the Admin Lokasi has yet to decide on: the Antrean Lokasi's "Hak Pakai in masa tenggang" row. */
export interface HakPakaiMasaTenggang {
  hakPakaiId: string;
  /** "Petak A-1", or "Kavling K-1". */
  label: string;
  endDate: string;
  /** The last day a Perpanjangan is accepted. */
  masaTenggangBerakhir: string;
}

/**
 * Every Kedaluwarsa Hak Pakai of a Lokasi Mitra still inside its Masa Tenggang (today, WIB, no later than
 * the end date plus the Lokasi's Masa Tenggang). It leaves the list when a Perpanjangan is paid (the Hak
 * Pakai is Aktif again) or the Hak Pakai is ended; no other state change touches it.
 */
export async function hakPakaiMasaTenggang(deps: InventoryDeps, lokasiId: string): Promise<HakPakaiMasaTenggang[]> {
  const aturan = await deps.lokasi.aturanPerpanjanganOf(lokasiId);
  if (!aturan) return [];
  const hariIni = wibDateOf(deps.clock.now());
  const rows = await deps.db
    .select({ id: inventoryHakPakai.id, endDate: inventoryHakPakai.endDate })
    .from(inventoryHakPakai)
    .where(and(eq(inventoryHakPakai.lokasiId, lokasiId), eq(inventoryHakPakai.status, "kedaluwarsa"), isNotNull(inventoryHakPakai.endDate)))
    .orderBy(inventoryHakPakai.endDate);
  const hasil: HakPakaiMasaTenggang[] = [];
  for (const row of rows) {
    const endDate = dateOf(row.endDate!);
    const masaTenggangBerakhir = addWibDateMonths(endDate, aturan.masaTenggangMonths);
    if (hariIni > masaTenggangBerakhir) continue;
    const hak = await hakPakaiUntukPerpanjangan(deps, row.id);
    const label = hak?.nomorKavling ? `Kavling ${hak.nomorKavling}` : `Petak ${(hak?.petakNomor ?? []).join(", ")}`;
    hasil.push({ hakPakaiId: row.id, label, endDate, masaTenggangBerakhir });
  }
  return hasil;
}

/** A fixed-term Hak Pakai near or past its end, as the reminders read it (the Perpanjangan module decides which reminder is due). */
export interface HakPakaiMenjelangAkhir {
  hakPakaiId: string;
  lokasiId: string;
  status: "aktif" | "kedaluwarsa";
  endDate: string;
}

/**
 * Every Aktif or Kedaluwarsa fixed-term Hak Pakai whose end date is at most `hari` days away (or past): the
 * candidates of the 60/30/7-day and masa tenggang reminders. One that is Perlu Verifikasi with no end date is
 * not here: with no end date there is nothing to count from.
 */
export async function hakPakaiMenjelangAkhir(deps: Pick<InventoryDeps, "db">, now: Date, hari: number): Promise<HakPakaiMenjelangAkhir[]> {
  const batas = new Date(`${addWibDateDays(wibDateOf(now), hari)}T00:00:00.000Z`);
  const rows = await deps.db
    .select({ id: inventoryHakPakai.id, lokasiId: inventoryHakPakai.lokasiId, status: inventoryHakPakai.status, endDate: inventoryHakPakai.endDate })
    .from(inventoryHakPakai)
    .where(and(inArray(inventoryHakPakai.status, ["aktif", "kedaluwarsa"]), isNotNull(inventoryHakPakai.endDate), lte(inventoryHakPakai.endDate, batas)))
    .orderBy(inventoryHakPakai.endDate);
  return rows.map((row) => ({ hakPakaiId: row.id, lokasiId: row.lokasiId, status: row.status as "aktif" | "kedaluwarsa", endDate: dateOf(row.endDate!) }));
}

export const akhiriHakPakaiManualSchema = z.object({ hakPakaiId: z.uuid(), alasan: z.string().trim().min(1).max(300) });
export type AkhiriHakPakaiManualInput = z.infer<typeof akhiriHakPakaiManualSchema>;

export type AkhiriHakPakaiManualResult =
  | { ok: true }
  | WriteRefusal
  | { ok: false; reason: "input_tidak_valid" | "tidak_ditemukan" | "hak_pakai_sudah_berakhir" };

/**
 * The Admin Lokasi of that Lokasi Mitra ends one Hak Pakai by hand: Berakhir, with its reason, final (spec,
 * Inventory > end Hak Pakai). Allowed on an Aktif or a Kedaluwarsa one; a Berakhir or Dibatalkan one is refused.
 * The plot stays Terisi until a Pembongkaran is recorded; a Paket Layanan on the grave stops at its next cycle
 * (Layanan reads the Hak Pakai's status); a resale is a new Hak Pakai. Audited.
 */
export async function akhiriHakPakaiManual(deps: InventoryDeps, by: Actor, lokasiId: string, rawInput: unknown): Promise<AkhiriHakPakaiManualResult> {
  const refusal = writeRefusal(by, "hak_pakai.akhiri", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  const parsed = akhiriHakPakaiManualSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const { hakPakaiId, alasan } = parsed.data;
  const [hak] = await deps.db.select({ status: inventoryHakPakai.status }).from(inventoryHakPakai).where(and(eq(inventoryHakPakai.id, hakPakaiId), eq(inventoryHakPakai.lokasiId, lokasiId)));
  if (!hak) return { ok: false, reason: "tidak_ditemukan" };
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const hasil = await akhiriHakPakai({ db: tx }, { hakPakaiId, alasan });
    if (!hasil.ok) return { ok: false as const, reason: hasil.reason };
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "hak_pakai.akhiri",
      entity: { kind: "hak_pakai", id: hakPakaiId },
      lokasiId,
      before: { status: hak.status },
      after: { status: "berakhir" },
      reason: alasan,
    });
    return { ok: true as const };
  });
}

export const catatPembongkaranSchema = z.object({ hakPakaiId: z.uuid() });

export type CatatPembongkaranResult =
  | { ok: true }
  | WriteRefusal
  | { ok: false; reason: "input_tidak_valid" | "tidak_ditemukan" | "hak_pakai_belum_berakhir" | "sudah_dibongkar" };

/**
 * The Admin Lokasi of that Lokasi Mitra records the Pembongkaran of a Berakhir Hak Pakai's plot: only then does
 * a Terisi plot become empty (Tersedia) again (spec). Refused for a Hak Pakai that has not ended and for one
 * already recorded. Audited.
 */
export async function catatPembongkaran(deps: InventoryDeps, by: Actor, lokasiId: string, rawInput: unknown): Promise<CatatPembongkaranResult> {
  const refusal = writeRefusal(by, "hak_pakai.catat_pembongkaran", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  const parsed = catatPembongkaranSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const { hakPakaiId } = parsed.data;
  const [hak] = await deps.db.select().from(inventoryHakPakai).where(and(eq(inventoryHakPakai.id, hakPakaiId), eq(inventoryHakPakai.lokasiId, lokasiId)));
  if (!hak) return { ok: false, reason: "tidak_ditemukan" };
  if (hak.status !== "berakhir") return { ok: false, reason: "hak_pakai_belum_berakhir" };
  if (hak.pembongkaranAt) return { ok: false, reason: "sudah_dibongkar" };
  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    await tx.update(inventoryHakPakai).set({ pembongkaranAt: now }).where(eq(inventoryHakPakai.id, hakPakaiId));
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "hak_pakai.catat_pembongkaran",
      entity: { kind: "hak_pakai", id: hakPakaiId },
      lokasiId,
      before: { pembongkaran: false },
      after: { pembongkaran: true },
      reason: null,
    });
    return { ok: true as const };
  });
}
