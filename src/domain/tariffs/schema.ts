import {
  bigint,
  bigserial,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
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

/**
 * Owned by the Tariffs module: every version of a Lokasi Mitra's Biaya
 * Pemakaman, charged on every Pemakaman there; `biaya_pemakaman_tumpang` is
 * the amount for a tumpang, null when it is the same.
 */
export const tariffBiayaPemakamanVersion = pgTable(
  "tariff_biaya_pemakaman_version",
  {
    ...versionColumns(),
    lokasiId: uuid("lokasi_id").notNull(),
    biayaPemakaman: rupiah("biaya_pemakaman").notNull(),
    biayaPemakamanTumpang: rupiah("biaya_pemakaman_tumpang"),
  },
  (table) => [
    index("tariff_biaya_pemakaman_version_idx").on(table.lokasiId, table.inForceFrom, table.seq),
    check(
      "tariff_biaya_pemakaman_version_amounts_check",
      sql`${table.biayaPemakaman} >= 0 and (${table.biayaPemakamanTumpang} is null or ${table.biayaPemakamanTumpang} >= 0)`,
    ),
  ],
);

/**
 * Owned by the Tariffs module: a Lokasi Mitra's Jenis Makam, defined by Admin
 * Platform. Its prices and tenure live in its versions. `lokasi_id` names a
 * Lokasi Mitra of the Lokasi module (no foreign key across modules).
 */
export const tariffJenisMakam = pgTable(
  "tariff_jenis_makam",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lokasiId: uuid("lokasi_id").notNull(),
    name: text("name").notNull(),
    /** The name folded for the one-name-per-Lokasi rule: lower case, single spaces. */
    nameKey: text("name_key").notNull(),
    description: text("description").notNull(),
    createdAt: at("created_at").notNull(),
    createdByAccountId: text("created_by_account_id").notNull(),
  },
  (table) => [uniqueIndex("tariff_jenis_makam_lokasi_name_idx").on(table.lokasiId, table.nameKey)],
);

/**
 * Owned by the Tariffs module: every version of a Jenis Makam's tariff: the
 * Harga Hak Pakai, the tenure (`tenure_years` null = Selamanya) and the
 * Perpanjangan price per term (set exactly when the tenure is N years).
 */
export const tariffJenisMakamVersion = pgTable(
  "tariff_jenis_makam_version",
  {
    ...versionColumns(),
    jenisMakamId: uuid("jenis_makam_id")
      .notNull()
      .references(() => tariffJenisMakam.id),
    lokasiId: uuid("lokasi_id").notNull(),
    hargaHakPakai: rupiah("harga_hak_pakai").notNull(),
    tenureYears: integer("tenure_years"),
    hargaPerpanjangan: rupiah("harga_perpanjangan"),
  },
  (table) => [
    index("tariff_jenis_makam_version_idx").on(table.jenisMakamId, table.inForceFrom, table.seq),
    check(
      "tariff_jenis_makam_version_amounts_check",
      sql`${table.hargaHakPakai} >= 0 and (${table.hargaPerpanjangan} is null or ${table.hargaPerpanjangan} >= 0)`,
    ),
    check(
      "tariff_jenis_makam_version_tenure_check",
      sql`(${table.tenureYears} is null and ${table.hargaPerpanjangan} is null) or (${table.tenureYears} >= 1 and ${table.hargaPerpanjangan} is not null)`,
    ),
  ],
);
