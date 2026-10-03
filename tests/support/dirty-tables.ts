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
 * time), restarting identities, in one statement so a record cannot be cleared
 * unread. A table dropped since is skipped. A sequence a rolled-back insert
 * advanced leaves no record, so every sequence in use is restarted as well.
 */
export async function truncateDirtyTables(query: Query): Promise<void> {
  await watchNewTables(query);
  await query(
    `do $reset$
     declare tables text; used record;
     begin
       select string_agg(format('public.%I', tablename), ', ') into tables
         from (select distinct d.tablename from ${SCHEMA}.dirty d
                where exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                               where n.nspname = 'public' and c.relname = d.tablename and c.relkind in ('r', 'p'))) dirty;
       delete from ${SCHEMA}.dirty;
       if tables is not null then
         execute 'truncate ' || tables || ' restart identity cascade';
       end if;
       for used in select format('%I.%I', schemaname, sequencename) as name from pg_sequences
                    where schemaname = 'public' and last_value is not null loop
         execute 'alter sequence ' || used.name || ' restart';
       end loop;
     end $reset$`,
  );
}

/** Forgets the record, so the next reset empties every table once; a run starts from here on a database an earlier run used. */
export async function forgetDirtyTables(query: Query): Promise<void> {
  await query(`drop schema if exists ${SCHEMA} cascade`);
}
