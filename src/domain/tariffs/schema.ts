import { bigint, bigserial, check, date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
/** Whole rupiah. Never a float: every amount is an integer number of rupiah. */
const rupiah = (name: string) => bigint(name, { mode: "number" });

/**
 * The global tariffs, each its own price book (spec, Tariffs): the Biaya
 * Layanan Platform (one flat rate), the DKI Biaya Pengurusan for a Pengurusan
 * that arranges a burial and for filing only, and the Retribusi Pemda for an IPTM.
 */
export const globalTariffKeys = [
  "biaya_layanan_platform",
  "biaya_pengurusan_pemakaman",
  "biaya_pengurusan_berkas",
  "retribusi_pemda_iptm",
] as const;

/**
 * The version columns every price book shares. A version is in force from
 * `in_force_from` (00:00 WIB on `effective_on`, or the moment it was entered
 * when that date was the day it was entered) until a later one takes over.
 * Versions are only ever inserted, never updated or deleted (the migration
 * adds triggers refusing both), so any past price can be read back. Every time
 * comes from the Clock; there are no database defaults for time.
 */
const versionColumns = () => ({
  id: uuid("id").primaryKey().defaultRandom(),
  /** Entry order: of two versions in force from the same instant, the later entry wins. */
  seq: bigserial("seq", { mode: "number" }).notNull(),
  effectiveOn: date("effective_on", { mode: "string" }).notNull(),
  inForceFrom: at("in_force_from").notNull(),
  enteredAt: at("entered_at").notNull(),
  /** The Admin Platform's Akun. Not a foreign key, like the Audit Log. */
  enteredByAccountId: text("entered_by_account_id").notNull(),
});

/** Owned by the Tariffs module: every version of every global tariff. */
export const tariffGlobalVersion = pgTable(
  "tariff_global_version",
  {
    ...versionColumns(),
    key: text("key", { enum: globalTariffKeys }).notNull(),
    amount: rupiah("amount").notNull(),
  },
  (table) => [
    index("tariff_global_version_key_idx").on(table.key, table.inForceFrom, table.seq),
    check("tariff_global_version_amount_check", sql`${table.amount} >= 0`),
  ],
);
