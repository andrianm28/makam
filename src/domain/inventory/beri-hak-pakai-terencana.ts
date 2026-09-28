/**
 * Giving a held Petak Makam or Kavling Keluarga to a Pemegang Hak when a
 * Pemesanan Terencana is paid (spec, Pemesanan > Terencana: "Aktif (paid, one
 * Hak Pakai per Petak / Kavling Keluarga, same Pemegang Hak)"; ticket 37).
 *
 * It is a grant of its own, and not `beriHakPakai`, because the plot is not
 * `Tersedia` here: **this order's own hold** stands on it, placed at submission
 * (spec, Inventory > Denah: "a plot hold for Terencana is placed at submission").
 * So the rule this enforces is the hold's — the unit must be held by exactly
 * this Nomor Pemesanan — and one Hak Pakai covers one chosen unit: a Petak
 * Makam, or a whole Kavling Keluarga, never its member Petak one by one (a
 * Kavling Keluarga is sold as one indivisible unit under one Hak Pakai).
 *
 * Every unit of one order carries the **same** Pemegang Hak and the same
 * Calon Penghuni label (the order records both once), and the tenure clock
 * stays unstarted: `end_date` is empty until the first Pemakaman, which is
 * ticket 25's `catatPemakaman` and not this grant's business.
 *
 * It takes no actor and opens no transaction of its own: the payment effect's
 * tick is the caller, and it must commit with the status change it makes. It
 * records one Entri Audit per unit, naming the Admin Lokasi whose confirmation
 * asked for it — the decision is that Admin Lokasi's, and the payment only made
 * it effective.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "@/domain/identity";
import type { InventoryDeps } from "./deps";
import { currentHakPakaiOfKavling, currentHakPakaiOfPetak } from "./hak-pakai-reads";
import { grantHakPakai } from "./hak-pakai-grant";
import { lockBlok, lockLokasiInventory, lockTahan } from "./locks";
import { inventoryKavling, inventoryPetak, inventoryPlotHold } from "./schema";
import { tenureOfJenisMakam } from "./tenure";

/** One chosen unit of a Terencana order, as the order's own row names it. */
const unitSchema = z
  .object({ petakId: z.uuid().optional(), kavlingId: z.uuid().optional() })
  .refine((unit) => (unit.petakId === undefined) !== (unit.kavlingId === undefined), { message: "satu unit saja" });

export const beriHakPakaiTerencanaSchema = z.object({
  /** The order whose hold stands on the unit; a unit held by another order is never taken. */
  nomorPemesanan: z.string().trim().min(1).max(60),
  unit: unitSchema,
  jenisMakamId: z.uuid(),
  pemegangHak: z.object({ name: z.string().trim().min(1).max(200), phoneNumber: z.string().trim().min(1).max(30), email: z.string().trim().max(320).optional() }),
  /** The Calon Penghuni the order recorded; null while the plot is prepared for the Pemesan themselves under no name. */
  calonPenghuni: z.string().trim().min(1).max(200).nullable(),
  /** The Admin Lokasi that confirmed the order, whose Entri Audit the grant is recorded under. */
  dikonfirmasiOleh: z.string().trim().min(1).max(64),
});
export type BeriHakPakaiTerencanaInput = z.infer<typeof beriHakPakaiTerencanaSchema>;

export type BeriHakPakaiTerencanaResult =
  | {
      ok: true;
      hakPakaiId: string;
      nomor: string;
      /**
       * The term the Hak Pakai was granted with: the Jenis Makam's own, in years, or
       * null for Selamanya. Read here, never taken from the caller, and handed back so
       * the Bukti Pemesanan states the same term the grant made (CONTEXT.md: a Hak Pakai
       * keeps the Masa Hak Pakai of its Jenis Makam as it was when it was bought).
       */
      tenureYears: number | null;
    }
  | { ok: false; reason: "input_tidak_valid" }
  /** No Petak Makam or Kavling Keluarga of that id at this Lokasi Mitra. */
  | { ok: false; reason: "unit_tidak_ditemukan" }
  /** The Petak Makam or Kavling Keluarga carries another Jenis Makam than the order priced. */
  | { ok: false; reason: "jenis_makam_beda" }
  /** The unit is not held by this order, so it is not this order's to give. */
  | { ok: false; reason: "unit_tidak_ditahan" }
  /** The unit already has a Hak Pakai (a second order took it, or an ending and resale). */
  | { ok: false; reason: "sudah_ada_hak_pakai" };

/**
 * Grants the Hak Pakai of one held unit to the order's Pemegang Hak, with the
 * order's Calon Penghuni label, inside the caller's transaction.
 *
 * The hold is the permission, so the hold and the target are read under the same
 * advisory lock `tahan()` takes: a withdrawal or a lapse that releases the hold
 * while this runs queues behind it instead of both writing.
 */
export async function beriHakPakaiTerencana(
  deps: InventoryDeps,
  tx: InventoryDeps["db"],
  lokasiId: string,
  rawInput: unknown,
): Promise<BeriHakPakaiTerencanaResult> {
  const parsed = beriHakPakaiTerencanaSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;
  const petakId = input.unit.petakId ?? null;
  const kavlingId = input.unit.kavlingId ?? null;

  await lockTahan(tx, lokasiId);
  const [ditahan] = await tx
    .select({ id: inventoryPlotHold.id })
    .from(inventoryPlotHold)
    .where(
      and(
        eq(inventoryPlotHold.nomorPemesanan, input.nomorPemesanan),
        eq(inventoryPlotHold.lokasiId, lokasiId),
        petakId ? eq(inventoryPlotHold.petakId, petakId) : eq(inventoryPlotHold.kavlingId, kavlingId!),
      ),
    )
    .limit(1);
  if (!ditahan) return { ok: false, reason: "unit_tidak_ditahan" };

  const target = await readUnit(tx, lokasiId, petakId, kavlingId);
  if (!target) return { ok: false, reason: "unit_tidak_ditemukan" };
  if (target.jenisMakamId !== input.jenisMakamId) return { ok: false, reason: "jenis_makam_beda" };
  if (await currentHakPakaiOfTarget(tx, petakId, kavlingId)) return { ok: false, reason: "sudah_ada_hak_pakai" };

  // The tenure is the Jenis Makam's own term, read here and never taken from the caller,
  // exactly as `beriHakPakai` reads it; the clock still starts at the first Pemakaman.
  const by: Actor = { accountId: input.dikonfirmasiOleh, email: "", phoneNumber: "", roles: ["admin_lokasi"], lokasiIds: [lokasiId], totp: "tidak_perlu", sessionId: "" };
  const tenure = await tenureOfJenisMakam(deps, by, lokasiId, input.jenisMakamId);
  const now = deps.clock.now();

  return deps.audit.staffWrite(tx, async (inner, record) => {
    await lockLokasiInventory(inner, lokasiId);
    await lockBlok(inner, target.blokId);
    // Re-read under the locks: a second grant for the same unit can never both pass.
    const terkunci = await readUnit(inner, lokasiId, petakId, kavlingId);
    if (!terkunci) return { ok: false as const, reason: "unit_tidak_ditemukan" as const };
    if (await currentHakPakaiOfTarget(inner, petakId, kavlingId)) return { ok: false as const, reason: "sudah_ada_hak_pakai" as const };
    const hakPakaiId = await grantHakPakai(inner, now, by, {
      lokasiId,
      petakId,
      kavlingId,
      tenure,
      dataMenyusul: false,
      pemegangHak: input.pemegangHak,
      pemakaman: null,
      calonPenghuni: input.calonPenghuni,
    });
    if (petakId) await inner.update(inventoryPetak).set({ firstUsedAt: now }).where(eq(inventoryPetak.id, petakId));
    if (kavlingId) await inner.update(inventoryKavling).set({ firstUsedAt: now }).where(eq(inventoryKavling.id, kavlingId));
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "denah.pakai_unit",
      entity: { kind: kavlingId ? "denah_kavling" : "denah_petak", id: kavlingId ?? petakId! },
      lokasiId,
      before: { nomor: target.nomor, status: "sedang_dipesan" },
      after: { nomor: target.nomor, status: "terisi", hakPakaiId, pemegangHak: input.pemegangHak.name, calonPenghuni: input.calonPenghuni },
      reason: `Pemesanan Terencana ${input.nomorPemesanan} dibayar`,
    });
    return { ok: true as const, hakPakaiId, nomor: target.nomor, tenureYears: tenure?.kind === "tahun" ? tenure.years : null };
  });
}

/** The chosen unit as the Denah holds it: its own Jenis Makam, its Blok and the number the family knows it by. */
async function readUnit(
  db: InventoryDeps["db"],
  lokasiId: string,
  petakId: string | null,
  kavlingId: string | null,
): Promise<{ jenisMakamId: string | null; nomor: string; blokId: string } | null> {
  if (petakId) {
    const rows = await db
      .select({ jenisMakamId: inventoryPetak.jenisMakamId, nomor: inventoryPetak.nomorMakam, blokId: inventoryPetak.blokId, kavlingId: inventoryPetak.kavlingId })
      .from(inventoryPetak)
      .where(and(eq(inventoryPetak.id, petakId), eq(inventoryPetak.lokasiId, lokasiId), eq(inventoryPetak.kind, "petak")));
    const petak = rows[0];
    // A member Petak of a Kavling Keluarga is never a unit of its own: one Hak Pakai covers the whole Kavling.
    if (!petak || petak.kavlingId) return null;
    return { jenisMakamId: petak.jenisMakamId, nomor: petak.nomor ?? "", blokId: petak.blokId };
  }
  const rows = await db
    .select({ jenisMakamId: inventoryKavling.jenisMakamId, nomor: inventoryKavling.nomorKavling, blokId: inventoryKavling.blokId })
    .from(inventoryKavling)
    .where(and(eq(inventoryKavling.id, kavlingId!), eq(inventoryKavling.lokasiId, lokasiId)));
  const kavling = rows[0];
  return kavling ? { jenisMakamId: kavling.jenisMakamId, nomor: kavling.nomor, blokId: kavling.blokId } : null;
}

function currentHakPakaiOfTarget(db: InventoryDeps["db"], petakId: string | null, kavlingId: string | null) {
  return petakId ? currentHakPakaiOfPetak(db, petakId) : currentHakPakaiOfKavling(db, kavlingId!);
}
