import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { createInventory } from "@/domain/inventory";
import { pernahMenyebutPetakAtauKavling } from "@/domain/pemesanan";
import { inventoryKavling, inventoryPetak } from "@/domain/inventory/schema";
import type { Actor } from "@/domain/identity";
import { newLokasiMitra, signedInAdminLokasi, signedInAdminPlatform, tariffsOnTestDatabase } from "./tariffs";

/** The Inventory module on the test Postgres, next to Tariffs and Lokasi, sharing their fake Clock and Audit Log. */
export function inventoryOnTestDatabase(db: Database) {
  const setup = tariffsOnTestDatabase(db);
  const inventory = createInventory({ db, clock: setup.clock, audit: setup.audit, files: setup.files, tariffs: setup.tariffs, lokasi: setup.lokasi, pemesananPernahMenyebut: pernahMenyebutPetakAtauKavling });
  return { ...setup, inventory };
}

export type InventorySetup = ReturnType<typeof inventoryOnTestDatabase>;

export { newLokasiMitra, signedInAdminLokasi, signedInAdminPlatform } from "./tariffs";

/** A fixed-term Jenis Makam, typed exactly as an Admin Platform would for a new Lokasi Mitra. */
export function jenisMakamInput(name = "Reguler 1 × 2 m") {
  return {
    name,
    description: "",
    tariff: {
      hargaHakPakai: 7_500_000,
      tenure: { kind: "tahun" as const, years: 5 },
      hargaPerpanjangan: 3_000_000,
      effectiveOn: "2026-10-01",
    },
    reason: null,
  };
}

/**
 * A Lokasi Mitra with its own Admin Lokasi and a Jenis Makam ready, the usual
 * starting point for a Denah test.
 */
export async function denahFixture(setup: InventorySetup) {
  const { actor: admin } = await signedInAdminPlatform(setup);
  const lokasiMitra = await newLokasiMitra(setup, admin);
  const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id]);
  const created = await setup.tariffs.createJenisMakam(admin, lokasiMitra.id, jenisMakamInput());
  if (!created.ok) throw new Error(`Jenis Makam refused: ${created.reason}`);
  return { admin, adminLokasi, lokasiMitra, jenisMakam: created.jenisMakam };
}

/** Creates a ready Blok (3 rows × 4 cols, pattern `A-{nn}`) for the fixture's Lokasi and Jenis Makam. */
export async function newBlok(
  setup: InventorySetup,
  fixture: Awaited<ReturnType<typeof denahFixture>>,
  input: { name?: string; rows?: number; cols?: number; numberPattern?: string } = {},
) {
  const created = await setup.inventory.createBlok(fixture.adminLokasi, fixture.lokasiMitra.id, {
    name: input.name ?? "A",
    rows: input.rows ?? 3,
    cols: input.cols ?? 4,
    numberPattern: input.numberPattern,
    jenisMakamId: fixture.jenisMakam.id,
  });
  if (!created.ok) throw new Error(`Blok refused: ${created.reason}`);
  return created.blok;
}

/** A Blok's cells, read back through the module's own reads, in reading order. */
export async function cellsOf(setup: InventorySetup, by: Actor, lokasiId: string, blokId: string) {
  const denah = await setup.inventory.asStaff(by).blok(lokasiId, blokId);
  if (!denah) throw new Error("Blok not found");
  return denah.cells;
}

/**
 * Marks a Petak as having had a Hak Pakai (or Pemakaman), directly on its row.
 * A stand-in until ticket 14 builds the real Hak Pakai entity, whose creation
 * will set this same column for real; every test that needs a "used" Petak
 * without that entity yet uses this instead.
 */
export async function markPetakUsedForTest(db: Database, petakId: string, at: Date): Promise<void> {
  await db.update(inventoryPetak).set({ firstUsedAt: at }).where(eq(inventoryPetak.id, petakId));
}

/** Marks a Kavling Keluarga as having a Hak Pakai; see `markPetakUsedForTest`. */
export async function markKavlingUsedForTest(db: Database, kavlingId: string, at: Date): Promise<void> {
  await db.update(inventoryKavling).set({ firstUsedAt: at }).where(eq(inventoryKavling.id, kavlingId));
}
