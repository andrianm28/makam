/**
 * The DKI TPU list Admin Platform keeps (spec, Lokasi > TPU; ticket 43): one
 * row per TPU with its name, address, city, pin, data source and the "menerima
 * makam baru" flag with the date that flag was last checked. Every DKI TPU is
 * listed, entered in the dashboard and never seeded.
 *
 * A TPU is a Lokasi Makam the Pemda owns and runs, so it has no Petak Makam,
 * no Hak Pakai and no publish gate: being on this list is what makes it public.
 * The Antrean's Tier 4 "TPU flag stale" row (`@/domain/queues`) reads the
 * dates this module stamps; the public TPU page and the Daftar Lokasi cards
 * read the public functions, which need no actor.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import type { AuditSnapshot } from "@/domain/audit";
import { semuaTpuDkiResource, tpuDkiResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { wibDateOf } from "@/lib/time/jakarta";
import { actingRole, isLokasiId, type LokasiDeps, type WriteResult } from "./lokasi-mitra";
import { tpuDki as tpuDkiTable } from "./schema";

/** The most characters a TPU's name may be typed in. */
export const TPU_NAME_MAX = 120;

/** A map pin, anywhere on earth. A TPU may have none: a street address is enough to find it. */
const pinSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/** What Admin Platform types for a TPU: its name, address, city, optional pin and the data source it came from. */
export const tpuProfileSchema = z.object({
  name: z.string().trim().min(1).max(TPU_NAME_MAX),
  address: z.string().trim().min(1).max(300),
  /** Kota or kabupaten, as typed: the same label the directory's city filter reads for a Lokasi Mitra. */
  city: z.string().trim().min(1).max(120),
  pin: pinSchema.nullable(),
  dataSource: z.string().trim().min(1).max(200),
});

/** The new-plot flag on its own, with the date it was checked, as the flag form submits it. */
export const tpuFlagSchema = z.object({ menerimaMakamBaru: z.boolean() });

export type TpuProfileInput = z.infer<typeof tpuProfileSchema>;

export interface NewTpuDki extends TpuProfileInput {
  /** The flag as Admin Platform found it when the TPU was added; the date it was checked is the add date. */
  menerimaMakamBaru: boolean;
}

/** A TPU, as the Lokasi module hands it out. */
export interface TpuDki {
  id: string;
  name: string;
  address: string;
  /** Kota or kabupaten, as typed: the directory's city filter reads it beside a Lokasi Mitra's. */
  city: string;
  pin: { lat: number; lng: number } | null;
  dataSource: string;
  /** "Menerima makam baru": only a TPU taking new plots is offered a burial. */
  menerimaMakamBaru: boolean;
  /** When the flag was last checked, from the Clock: the Tier 4 row's own clock. */
  flagUpdatedAt: Date;
}

export type CreateTpuDkiResult =
  | { ok: true; tpuDki: TpuDki }
  | WriteRefusal
  | InvalidTpu
  | { ok: false; reason: "nama_sudah_ada" };
export type UpdateTpuDkiResult = WriteResult | InvalidTpu | { ok: false; reason: "nama_sudah_ada" };
export type UpdateTpuDkiFlagResult = UpdateTpuDkiResult;

/** A profile or a flag the module's own check refuses. */
export type InvalidTpu = { ok: false; reason: "tpu_tidak_valid" };

/** What one write on a TPU's row changes, with the Entri Audit's before and after; or the refusal that ends it. */
type TpuChange = { values: Partial<Row>; before: AuditSnapshot; after: AuditSnapshot } | UpdateTpuDkiResult;

/** A name folded for the one-name-per-list rule: lower case, single spaces. */
function nameKeyOf(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

type Row = typeof tpuDkiTable.$inferSelect;

function pinOf(row: Row): { lat: number; lng: number } | null {
  return row.pinLat !== null && row.pinLng !== null ? { lat: row.pinLat, lng: row.pinLng } : null;
}

function toTpuDki(row: Row): TpuDki {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    city: row.city,
    pin: pinOf(row),
    dataSource: row.dataSource,
    menerimaMakamBaru: row.menerimaMakamBaru,
    flagUpdatedAt: row.flagUpdatedAt,
  };
}

const profileSnapshot = (row: Row) => ({
  name: row.name,
  address: row.address,
  city: row.city,
  pin: pinOf(row),
  dataSource: row.dataSource,
});

/** Every DKI TPU, by name, for Admin Platform; nothing for anyone else. */
export async function tpuDkiList(deps: Pick<LokasiDeps, "db">, by: Actor): Promise<TpuDki[]> {
  if (writeRefusal(by, "tpu.lihat_semua", semuaTpuDkiResource())) return [];
  const rows = await deps.db.select().from(tpuDkiTable).orderBy(asc(tpuDkiTable.name), asc(tpuDkiTable.id));
  return rows.map(toTpuDki);
}

/**
 * Admin Platform adds a DKI TPU: its name, address, pin and data source, with
 * the new-plot flag as found, which stamps the date it was checked (the same
 * moment, on the Clock). Audited. Two spellings of one name are one TPU
 * (`nama_sudah_ada`), so a TPU is never listed twice.
 */
export async function createTpuDki(deps: LokasiDeps, by: Actor, input: NewTpuDki): Promise<CreateTpuDkiResult> {
  const refusal = writeRefusal(by, "tpu.buat", semuaTpuDkiResource());
  if (refusal) return refusal;
  const parsed = tpuProfileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "tpu_tidak_valid" };
  if (typeof input.menerimaMakamBaru !== "boolean") return { ok: false, reason: "tpu_tidak_valid" };
  const profile = parsed.data;
  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const inserted = await tx
      .insert(tpuDkiTable)
      .values({
        name: profile.name,
        nameKey: nameKeyOf(profile.name),
        address: profile.address,
        city: profile.city,
        pinLat: profile.pin?.lat ?? null,
        pinLng: profile.pin?.lng ?? null,
        dataSource: profile.dataSource,
        menerimaMakamBaru: input.menerimaMakamBaru,
        flagUpdatedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) return { ok: false, reason: "nama_sudah_ada" } as const;
    const created = toTpuDki(inserted[0]);
    await record({
      actor: { accountId: by.accountId, role: actingRole(by) },
      action: "tpu.buat",
      entity: { kind: "tpu_dki", id: created.id },
      before: null,
      after: { ...profileSnapshot(inserted[0]), menerimaMakamBaru: created.menerimaMakamBaru },
      reason: null,
    });
    return { ok: true, tpuDki: created } as const;
  });
}

/**
 * Admin Platform corrects a TPU's name, address, city, pin or data source,
 * audited with the record before and after. The new-plot flag is never touched
 * here: it has its own form, and its own date.
 */
export async function updateTpuDki(deps: LokasiDeps, by: Actor, tpuId: string, input: TpuProfileInput): Promise<UpdateTpuDkiResult> {
  const refusal = writeRefusal(by, "tpu.ubah", tpuDkiResource(tpuId));
  if (refusal) return refusal;
  const parsed = tpuProfileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "tpu_tidak_valid" };
  const profile = parsed.data;
  return writeTpuDki(deps, by, tpuId, "tpu.ubah", async (tx, row) => {
    // A rename onto another TPU's name would break the one-name-per-list rule, so it is refused here and never reaches the database.
    if (nameKeyOf(profile.name) !== row.nameKey && (await tpuWithNameKey(tx, nameKeyOf(profile.name), tpuId))) {
      return { ok: false, reason: "nama_sudah_ada" } as const;
    }
    return {
      values: {
        name: profile.name,
        nameKey: nameKeyOf(profile.name),
        address: profile.address,
        city: profile.city,
        pinLat: profile.pin?.lat ?? null,
        pinLng: profile.pin?.lng ?? null,
        dataSource: profile.dataSource,
      },
      before: profileSnapshot(row),
      after: { ...profile },
    };
  });
}

/**
 * Admin Platform records what the TPU takes today: the flag is set together
 * with the date it was checked (the Clock), and audited. An update to the same
 * value still stamps the date and is audited: the row is there because someone
 * confirmed it, not because it changed.
 */
export async function updateTpuDkiFlag(
  deps: LokasiDeps,
  by: Actor,
  tpuId: string,
  input: z.infer<typeof tpuFlagSchema>,
): Promise<UpdateTpuDkiFlagResult> {
  const refusal = writeRefusal(by, "tpu.ubah", tpuDkiResource(tpuId));
  if (refusal) return refusal;
  if (!tpuFlagSchema.safeParse(input).success) return { ok: false, reason: "tpu_tidak_valid" };
  return writeTpuDki(deps, by, tpuId, "tpu.ubah_flag", (_tx, row) => ({
    values: { menerimaMakamBaru: input.menerimaMakamBaru, flagUpdatedAt: deps.clock.now() },
    before: { menerimaMakamBaru: row.menerimaMakamBaru, flagUpdatedAt: row.flagUpdatedAt },
    after: { menerimaMakamBaru: input.menerimaMakamBaru, flagUpdatedAt: deps.clock.now() },
  }));
}

/** Another TPU than `tpuId` that already answers to this name, or null: the one-name-per-list rule. */
async function tpuWithNameKey(tx: Database, nameKey: string, tpuId: string): Promise<boolean> {
  const [other] = await tx
    .select({ id: tpuDkiTable.id })
    .from(tpuDkiTable)
    .where(and(eq(tpuDkiTable.nameKey, nameKey), sql`${tpuDkiTable.id} <> ${tpuId}`))
    .limit(1);
  return other !== undefined;
}

/** One staff write on a TPU's row: locked, changed and audited in one transaction, or nothing at all. */
async function writeTpuDki(
  deps: LokasiDeps,
  by: Actor,
  tpuId: string,
  action: "tpu.ubah" | "tpu.ubah_flag",
  change: (tx: Database, row: Row) => Promise<TpuChange> | TpuChange,
): Promise<UpdateTpuDkiResult> {
  if (!isLokasiId(tpuId)) return { ok: false, reason: "tidak_ditemukan" };
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [row] = await tx.select().from(tpuDkiTable).where(eq(tpuDkiTable.id, tpuId)).for("update");
    if (!row) return { ok: false, reason: "tidak_ditemukan" } as const;
    const changed = await change(tx, row);
    if ("ok" in changed) return changed;
    const { values, before, after } = changed;
    await tx.update(tpuDkiTable).set({ ...values, updatedAt: deps.clock.now() }).where(eq(tpuDkiTable.id, tpuId));
    await record({
      actor: { accountId: by.accountId, role: actingRole(by) },
      action,
      entity: { kind: "tpu_dki", id: tpuId },
      before,
      after,
      reason: null,
    });
    return { ok: true } as const;
  });
}

/** One TPU as a visitor reads it: the public TPU page's own read, no actor. */
export interface PublicTpuDki {
  id: string;
  name: string;
  address: string;
  /** Kota or kabupaten, as Admin Platform typed it: the same label the directory's city filter reads for a Lokasi Mitra. */
  city: string;
  pin: { lat: number; lng: number } | null;
  /** Where the record came from, shown as a plain fact; never a "Terverifikasi" claim. */
  dataSource: string;
  /** "Menerima makam baru", worded the way the page shows it. */
  newPlot: boolean;
  /** The WIB date the flag was last checked, as "diperbarui <tanggal>". */
  flagUpdatedOn: string;
}

/** What a visitor can narrow the TPU list by; the city is the directory's own filter value. */
export interface PublicTpuDkiQuery {
  city?: string;
}

function toPublic(row: Row): PublicTpuDki {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    city: row.city,
    pin: pinOf(row),
    dataSource: row.dataSource,
    newPlot: row.menerimaMakamBaru,
    flagUpdatedOn: wibDateOf(row.flagUpdatedAt),
  };
}

/** One TPU; null for an id that is no TPU's. No actor: every TPU on the list is public. */
export async function publicTpuDki(deps: Pick<LokasiDeps, "db">, tpuId: string): Promise<PublicTpuDki | null> {
  if (!isLokasiId(tpuId)) return null;
  const [row] = await deps.db.select().from(tpuDkiTable).where(eq(tpuDkiTable.id, tpuId));
  return row ? toPublic(row) : null;
}

/**
 * Every TPU, by name, for the Daftar Lokasi cards, filtered by the same city
 * the Lokasi Mitra list filters by (`./public-reads.ts`). No actor.
 */
export async function publicTpuDkiList(deps: Pick<LokasiDeps, "db">, query: PublicTpuDkiQuery = {}): Promise<PublicTpuDki[]> {
  const conditions = query.city ? [eq(tpuDkiTable.city, query.city)] : [];
  const rows = await deps.db
    .select()
    .from(tpuDkiTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(tpuDkiTable.name), asc(tpuDkiTable.id));
  return rows.map(toPublic);
}
