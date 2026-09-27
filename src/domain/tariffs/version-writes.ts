import { asc, type SQL } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { NewAuditEntry, RecordEntry } from "@/domain/audit";
import type { TariffDeps } from "./deps";
import type {
  tariffBiayaPemakamanVersion,
  tariffGlobalVersion,
  tariffJenisMakamVersion,
  tariffLayananDkiVersion,
  tariffLayananVersion,
  tariffMitraJasaVersion,
} from "./schema";
import { inForceAt, inForceFromFor, type VersionTimes } from "./versions";

/** Every price-book table; each row carries the shared version columns. */
type VersionTable =
  | typeof tariffGlobalVersion
  | typeof tariffJenisMakamVersion
  | typeof tariffBiayaPemakamanVersion
  | typeof tariffLayananVersion
  | typeof tariffLayananDkiVersion
  | typeof tariffMitraJasaVersion;

/** A stored version's shared columns, as every version type carries them. */
export interface StoredVersionTimes extends VersionTimes {
  /** When Admin Platform entered it (Clock). */
  enteredAt: Date;
}

/** The shared columns of a version row, for each price book's `toVersion`. */
export function versionTimesOf(row: StoredVersionTimes): StoredVersionTimes {
  return { effectiveOn: row.effectiveOn, inForceFrom: row.inForceFrom, seq: row.seq, enteredAt: row.enteredAt };
}

/** Every version of one price book (`where` picks it), in entry order: none is ever changed or deleted. */
export async function selectVersions<T extends VersionTable, V>(
  db: Database,
  table: T,
  where: SQL | undefined,
  toVersion: (row: T["$inferSelect"]) => V,
): Promise<V[]> {
  const rows = await db
    .select()
    .from(table as VersionTable)
    .where(where)
    .orderBy(asc(table.seq));
  return (rows as T["$inferSelect"][]).map(toVersion);
}

/** How one price book takes a new version. */
export interface NewVersion<V extends VersionTimes> {
  /** The effective date typed (already checked: today or later, WIB). */
  effectiveOn: string;
  /** Every version of this price book so far, read under its lock. */
  versions: (tx: Database) => Promise<V[]>;
  /** Inserts the new version, in force from `inForceFrom`. */
  insert: (tx: Database, inForceFrom: Date) => Promise<V>;
  /** Its Entri Audit, with the version it replaces from its date (`before`; null for the first). */
  entry: (replaced: V | null, version: V) => NewAuditEntry;
}

/**
 * Inside a staff write whose price book is already locked: reads the version
 * in force from the new one's date, inserts the new one, records the Entri
 * Audit with before and after.
 */
export async function recordNewVersion<V extends VersionTimes>(
  tx: Database,
  record: RecordEntry,
  now: Date,
  spec: NewVersion<V>,
): Promise<V> {
  const inForceFrom = inForceFromFor(spec.effectiveOn, now);
  const replaced = inForceAt(await spec.versions(tx), inForceFrom);
  const version = await spec.insert(tx, inForceFrom);
  await record(spec.entry(replaced, version));
  return version;
}

/** One whole new-version write: a staff write (audited), the price book's lock, then `recordNewVersion`. */
export function writeVersion<V extends VersionTimes>(
  deps: TariffDeps,
  now: Date,
  lock: (tx: Database) => Promise<void>,
  spec: NewVersion<V>,
): Promise<{ ok: true; version: V }> {
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    await lock(tx);
    return { ok: true as const, version: await recordNewVersion(tx, record, now, spec) };
  });
}
