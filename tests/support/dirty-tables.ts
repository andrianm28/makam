/**
 * Which app tables a test has written to since the last reset, kept inside the
 * test database itself so that every connection (a second pool, a transaction a
 * domain module opens, a CLI a test spawns) is seen. A statement-level insert
 * trigger on each `public` table records the table's name in
 * `makam_test_support.dirty`; a reset empties exactly those tables and clears
 * the list. Tests only ever insert to put rows in a table, so insert is the only
 * statement watched; a rolled-back insert rolls its record back with it.
 *
 * The record has no unique key on purpose: a key would make two concurrent
 * transactions that insert into one table wait for each other, and the
 * concurrency tests hold exactly that kind of overlap open.
 */
export type Query = (text: string) => Promise<{ rows: { tablename: string }[] }>;

const SCHEMA = "makam_test_support";
const TRIGGER = "makam_test_mark";

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** Puts a trigger on every `public` table that has none yet and counts such a table as dirty: it may hold rows from before. */
async function watchNewTables(query: Query): Promise<void> {
  const { rows } = await query(
    `select c.relname as tablename
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
        and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = '${TRIGGER}')`,
  );
  if (rows.length === 0) return;
  const unwatched = rows.map((row) => row.tablename);
  await query(
    `begin;
     create schema if not exists ${SCHEMA};
     create table if not exists ${SCHEMA}.dirty (tablename text not null);
     create or replace function ${SCHEMA}.mark() returns trigger language plpgsql as $$
       begin
         insert into ${SCHEMA}.dirty (tablename) select tg_table_name
          where not exists (select 1 from ${SCHEMA}.dirty where tablename = tg_table_name);
         return null;
       end $$;
     ${unwatched
       .map(
         (name) =>
           `create trigger ${TRIGGER} after insert on public.${quote(name)} for each statement execute function ${SCHEMA}.mark();
            insert into ${SCHEMA}.dirty (tablename) values ('${name.replace(/'/g, "''")}');`,
       )
       .join("\n")}
     commit;`,
  );
}

/**
 * Empties every table written to since the last reset (all of them the first
 * time), restarting identities; a table dropped since is skipped.
 */
export async function truncateDirtyTables(query: Query): Promise<void> {
  await watchNewTables(query);
  const { rows } = await query(
    `select distinct d.tablename from ${SCHEMA}.dirty d
      where exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relname = d.tablename and c.relkind in ('r', 'p'))`,
  );
  if (rows.length === 0) return;
  const tables = rows.map((row) => `public.${quote(row.tablename)}`).join(", ");
  await query(`begin; truncate ${tables} restart identity cascade; truncate ${SCHEMA}.dirty; commit;`);
}

/** Forgets the record, so the next reset empties every table once; a run starts from here on a database an earlier run used. */
export async function forgetDirtyTables(query: Query): Promise<void> {
  await query(`drop schema if exists ${SCHEMA} cascade`);
}
