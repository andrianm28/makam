import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { TariffDeps } from "./deps";
import {
  effectiveDateRefusal,
  effectiveOnSchema,
  rupiahSchema,
  type EffectiveDateRefusal,
  type Rupiah,
  type InvalidTariff,
} from "./money";
import { tariffJenisMakam, tariffJenisMakamVersion } from "./schema";
import { inForceAt, inForceFromFor, type VersionTimes } from "./versions";

/** How long a Hak Pakai of this Jenis Makam lasts: Selamanya, or N whole years (one Perpanjangan term). */
export type Tenure = { kind: "selamanya" } | { kind: "tahun"; years: number };

/** A Jenis Makam's tariff as entered: all whole rupiah. */
export interface JenisMakamTariff {
  hargaHakPakai: number;
  tenure: Tenure;
  /** The Perpanjangan price per term of `tenure.years`; null exactly when the tenure is Selamanya. */
  hargaPerpanjangan: number | null;
}

export interface JenisMakamTariffVersion extends VersionTimes {
  hargaHakPakai: Rupiah;
  tenure: Tenure;
  hargaPerpanjangan: Rupiah | null;
  jenisMakamId: string;
  enteredAt: Date;
}

/** A Jenis Makam of a Lokasi Mitra: a class of Petak Makam with its own price. */
export interface JenisMakam {
  id: string;
  lokasiId: string;
  name: string;
  description: string;
}

export type JenisMakamTariffInput = JenisMakamTariff & { effectiveOn: string };

export interface NewJenisMakam {
  name: string;
  description: string;
  /** Its first tariff version. */
  tariff: JenisMakamTariffInput;
  reason: string | null;
}

type NotFound = { ok: false; reason: "tidak_ditemukan" };

export type CreateJenisMakamResult =
  | { ok: true; jenisMakam: JenisMakam; version: JenisMakamTariffVersion }
  | WriteRefusal
  | NotFound
  | InvalidTariff
  | EffectiveDateRefusal
  | { ok: false; reason: "nama_sudah_ada" };

export type SetJenisMakamTariffResult =
  | { ok: true; version: JenisMakamTariffVersion }
  | WriteRefusal
  | NotFound
  | InvalidTariff
  | EffectiveDateRefusal;

const tenureSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("selamanya") }),
  z.object({ kind: z.literal("tahun"), years: z.number().int().min(1).max(100) }),
]);

const jenisMakamTariffSchema = z
  .object({
    hargaHakPakai: rupiahSchema,
    tenure: tenureSchema,
    hargaPerpanjangan: rupiahSchema.nullable(),
    effectiveOn: effectiveOnSchema,
  })
  .refine((tariff) => (tariff.tenure.kind === "selamanya") === (tariff.hargaPerpanjangan === null));

const newJenisMakamSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500),
  tariff: jenisMakamTariffSchema,
});

/** Folds a name for the one-name-per-Lokasi rule. */
function nameKeyOf(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export async function createJenisMakam(
  deps: TariffDeps,
  by: Actor,
  lokasiId: string,
  input: NewJenisMakam,
): Promise<CreateJenisMakamResult> {
  const refusal = writeRefusal(by, "tarif.ubah", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  const parsed = newJenisMakamSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "tarif_tidak_valid" };
  const now = deps.clock.now();
  const lampau = effectiveDateRefusal(parsed.data.tariff.effectiveOn, now);
  if (lampau) return lampau;
  const lokasi = await deps.lokasi.lokasiMitra(by, lokasiId);
  if (!lokasi.ok) return lokasi;
  const name = parsed.data.name.replace(/\s+/g, " ");
  const nameKey = nameKeyOf(name);

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    await lockLokasiTariffs(tx, lokasiId);
    const [taken] = await tx
      .select({ id: tariffJenisMakam.id })
      .from(tariffJenisMakam)
      .where(and(eq(tariffJenisMakam.lokasiId, lokasiId), eq(tariffJenisMakam.nameKey, nameKey)));
    if (taken) return { ok: false as const, reason: "nama_sudah_ada" as const };
    const [row] = await tx
      .insert(tariffJenisMakam)
      .values({ lokasiId, name, nameKey, description: parsed.data.description, createdAt: now, createdByAccountId: by.accountId })
      .returning();
    const jenisMakam = toJenisMakam(row);
    const version = await insertVersion(tx, jenisMakam, parsed.data.tariff, by, now);
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "tarif.buat_jenis_makam",
      entity: { kind: "jenis_makam", id: jenisMakam.id },
      lokasiId,
      before: null,
      after: { name: jenisMakam.name, description: jenisMakam.description, ...versionSnapshot(version) },
      reason: input.reason?.trim() || null,
    });
    return { ok: true as const, jenisMakam, version };
  });
}

export async function setJenisMakamTariff(
  deps: TariffDeps,
  by: Actor,
  jenisMakamId: string,
  input: JenisMakamTariffInput & { reason: string | null },
): Promise<SetJenisMakamTariffResult> {
  const jenisMakam = await findJenisMakam(deps.db, jenisMakamId);
  // Who may write is checked before whether the Jenis Makam exists, so a refusal says nothing about it.
  const refusal = writeRefusal(by, "tarif.ubah", lokasiMitraResource(jenisMakam?.lokasiId ?? ""));
  if (refusal) return refusal;
  if (!jenisMakam) return { ok: false, reason: "tidak_ditemukan" };
  const parsed = jenisMakamTariffSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "tarif_tidak_valid" };
  const now = deps.clock.now();
  const lampau = effectiveDateRefusal(parsed.data.effectiveOn, now);
  if (lampau) return lampau;

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    await lockLokasiTariffs(tx, jenisMakam.lokasiId);
    const inForceFrom = inForceFromFor(parsed.data.effectiveOn, now);
    const replaced = inForceAt(await jenisMakamVersions(tx, jenisMakam.id), inForceFrom);
    const version = await insertVersion(tx, jenisMakam, parsed.data, by, now);
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "tarif.ubah_jenis_makam",
      entity: { kind: "jenis_makam", id: jenisMakam.id },
      lokasiId: jenisMakam.lokasiId,
      before: replaced && { name: jenisMakam.name, ...versionSnapshot(replaced) },
      after: { name: jenisMakam.name, ...versionSnapshot(version) },
      reason: input.reason?.trim() || null,
    });
    return { ok: true as const, version };
  });
}

/** Every Jenis Makam of a Lokasi Mitra, by name. */
export async function jenisMakamOfLokasi(db: Database, lokasiId: string): Promise<JenisMakam[]> {
  if (!isUuid(lokasiId)) return [];
  const rows = await db
    .select()
    .from(tariffJenisMakam)
    .where(eq(tariffJenisMakam.lokasiId, lokasiId))
    .orderBy(asc(tariffJenisMakam.nameKey));
  return rows.map(toJenisMakam);
}

export async function findJenisMakam(db: Database, jenisMakamId: string): Promise<JenisMakam | null> {
  if (!isUuid(jenisMakamId)) return null;
  const [row] = await db.select().from(tariffJenisMakam).where(eq(tariffJenisMakam.id, jenisMakamId));
  return row ? toJenisMakam(row) : null;
}

/** Every tariff version of one Jenis Makam, in entry order. */
export async function jenisMakamVersions(db: Database, jenisMakamId: string): Promise<JenisMakamTariffVersion[]> {
  if (!isUuid(jenisMakamId)) return [];
  const rows = await db
    .select()
    .from(tariffJenisMakamVersion)
    .where(eq(tariffJenisMakamVersion.jenisMakamId, jenisMakamId))
    .orderBy(asc(tariffJenisMakamVersion.seq));
  return rows.map(toVersion);
}

/** One tariff entry for a Lokasi Mitra at a time, so each Entri Audit's "before" is exact. */
export async function lockLokasiTariffs(tx: Database, lokasiId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`tariffs.lokasi.${lokasiId}`}))`);
}

const uuidSchema = z.uuid();
function isUuid(id: string): boolean {
  return uuidSchema.safeParse(id).success;
}

async function insertVersion(
  tx: Database,
  jenisMakam: JenisMakam,
  tariff: z.infer<typeof jenisMakamTariffSchema>,
  by: Actor,
  now: Date,
): Promise<JenisMakamTariffVersion> {
  const [row] = await tx
    .insert(tariffJenisMakamVersion)
    .values({
      jenisMakamId: jenisMakam.id,
      lokasiId: jenisMakam.lokasiId,
      hargaHakPakai: tariff.hargaHakPakai,
      tenureYears: tariff.tenure.kind === "tahun" ? tariff.tenure.years : null,
      hargaPerpanjangan: tariff.hargaPerpanjangan,
      effectiveOn: tariff.effectiveOn,
      inForceFrom: inForceFromFor(tariff.effectiveOn, now),
      enteredAt: now,
      enteredByAccountId: by.accountId,
    })
    .returning();
  return toVersion(row);
}

function versionSnapshot(version: JenisMakamTariffVersion) {
  return {
    hargaHakPakai: version.hargaHakPakai,
    tenure: version.tenure,
    hargaPerpanjangan: version.hargaPerpanjangan,
    effectiveOn: version.effectiveOn,
  };
}

function toJenisMakam(row: typeof tariffJenisMakam.$inferSelect): JenisMakam {
  return { id: row.id, lokasiId: row.lokasiId, name: row.name, description: row.description };
}

function toVersion(row: typeof tariffJenisMakamVersion.$inferSelect): JenisMakamTariffVersion {
  return {
    jenisMakamId: row.jenisMakamId,
    hargaHakPakai: row.hargaHakPakai,
    tenure: row.tenureYears === null ? { kind: "selamanya" } : { kind: "tahun", years: row.tenureYears },
    hargaPerpanjangan: row.hargaPerpanjangan,
    effectiveOn: row.effectiveOn,
    inForceFrom: row.inForceFrom,
    seq: row.seq,
    enteredAt: row.enteredAt,
  };
}
