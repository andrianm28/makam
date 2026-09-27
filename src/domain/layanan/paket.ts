import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { layananKatalogResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { LayananDeps } from "./deps";
import { frekuensiValues, layananPaket, layananPaketItem, type Frekuensi } from "./schema";
import { varianDenganLayanan, type VarianDenganLayanan } from "./varian";

/**
 * Paket Layanan: a bundle of Layanan defined by Admin Platform with a frequency
 * (sekali / bulanan / 3-bulanan / tahunan) (spec, Paket Layanan; CONTEXT.md).
 *
 * A Paket carries no price of its own: its price is the sum of its items' prices
 * at the place it is offered, taken from `quote()` like any other set of lines,
 * and it is offered only where every item is offered (`hargaPaket`).
 */

/** One Paket Layanan with its items, in the order Admin Platform listed them. */
export interface PaketLayanan {
  id: string;
  name: string;
  description: string;
  frekuensi: Frekuensi;
  /** Its items: the Layanan variants it contains, each with its Layanan's name. */
  item: VarianDenganLayanan[];
}

export interface NewPaket {
  name: string;
  description: string;
  frekuensi: Frekuensi;
  /** The ids of the Layanan variants it contains, in the order Admin Platform listed them. */
  itemIds: string[];
  reason: string | null;
}

export type PerubahanPaket = NewPaket;

export type BuatPaketResult =
  | { ok: true; paket: PaketLayanan }
  | WriteRefusal
  | { ok: false; reason: "nama_sudah_ada" }
  | { ok: false, reason: "paket_tidak_valid" };

export type UbahPaketResult =
  | { ok: true; paket: PaketLayanan }
  | WriteRefusal
  | { ok: false, reason: "tidak_ditemukan" }
  | { ok: false, reason: "nama_sudah_ada" }
  | { ok: false, reason: "paket_tidak_valid" };

export type HapusPaketResult = { ok: true } | WriteRefusal | { ok: false; reason: "tidak_ditemukan" };

const paketFieldsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500),
  frekuensi: z.enum(frekuensiValues),
});

const createSchema = paketFieldsSchema.extend({ itemIds: z.array(z.uuid()).min(1).max(50) });

const reasonOf = (reason: string | null): string | null => reason?.trim() || null;

/** The name folded for the one-name-per-catalog rule: lower case, single spaces. */
function nameKeyOf(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function snapshotOf(paket: PaketLayanan) {
  return { name: paket.name, description: paket.description, frekuensi: paket.frekuensi, item: paket.item.map((one) => one.name) };
}

export function buatPaket(deps: LayananDeps, by: Actor, input: NewPaket): Promise<BuatPaketResult> {
  // Defence in depth behind guarded(): the module checks the actor itself, before anything else.
  const refusal = writeRefusal(by, "layanan.kelola", layananKatalogResource());
  if (refusal) return Promise.resolve(refusal);
  const parsed = paketSchemaOf(input);
  if (!parsed.ok) return Promise.resolve(parsed.refusal);
  const now = deps.clock.now();
  const name = parsed.data.name.replace(/\s+/g, " ");

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    if (await adaDenganNama(tx, nameKeyOf(name))) return { ok: false as const, reason: "nama_sudah_ada" as const };
    const items = await itemDitemukan(tx, parsed.data.itemIds);
    if (!items) return { ok: false as const, reason: "paket_tidak_valid" as const };
    const [row] = await tx
      .insert(layananPaket)
      .values({ name, nameKey: nameKeyOf(name), description: parsed.data.description, frekuensi: parsed.data.frekuensi, createdAt: now, createdByAccountId: by.accountId })
      .returning();
    await tx.insert(layananPaketItem).values(parsed.data.itemIds.map((layananVariantId, posisi) => ({ paketId: row.id, layananVariantId, posisi })));
    const paket = { ...toPaket(row), item: items };
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "paket_layanan.buat",
      entity: { kind: "paket_layanan", id: row.id },
      before: null,
      after: snapshotOf(paket),
      reason: reasonOf(input.reason),
    });
    return { ok: true as const, paket };
  });
}

export function ubahPaket(deps: LayananDeps, by: Actor, paketId: string, input: PerubahanPaket): Promise<UbahPaketResult> {
  const refusal = writeRefusal(by, "layanan.kelola", layananKatalogResource());
  if (refusal) return Promise.resolve(refusal);
  const parsed = paketSchemaOf(input);
  if (!parsed.ok) return Promise.resolve(parsed.refusal);
  const now = deps.clock.now();
  const name = parsed.data.name.replace(/\s+/g, " ");

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const before = await findPaket(tx, paketId);
    if (!before) return { ok: false as const, reason: "tidak_ditemukan" as const };
    const nameKey = nameKeyOf(name);
    if (nameKey !== before.nameKey && (await adaDenganNama(tx, nameKey))) {
      return { ok: false as const, reason: "nama_sudah_ada" as const };
    }
    const items = await itemDitemukan(tx, parsed.data.itemIds);
    if (!items) return { ok: false as const, reason: "paket_tidak_valid" as const };
    const [row] = await tx
      .update(layananPaket)
      .set({ name, nameKey, description: parsed.data.description, frekuensi: parsed.data.frekuensi, updatedAt: now })
      .where(eq(layananPaket.id, paketId))
      .returning();
    await tx.delete(layananPaketItem).where(eq(layananPaketItem.paketId, paketId));
    await tx.insert(layananPaketItem).values(parsed.data.itemIds.map((layananVariantId, posisi) => ({ paketId, layananVariantId, posisi })));
    const paket = { ...toPaket(row), item: items };
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "paket_layanan.ubah",
      entity: { kind: "paket_layanan", id: paketId },
      before: snapshotOf(before),
      after: snapshotOf(paket),
      reason: reasonOf(input.reason),
    });
    return { ok: true as const, paket };
  });
}

/**
 * Admin Platform removes a Paket Layanan definition. The catalog is what a
 * subscription is made of, so ticket 54 (the cycles) refuses this once families
 * hold one; until then a Paket nobody subscribes to is removed whole, with its
 * items. Audited.
 */
export async function hapusPaket(deps: LayananDeps, by: Actor, paketId: string, input: { reason: string | null }): Promise<HapusPaketResult> {
  const refusal = writeRefusal(by, "layanan.kelola", layananKatalogResource());
  if (refusal) return refusal;

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const before = await findPaket(tx, paketId);
    if (!before) return { ok: false as const, reason: "tidak_ditemukan" as const };
    await tx.delete(layananPaketItem).where(eq(layananPaketItem.paketId, paketId));
    await tx.delete(layananPaket).where(eq(layananPaket.id, paketId));
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "paket_layanan.hapus",
      entity: { kind: "paket_layanan", id: paketId },
      before: snapshotOf(before),
      after: null,
      reason: reasonOf(input.reason),
    });
    return { ok: true as const };
  });
}

/** Every Paket Layanan, by name, with its items. */
export async function semuaPaket(db: LayananDeps["db"]): Promise<PaketLayanan[]> {
  const rows = await db.select().from(layananPaket).orderBy(asc(layananPaket.nameKey));
  const items = await db
    .select({ paketId: layananPaketItem.paketId, layananVariantId: layananPaketItem.layananVariantId })
    .from(layananPaketItem)
    .orderBy(asc(layananPaketItem.paketId), asc(layananPaketItem.posisi));
  const varian = new Map((await varianDenganLayanan(db)).map((one) => [one.id, one]));
  return rows.map((row) => ({
    ...toPaket(row),
    item: items
      .filter((one) => one.paketId === row.id)
      .map((one) => varian.get(one.layananVariantId))
      .filter((one): one is VarianDenganLayanan => one !== undefined),
  }));
}

/** One Paket Layanan, or null. */
export async function findPaketById(db: LayananDeps["db"], paketId: string): Promise<PaketLayanan | null> {
  const paket = (await semuaPaket(db)).find((one) => one.id === paketId);
  return paket ?? null;
}

async function findPaket(db: LayananDeps["db"], paketId: string): Promise<(PaketLayanan & { nameKey: string }) | null> {
  if (!z.uuid().safeParse(paketId).success) return null;
  const [row] = await db.select().from(layananPaket).where(eq(layananPaket.id, paketId));
  if (!row) return null;
  const items = await db
    .select({ layananVariantId: layananPaketItem.layananVariantId })
    .from(layananPaketItem)
    .where(eq(layananPaketItem.paketId, paketId))
    .orderBy(asc(layananPaketItem.posisi));
  const varian = new Map((await varianDenganLayanan(db)).map((one) => [one.id, one]));
  return {
    ...toPaket(row),
    nameKey: row.nameKey,
    item: items.map((one) => varian.get(one.layananVariantId)).filter((one): one is VarianDenganLayanan => one !== undefined),
  };
}

function paketSchemaOf(input: NewPaket): { ok: true; data: z.infer<typeof createSchema> } | { ok: false; refusal: { ok: false; reason: "paket_tidak_valid" } } {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, refusal: { ok: false, reason: "paket_tidak_valid" } };
  if (new Set(parsed.data.itemIds).size !== parsed.data.itemIds.length) {
    return { ok: false, refusal: { ok: false, reason: "paket_tidak_valid" } };
  }
  return { ok: true, data: parsed.data };
}

async function adaDenganNama(db: LayananDeps["db"], nameKey: string): Promise<boolean> {
  const [row] = await db.select({ id: layananPaket.id }).from(layananPaket).where(eq(layananPaket.nameKey, nameKey)).limit(1);
  return row !== undefined;
}

/** Every named item, or null when one id is no variant at all. */
async function itemDitemukan(db: LayananDeps["db"], itemIds: readonly string[]): Promise<VarianDenganLayanan[] | null> {
  if (itemIds.length === 0) return null;
  const varian = new Map((await varianDenganLayanan(db)).map((one) => [one.id, one]));
  const items = itemIds.map((id) => varian.get(id));
  if (items.some((one) => one === undefined)) return null;
  return items as VarianDenganLayanan[];
}

function toPaket(row: typeof layananPaket.$inferSelect) {
  return { id: row.id, name: row.name, description: row.description, frekuensi: row.frekuensi };
}
