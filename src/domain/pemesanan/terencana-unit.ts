/**
 * The units of a Pemesanan Terencana as its tables keep them, read one way for every
 * caller (the confirmation, the decline, the lapse tick and the staff reads).
 */
import { asc, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { pemesananTerencanaUnit } from "./schema";

export type UnitRow = typeof pemesananTerencanaUnit.$inferSelect;

/** The units of the given orders in one query, keyed by order, each list in the order the Pemesan picked them. */
export async function unitsOfOrders(db: Database, pemesananIds: readonly string[]): Promise<Map<string, UnitRow[]>> {
  const perOrder = new Map<string, UnitRow[]>(pemesananIds.map((id) => [id, []]));
  if (pemesananIds.length === 0) return perOrder;
  const rows = await db
    .select()
    .from(pemesananTerencanaUnit)
    .where(inArray(pemesananTerencanaUnit.pemesananId, [...pemesananIds]))
    .orderBy(asc(pemesananTerencanaUnit.urutan));
  for (const row of rows) perOrder.get(row.pemesananId)?.push(row);
  return perOrder;
}

/** The units of one order, in the order the Pemesan picked them. */
export async function unitsOfOrder(db: Database, pemesananId: string): Promise<UnitRow[]> {
  return (await unitsOfOrders(db, [pemesananId])).get(pemesananId) ?? [];
}

/** A unit by the number the family knows it by: its Nomor Makam, or its Nomor Kavling. */
export const nomorUnit = (unit: Pick<UnitRow, "nomorMakam" | "nomorKavling">): string => unit.nomorMakam ?? unit.nomorKavling ?? "";
