/**
 * CI's migration upgrade test (ticket 71): fills a database that the running
 * release has migrated with representative rows, so the new migrations run
 * against tables that are not empty (a NOT NULL column without a default, a
 * new unique index, a type change or a new foreign key then fail here, not on
 * staging).
 *
 *   DATABASE_URL=postgres://... npx tsx scripts/migrations/seed-representative.ts
 *
 * It reads the schema from the catalog, so it needs no update when a migration
 * adds a table: every table in `public` gets a few rows, parents before
 * children, with values chosen by column type (foreign keys point at rows it
 * inserted). A table it cannot fill (e.g. a CHECK it cannot guess) is reported
 * and skipped; the run fails only when it fills no table at all.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";

const ROWS_PER_TABLE = 3;

interface Column {
  name: string;
  dataType: string;
  udtName: string;
  nullable: boolean;
  hasDefault: boolean;
  isGenerated: boolean;
  maxLength: number | null;
}

interface ForeignKey {
  columns: string[];
  refTable: string;
  refColumns: string[];
}

interface Table {
  name: string;
  columns: Column[];
  foreignKeys: ForeignKey[];
}

const quote = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;

async function readTables(client: pg.Client): Promise<Table[]> {
  const tables = await client.query<{ table_name: string }>(
    `select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`,
  );
  const columns = await client.query<{
    table_name: string;
    column_name: string;
    data_type: string;
    udt_name: string;
    is_nullable: string;
    column_default: string | null;
    is_identity: string;
    is_generated: string;
    character_maximum_length: number | null;
  }>(
    `select table_name, column_name, data_type, udt_name, is_nullable, column_default, is_identity, is_generated, character_maximum_length
       from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position`,
  );
  const foreignKeys = await client.query<{ table_name: string; columns: string[]; ref_table: string; ref_columns: string[] }>(
    `select c.conrelid::regclass::text as table_name,
            array(select attname from unnest(c.conkey) with ordinality k(n, i) join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n order by k.i)::text[] as columns,
            c.confrelid::regclass::text as ref_table,
            array(select attname from unnest(c.confkey) with ordinality k(n, i) join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.n order by k.i)::text[] as ref_columns
       from pg_constraint c join pg_namespace ns on ns.oid = c.connamespace
      where c.contype = 'f' and ns.nspname = 'public'`,
  );
  const unquote = (name: string) => name.replace(/^"(.*)"$/, "$1");
  return tables.rows.map(({ table_name }) => ({
    name: table_name,
    columns: columns.rows
      .filter((column) => column.table_name === table_name)
      .map((column) => ({
        name: column.column_name,
        dataType: column.data_type,
        udtName: column.udt_name,
        nullable: column.is_nullable === "YES",
        hasDefault: column.column_default !== null || column.is_identity === "YES",
        isGenerated: column.is_generated === "ALWAYS",
        maxLength: column.character_maximum_length,
      })),
    foreignKeys: foreignKeys.rows
      .filter((fk) => unquote(fk.table_name) === table_name)
      .map((fk) => ({ columns: fk.columns, refTable: unquote(fk.ref_table), refColumns: fk.ref_columns })),
  }));
}

async function enumLabels(client: pg.Client): Promise<Map<string, string[]>> {
  const result = await client.query<{ typname: string; labels: string[] }>(
    `select t.typname, array_agg(e.enumlabel::text order by e.enumsortorder) as labels
       from pg_type t join pg_enum e on e.enumtypid = t.oid group by t.typname`,
  );
  return new Map(result.rows.map((row) => [row.typname, row.labels]));
}

/** A plausible value for a column, by name first (phones, emails) and then by type. */
function valueFor(table: string, column: Column, n: number, enums: Map<string, string[]>): unknown {
  const name = column.name.toLowerCase();
  const text = (value: string) => (column.maxLength ? value.slice(0, column.maxLength) : value);
  if (column.dataType === "ARRAY") return "{}";
  const labels = enums.get(column.udtName);
  if (labels) return labels[n % labels.length];
  switch (column.udtName) {
    case "uuid":
      return randomUUID();
    case "int2":
    case "int4":
    case "int8":
    case "numeric":
    case "float4":
    case "float8":
      return n + 1;
    case "bool":
      return n % 2 === 0;
    case "timestamp":
    case "timestamptz":
      return new Date(Date.UTC(2026, 8, 1 + n, 3, 0, 0));
    case "date":
      return `2026-09-0${1 + n}`;
    case "time":
    case "timetz":
      return "08:00";
    case "interval":
      return "1 hour";
    case "json":
    case "jsonb":
      return "{}";
    case "bytea":
      return Buffer.from(`upgrade-${n}`);
    case "inet":
      return "127.0.0.1";
  }
  if (/phone|telepon|nomor_wa|whatsapp|target/.test(name)) return text(`+6281100009${String(n).padStart(3, "0")}`);
  if (/email/.test(name)) return text(`upgrade-${table}-${n}@makam.co.id`);
  return text(`upgrade-${table}-${column.name}-${n}`);
}

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, application_name: "makam-upgrade-seed" });
  await client.connect();
  try {
    const tables = await readTables(client);
    const enums = await enumLabels(client);
    const filled = new Set<string>();
    const failures = new Map<string, string>();
    let progress = true;
    // Parents first: a table is tried once every table its required foreign keys point at has rows.
    while (progress) {
      progress = false;
      for (const table of tables) {
        if (filled.has(table.name)) continue;
        const required = table.foreignKeys.filter(
          (fk) => fk.refTable !== table.name && fk.columns.some((c) => !table.columns.find((col) => col.name === c)?.nullable),
        );
        if (!required.every((fk) => filled.has(fk.refTable))) continue;
        const error = await fill(client, table, filled, enums);
        if (error) failures.set(table.name, error);
        else {
          filled.add(table.name);
          failures.delete(table.name);
          progress = true;
        }
      }
    }
    for (const table of tables) {
      if (!filled.has(table.name) && !failures.has(table.name)) failures.set(table.name, "a table it depends on was not filled");
    }
    console.log(`[upgrade-seed] filled ${filled.size} of ${tables.length} tables with ${ROWS_PER_TABLE} rows each`);
    for (const [table, error] of failures) console.log(`[upgrade-seed] skipped ${table}: ${error}`);
    if (filled.size === 0) throw new Error("no table could be filled");
  } finally {
    await client.end();
  }
}

/** Inserts the rows for one table in a savepoint; returns the error when it cannot. */
async function fill(client: pg.Client, table: Table, filled: Set<string>, enums: Map<string, string[]>): Promise<string | undefined> {
  await client.query("begin");
  try {
    for (let n = 0; n < ROWS_PER_TABLE; n += 1) {
      const values = new Map<string, unknown>();
      for (const fk of table.foreignKeys) {
        if (fk.refTable === table.name || !filled.has(fk.refTable)) continue;
        const parent = await client.query(
          `select ${fk.refColumns.map(quote).join(", ")} from ${quote(fk.refTable)} order by ctid offset $1 limit 1`,
          [n],
        );
        const row = parent.rows[0] ?? (await client.query(`select ${fk.refColumns.map(quote).join(", ")} from ${quote(fk.refTable)} limit 1`)).rows[0];
        fk.columns.forEach((column, i) => values.set(column, row?.[fk.refColumns[i]] ?? null));
      }
      for (const column of table.columns) {
        if (values.has(column.name) || column.isGenerated || column.hasDefault) continue;
        if (table.foreignKeys.some((fk) => fk.columns.includes(column.name))) continue; // self or unfilled: null
        values.set(column.name, valueFor(table.name, column, n, enums));
      }
      const names = [...values.keys()];
      const sql =
        names.length === 0
          ? `insert into ${quote(table.name)} default values`
          : `insert into ${quote(table.name)} (${names.map(quote).join(", ")}) values (${names.map((_, i) => `$${i + 1}`).join(", ")})`;
      await client.query(sql, [...values.values()]);
    }
    await client.query("commit");
    return undefined;
  } catch (error) {
    await client.query("rollback");
    return error instanceof Error ? error.message : String(error);
  }
}

main().catch((error: unknown) => {
  console.error("[upgrade-seed] failed", error);
  process.exit(1);
});
