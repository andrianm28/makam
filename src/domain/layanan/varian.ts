import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { layananKatalogResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { LayananDeps } from "./deps";
import { layananLayanan, layananPaketItem, layananPenawaran, layananVarian } from "./schema";

/**
 * The fixed-price variants of a Layanan and where they are used: a variant is
 * a catalog row the Tariffs module prices, and everything that points at one
 * (a Lokasi Mitra's offer, a Paket Layanan's item) points at it by id, so
 * removing one is refused while anything still offers or names it.
 */

/** One fixed-price variant of a Layanan. */
export interface VarianLayanan {
  id: string;
  layananId: string;
  name: string;
  /** Admin Platform's hand-set mark: only a marked variant is offered at a DKI TPU. */
  bolehDiTpu: boolean;
}

export type NewVarian = { name: string; reason: string | null };

export const newVarianSchema = z.object({ name: z.string().trim().min(1).max(120) });

/** The name folded for the one-variant-per-Layanan rule: lower case, single spaces. */
export function nameKeyOf(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export type TambahVarianResult =
  | { ok: true; varian: VarianLayanan }
  | WriteRefusal
  | { ok: false; reason: "tidak_ditemukan" }
  | { ok: false; reason: "nama_sudah_ada" }
  | { ok: false; reason: "layanan_tidak_valid" };

export type HapusVarianResult =
  | { ok: true }
  | WriteRefusal
  | { ok: false; reason: "tidak_ditemukan" }
  /** A Lokasi Mitra has ever offered it, or a Paket Layanan still contains it. */
  | { ok: false; reason: "varian_terpakai" };

/** A Layanan by id, or null. */
export async function findLayanan(db: Database, layananId: string): Promise<{ id: string; name: string } | null> {
  if (!z.uuid().safeParse(layananId).success) return null;
  const [row] = await db.select({ id: layananLayanan.id, name: layananLayanan.name }).from(layananLayanan).where(eq(layananLayanan.id, layananId));
  return row ?? null;
}

/** One variant by id, or null. */
export async function findVarian(db: Database, layananVariantId: string): Promise<VarianLayanan | null> {
  if (!z.uuid().safeParse(layananVariantId).success) return null;
  const [row] = await db.select().from(layananVarian).where(eq(layananVarian.id, layananVariantId));
  return row ? toVarian(row) : null;
}

/** Every variant, by name within its Layanan. */
export async function allVarian(db: Database): Promise<VarianLayanan[]> {
  const rows = await db.select().from(layananVarian).orderBy(asc(layananVarian.nameKey));
  return rows.map(toVarian);
}

function toVarian(row: typeof layananVarian.$inferSelect): VarianLayanan {
  return { id: row.id, layananId: row.layananId, name: row.name, bolehDiTpu: row.bolehDiTpu };
}

/** Inserts a variant, or null when that Layanan already has one by that name. */
export async function insertVarian(
  db: Database,
  now: Date,
  by: Actor,
  layananId: string,
  name: string,
): Promise<{ ok: true; varian: VarianLayanan } | { ok: false }> {
  const folded = name.replace(/\s+/g, " ");
  const [row] = await db
    .insert(layananVarian)
    .values({ layananId, name: folded, nameKey: nameKeyOf(folded), createdAt: now, createdByAccountId: by.accountId })
    .onConflictDoNothing()
    .returning();
  return row ? { ok: true, varian: toVarian(row) } : { ok: false };
}

/** Admin Platform adds a fixed-price variant to a Layanan; audited. */
export async function tambahVarian(deps: LayananDeps, by: Actor, layananId: string, input: NewVarian): Promise<TambahVarianResult> {
  // Defence in depth behind guarded(): the module checks the actor itself, before anything else.
  const refusal = writeRefusal(by, "layanan.kelola", layananKatalogResource());
  if (refusal) return refusal;
  const parsed = newVarianSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "layanan_tidak_valid" };
  const now = deps.clock.now();

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const layanan = await findLayanan(tx, layananId);
    if (!layanan) return { ok: false as const, reason: "tidak_ditemukan" as const };
    const inserted = await insertVarian(tx, now, by, layananId, parsed.data.name);
    if (!inserted.ok) return { ok: false as const, reason: "nama_sudah_ada" as const };
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "layanan.tambah_varian",
      entity: { kind: "layanan", id: layananId },
      before: null,
      after: { name: inserted.varian.name },
      reason: input.reason?.trim() || null,
    });
    return { ok: true as const, varian: inserted.varian };
  });
}

/**
 * Admin Platform removes a variant from the catalog; refused while a Lokasi Mitra
 * has ever offered it (the offering is kept, so its history stays whole) or a Paket
 * Layanan still contains it, so nothing priced or offered points at a variant that
 * is gone. Audited.
 */
export async function hapusVarian(deps: LayananDeps, by: Actor, layananVariantId: string, input: { reason: string | null }): Promise<HapusVarianResult> {
  const refusal = writeRefusal(by, "layanan.kelola", layananKatalogResource());
  if (refusal) return refusal;
  if (!z.uuid().safeParse(layananVariantId).success) return { ok: false, reason: "tidak_ditemukan" };

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const before = await findVarian(tx, layananVariantId);
    if (!before) return { ok: false as const, reason: "tidak_ditemukan" as const };
    const [dipakai] = await tx
      .select({ id: layananPenawaran.id })
      .from(layananPenawaran)
      .where(eq(layananPenawaran.layananVariantId, layananVariantId))
      .limit(1);
    const [dipakaiPaket] = await tx
      .select({ paketId: layananPaketItem.paketId })
      .from(layananPaketItem)
      .where(eq(layananPaketItem.layananVariantId, layananVariantId))
      .limit(1);
    if (dipakai || dipakaiPaket) return { ok: false as const, reason: "varian_terpakai" as const };
    await tx.delete(layananVarian).where(eq(layananVarian.id, layananVariantId));
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "layanan.hapus_varian",
      entity: { kind: "layanan", id: before.layananId },
      before: { name: before.name },
      after: null,
      reason: input.reason?.trim() || null,
    });
    return { ok: true as const };
  });
}

/** A variant with the name of its Layanan, as a priced line and a page say it. */
export interface VarianDenganLayanan extends VarianLayanan {
  namaLayanan: string;
}

/** Every variant with its Layanan's name (the catalog read, and every quote line's wording). */
export async function varianDenganLayanan(db: Database): Promise<VarianDenganLayanan[]> {
  const rows = await db
    .select({ varian: layananVarian, namaLayanan: layananLayanan.name })
    .from(layananVarian)
    .innerJoin(layananLayanan, eq(layananLayanan.id, layananVarian.layananId))
    .orderBy(asc(layananLayanan.nameKey), asc(layananVarian.nameKey));
  return rows.map((row) => ({ ...toVarian(row.varian), namaLayanan: row.namaLayanan }));
}

/** Every variant a Lokasi Mitra offers, with when it started (never the ones it stopped). */
export async function penawaranOfLokasi(db: Database, lokasiId: string): Promise<{ layananVariantId: string; sejak: Date }[]> {
  if (!z.uuid().safeParse(lokasiId).success) return [];
  const rows = await db
    .select({ layananVariantId: layananPenawaran.layananVariantId, sejak: layananPenawaran.createdAt })
    .from(layananPenawaran)
    .where(and(eq(layananPenawaran.lokasiId, lokasiId), isNull(layananPenawaran.stoppedAt)))
    .orderBy(asc(layananPenawaran.createdAt));
  return rows;
}
