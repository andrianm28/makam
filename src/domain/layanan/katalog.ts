import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { layananKatalogResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { LayananDeps } from "./deps";
import { buktiValues, layananLayanan, layananVarian, type Bukti } from "./schema";
import { allVarian, nameKeyOf, type VarianLayanan } from "./varian";

/**
 * The Layanan catalog (spec, Layanan > Catalog): one global list kept by Admin
 * Platform, with fixed-price variants, a text field, a minimum lead time, a
 * "bisa hari-H" flag, a "makes sense on an empty plot" flag and the proof a
 * Pekerjaan Layanan must show.
 *
 * A variant carries no price: the price of one variant at one Lokasi Mitra, in
 * DKI or for a Mitra Jasa is a versioned tariff (the Tariffs module), so there
 * is no free pricing.
 */

/** One Layanan of the catalog, with its fixed-price variants. */
export interface LayananKatalog {
  id: string;
  name: string;
  description: string;
  /** The proof level the catalog entry carries; what it requires is derived as `proof`. */
  bukti: Bukti;
  /** The minimum days between ordering and the target date. */
  leadTimeDays: number;
  /** May be added at a Saat Duka checkout, targeted at the burial itself. */
  bisaHariH: boolean;
  /** May be offered on a plot with no burial yet (a Terencana plot). */
  adaDiPetakKosong: boolean;
  /** What free text this Layanan asks the Pemesan for, or null when it asks for none. */
  teksLabel: string | null;
  varian: VarianLayanan[];
}

/** One Layanan as it is read back, with the proof its `bukti` requires derived. */
export interface LayananTerbaca extends LayananKatalog {
  proof: ProofRequirement;
}

/**
 * What a Pekerjaan Layanan must show (spec, Layanan > Catalog): a photo
 * afterwards always, a photo before for Pembersihan Makam and Perawatan Rumput &
 * Taman, a video for the Laporan Foto/Video. Derived from the level the catalog
 * carries, and the photo afterwards is never optional.
 */
export interface ProofRequirement {
  fotoSesudah: true;
  fotoSebelum: boolean;
  video: boolean;
}

export function proofOf(bukti: Bukti): ProofRequirement {
  return {
    fotoSesudah: true,
    fotoSebelum: bukti === "foto_sebelum_dan_sesudah",
    video: bukti === "foto_dan_video",
  };
}

/** Everything a new Layanan carries, as an Admin Platform types it. */
export interface NewLayanan {
  name: string;
  description: string;
  bukti: Bukti;
  leadTimeDays: number;
  bisaHariH: boolean;
  adaDiPetakKosong: boolean;
  teksLabel: string | null;
  /** Its variants' names, in the order Admin Platform listed them. */
  varian: string[];
  reason: string | null;
}

/** What Admin Platform may change of a Layanan (never its variants: those are added or removed one at a time). */
export type PerubahanLayanan = Omit<NewLayanan, "varian">;

export type CreateLayananResult =
  | { ok: true; layanan: LayananKatalog }
  | WriteRefusal
  | { ok: false; reason: "nama_sudah_ada" }
  | { ok: false; reason: "layanan_tidak_valid" };

export type UbahLayananResult =
  | { ok: true; layanan: LayananKatalog }
  | WriteRefusal
  | { ok: false; reason: "tidak_ditemukan" }
  | { ok: false; reason: "nama_sudah_ada" }
  | { ok: false; reason: "layanan_tidak_valid" };

const nameSchema = z.string().trim().min(1).max(120);
const teksSchema = z.string().trim().max(200);

/** One Layanan's own fields, checked: a name, a proof level, a lead time in days and the rest. */
const layananFieldsSchema = z.object({
  name: nameSchema,
  description: z.string().trim().max(500),
  bukti: z.enum(buktiValues),
  leadTimeDays: z.number().int().min(0).max(365),
  bisaHariH: z.boolean(),
  adaDiPetakKosong: z.boolean(),
  teksLabel: teksSchema.nullable(),
});

const createSchema = layananFieldsSchema.extend({ varian: z.array(z.string().trim().min(1).max(120)).min(1).max(50) });

const reasonOf = (reason: string | null): string | null => reason?.trim() || null;

/** Folds every name into one entry and refuses a duplicate within it. */
function folded(names: readonly string[]): string[] | null {
  const keys = new Set<string>();
  for (const name of names) {
    const key = nameKeyOf(name);
    if (keys.has(key)) return null;
    keys.add(key);
  }
  return names.map((name) => name.replace(/\s+/g, " "));
}

/** Admin Platform adds a Layanan to the catalog with its first variants; audited. */
export function createLayanan(deps: LayananDeps, by: Actor, input: NewLayanan): Promise<CreateLayananResult> {
  // Defence in depth behind guarded(): the module checks the actor itself, before anything else.
  const refusal = writeRefusal(by, "layanan.kelola", layananKatalogResource());
  if (refusal) return Promise.resolve(refusal);
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return Promise.resolve({ ok: false, reason: "layanan_tidak_valid" });
  const varian = folded(parsed.data.varian);
  if (!varian) return Promise.resolve({ ok: false, reason: "layanan_tidak_valid" });
  const name = parsed.data.name.replace(/\s+/g, " ");
  const now = deps.clock.now();

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    if (await findByNameKey(tx, nameKeyOf(name))) return { ok: false as const, reason: "nama_sudah_ada" as const };
    const [row] = await tx
      .insert(layananLayanan)
      .values({
        name,
        nameKey: nameKeyOf(name),
        description: parsed.data.description,
        bukti: parsed.data.bukti,
        leadTimeDays: parsed.data.leadTimeDays,
        bisaHariH: parsed.data.bisaHariH,
        adaDiPetakKosong: parsed.data.adaDiPetakKosong,
        teksLabel: parsed.data.teksLabel,
        createdAt: now,
        createdByAccountId: by.accountId,
      })
      .returning();
    const inserted = await tx
      .insert(layananVarian)
      .values(
        varian.map((varianName) => ({
          layananId: row.id,
          name: varianName,
          nameKey: nameKeyOf(varianName),
          createdAt: now,
          createdByAccountId: by.accountId,
        })),
      )
      .returning();
    const layanan: LayananKatalog = { ...toLayanan(row), varian: inserted.map(toVarian) };
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "layanan.buat",
      entity: { kind: "layanan", id: row.id },
      before: null,
      after: snapshotOf(layanan),
      reason: reasonOf(input.reason),
    });
    return { ok: true as const, layanan };
  });
}

/** Admin Platform changes a Layanan's own fields; audited with before and after. */
export function ubahLayanan(deps: LayananDeps, by: Actor, layananId: string, input: PerubahanLayanan): Promise<UbahLayananResult> {
  const refusal = writeRefusal(by, "layanan.kelola", layananKatalogResource());
  if (refusal) return Promise.resolve(refusal);
  const parsed = layananFieldsSchema.safeParse(input);
  if (!parsed.success) return Promise.resolve({ ok: false, reason: "layanan_tidak_valid" });
  const name = parsed.data.name.replace(/\s+/g, " ");
  const now = deps.clock.now();

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const before = await findWithVarian(tx, layananId);
    if (!before) return { ok: false as const, reason: "tidak_ditemukan" as const };
    const nameKey = nameKeyOf(name);
    if (nameKey !== nameKeyOf(before.name) && (await findByNameKey(tx, nameKey))) {
      return { ok: false as const, reason: "nama_sudah_ada" as const };
    }
    const [row] = await tx
      .update(layananLayanan)
      .set({
        name,
        nameKey,
        description: parsed.data.description,
        bukti: parsed.data.bukti,
        leadTimeDays: parsed.data.leadTimeDays,
        bisaHariH: parsed.data.bisaHariH,
        adaDiPetakKosong: parsed.data.adaDiPetakKosong,
        teksLabel: parsed.data.teksLabel,
        updatedAt: now,
      })
      .where(eq(layananLayanan.id, layananId))
      .returning();
    const layanan: LayananKatalog = { ...toLayanan(row), varian: before.varian };
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "layanan.ubah",
      entity: { kind: "layanan", id: layananId },
      before: snapshotOf(before),
      after: snapshotOf(layanan),
      reason: reasonOf(input.reason),
    });
    return { ok: true as const, layanan };
  });
}

/** Every Layanan of the one global catalog, by name, with its variants and the proof each requires. */
export async function katalog(db: Database): Promise<LayananTerbaca[]> {
  const rows = await db.select().from(layananLayanan).orderBy(asc(layananLayanan.nameKey));
  const varian = await allVarian(db);
  return rows.map((row) => ({
    ...toLayanan(row),
    varian: varian.filter((one) => one.layananId === row.id),
    proof: proofOf(row.bukti),
  }));
}

async function findByNameKey(db: Database, nameKey: string): Promise<{ id: string } | null> {
  const [row] = await db.select({ id: layananLayanan.id }).from(layananLayanan).where(eq(layananLayanan.nameKey, nameKey));
  return row ?? null;
}

async function findWithVarian(db: Database, layananId: string): Promise<LayananKatalog | null> {
  const [row] = await db.select().from(layananLayanan).where(eq(layananLayanan.id, layananId));
  if (!row) return null;
  const all = await allVarian(db);
  return { ...toLayanan(row), varian: all.filter((one) => one.layananId === row.id) };
}

function toLayanan(row: typeof layananLayanan.$inferSelect): LayananKatalog {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    bukti: row.bukti,
    leadTimeDays: row.leadTimeDays,
    bisaHariH: row.bisaHariH,
    adaDiPetakKosong: row.adaDiPetakKosong,
    teksLabel: row.teksLabel,
    varian: [],
  };
}

function toVarian(row: typeof layananVarian.$inferSelect): VarianLayanan {
  return { id: row.id, layananId: row.layananId, name: row.name, bolehDiTpu: row.bolehDiTpu };
}

function snapshotOf(layanan: LayananKatalog) {
  return {
    name: layanan.name,
    description: layanan.description,
    bukti: layanan.bukti,
    leadTimeDays: layanan.leadTimeDays,
    bisaHariH: layanan.bisaHariH,
    adaDiPetakKosong: layanan.adaDiPetakKosong,
    teksLabel: layanan.teksLabel,
    varian: layanan.varian.map((one) => one.name),
  };
}
