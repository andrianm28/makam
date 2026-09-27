import {
  bigserial,
  customType,
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
import { RUPIAH_MAX, rupiahFromDatabase, type Rupiah } from "@/lib/rupiah";

const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
/**
 * Whole rupiah in a Postgres `bigint`. Never a float: the driver's text is
 * converted exactly, and a stored value outside Rp 0..RUPIAH_MAX is refused
 * (an error) rather than rounded. Every rupiah column also has a CHECK for that range.
 */
const rupiah = customType<{ data: Rupiah; driverData: string }>({
  dataType: () => "bigint",
  fromDriver: (value) => rupiahFromDatabase(value),
  toDriver: (value) => String(value),
});
const inRupiahRange = (column: unknown) => sql`${column} between 0 and ${sql.raw(String(RUPIAH_MAX))}`;

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
    check("tariff_global_version_amount_check", inRupiahRange(table.amount)),
  ],
);

/**
 * Owned by the Tariffs module: each time Admin Platform marks a Lokasi Mitra's
 * tariffs "diperiksa" (checked against the agreement) for the publish gate.
 * The latest row is the mark in force; rows are never changed or deleted.
 */
export const tariffCheck = pgTable(
  "tariff_check",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seq: bigserial("seq", { mode: "number" }).notNull(),
    lokasiId: uuid("lokasi_id").notNull(),
    checkedAt: at("checked_at").notNull(),
    checkedByAccountId: text("checked_by_account_id").notNull(),
  },
  (table) => [index("tariff_check_lokasi_idx").on(table.lokasiId, table.seq)],
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
      sql`${inRupiahRange(table.biayaPemakaman)} and (${table.biayaPemakamanTumpang} is null or ${inRupiahRange(table.biayaPemakamanTumpang)})`,
    ),
  ],
);

/**
 * Owned by the Tariffs module: every version of one Layanan variant's price at
 * one Lokasi Mitra (spec, Tariffs: "per Layanan variant the Lokasi price").
 * `layanan_variant_id` names a variant of the Layanan module (no foreign key
 * across modules); a row is never changed or deleted.
 */
export const tariffLayananVersion = pgTable(
  "tariff_layanan_version",
  {
    ...versionColumns(),
    lokasiId: uuid("lokasi_id").notNull(),
    layananVariantId: uuid("layanan_variant_id").notNull(),
    amount: rupiah("amount").notNull(),
  },
  (table) => [
    index("tariff_layanan_version_idx").on(table.lokasiId, table.layananVariantId, table.inForceFrom, table.seq),
    check("tariff_layanan_version_amount_check", inRupiahRange(table.amount)),
  ],
);

/**
 * Owned by the Tariffs module: every version of one Layanan variant's price at
 * a DKI TPU, the same in every TPU (spec, Tariffs: "DKI Layanan variant price").
 * This is what the Pemesan pays at a TPU; there is no Biaya Layanan Platform
 * on top of it.
 */
export const tariffLayananDkiVersion = pgTable(
  "tariff_layanan_dki_version",
  {
    ...versionColumns(),
    layananVariantId: uuid("layanan_variant_id").notNull(),
    amount: rupiah("amount").notNull(),
  },
  (table) => [
    index("tariff_layanan_dki_version_idx").on(table.layananVariantId, table.inForceFrom, table.seq),
    check("tariff_layanan_dki_version_amount_check", inRupiahRange(table.amount)),
  ],
);

/**
 * Owned by the Tariffs module: every version of what the Operator pays a Mitra
 * Jasa for one Layanan variant (spec, Tariffs: "Mitra Jasa rate per Layanan
 * variant"). It is never part of a quote and never shown to the Pemesan: only
 * Admin Platform reads it.
 */
export const tariffMitraJasaVersion = pgTable(
  "tariff_mitra_jasa_version",
  {
    ...versionColumns(),
    layananVariantId: uuid("layanan_variant_id").notNull(),
    amount: rupiah("amount").notNull(),
  },
  (table) => [
    index("tariff_mitra_jasa_version_idx").on(table.layananVariantId, table.inForceFrom, table.seq),
    check("tariff_mitra_jasa_version_amount_check", inRupiahRange(table.amount)),
  ],
);

/**
 * Owned by the Tariffs module: a Lokasi Mitra's Jenis Makam, defined by Admin
 * Platform. Its prices and tenure live in its versions. `lokasi_id` names a
 * Lokasi Mitra of the Lokasi module (no foreign key across modules). A row is
 * never changed or deleted (a trigger refuses both): its name and description
 * are in Entri Audit, quotes and Tagihan, so a renaming would be a new
 * decision (a new Jenis Makam, or a versioned name), not an update.
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
 * Perpanjangan price per term (required for N years; a Selamanya version may
 * keep one for Hak Pakai bought under an earlier fixed term).
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
      sql`${inRupiahRange(table.hargaHakPakai)} and (${table.hargaPerpanjangan} is null or ${inRupiahRange(table.hargaPerpanjangan)})`,
    ),
    check(
      "tariff_jenis_makam_version_tenure_check",
      sql`${table.tenureYears} is null or (${table.tenureYears} >= 1 and ${table.hargaPerpanjangan} is not null)`,
    ),
  ],
);
