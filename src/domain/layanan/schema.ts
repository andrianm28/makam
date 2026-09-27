import { boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/**
 * The proof a Pekerjaan Layanan must show (spec, Layanan > Catalog), derived
 * from what the Layanan *is*, never chosen freely: a photo afterwards always, a
 * photo before for Pembersihan Makam and Perawatan Rumput & Taman, a video for
 * the Laporan Foto/Video.
 *
 * `jenis_layanan` is therefore the catalog's closed list of v1 (decision ticket
 * 09: Bunga, Batu Nisan, Pembersihan Makam, Perawatan Rumput & Taman, Laporan
 * Foto/Video; no custom items per Lokasi in v1). A new kind of Layanan is a new
 * `jenis` here, with its proof beside it, never a proof an Admin Platform may
 * pick: the level is the kind's, and `proofOf` derives what it requires.
 */
export const jenisLayananValues = ["bunga", "nisan", "pembersihan", "perawatan", "laporan"] as const;
export type JenisLayanan = (typeof jenisLayananValues)[number];

/** The three proof levels the catalog's rule produces, as they are carried and shown. */
export const buktiValues = ["foto_sesudah", "foto_sebelum_dan_sesudah", "foto_dan_video"] as const;
export type Bukti = (typeof buktiValues)[number];

/** What each kind of Layanan requires as proof (spec, Catalog): the photo afterwards is never optional. */
export const buktiPerJenis: Record<JenisLayanan, Bukti> = {
  bunga: "foto_sesudah",
  nisan: "foto_sesudah",
  pembersihan: "foto_sebelum_dan_sesudah",
  perawatan: "foto_sebelum_dan_sesudah",
  laporan: "foto_dan_video",
};

/** How often a Paket Layanan repeats (spec, Paket Layanan). */
export const frekuensiValues = ["sekali", "bulanan", "tiga_bulanan", "tahunan"] as const;
export type Frekuensi = (typeof frekuensiValues)[number];

/**
 * Owned by the Layanan module: one Layanan of the one global catalog, kept by
 * Admin Platform. Its fixed-price variants are in `layanan_varian` and its
 * price at each place is a versioned tariff (the Tariffs module), never a
 * price of its own: there is no free pricing. Its proof is not a column: it is
 * what `jenis_layanan` requires (`buktiPerJenis`).
 *
 * `name_key` is the name folded for the one-name-per-catalog rule: lower case,
 * single spaces.
 */
export const layananLayanan = pgTable(
  "layanan_layanan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
    description: text("description").notNull(),
    /** What kind of Layanan this is, which fixes the proof it requires. */
    jenis: text("jenis", { enum: jenisLayananValues }).notNull(),
    /** The minimum days between ordering and the target date (0 = the same day). */
    leadTimeDays: integer("lead_time_days").notNull(),
    /** May be added at a Saat Duka checkout, targeted at the burial itself. */
    bisaHariH: boolean("bisa_hari_h").notNull(),
    /** May be offered on a plot with no burial yet (a Terencana plot). */
    adaDiPetakKosong: boolean("ada_di_petak_kosong").notNull(),
    /** What free text this Layanan asks the Pemesan for (e.g. "Teks nisan"), null when it asks for none. */
    teksLabel: text("teks_label"),
    createdAt: at("created_at").notNull(),
    createdByAccountId: text("created_by_account_id").notNull(),
    updatedAt: at("updated_at"),
  },
  (table) => [
    uniqueIndex("layanan_layanan_name_idx").on(table.nameKey),
    check("layanan_layanan_lead_time_check", sql`${table.leadTimeDays} between 0 and 365`),
  ],
);

/**
 * Owned by the Layanan module: one fixed-price variant of a Layanan ("Nisan
 * Granit 60 cm"). `boleh_di_tpu` is the mark Admin Platform sets by hand: only
 * a marked variant is offered at a DKI TPU, and no Pemda rule is encoded here.
 * Its price at a Lokasi Mitra or in DKI is a versioned tariff, never a column.
 */
export const layananVarian = pgTable(
  "layanan_varian",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    layananId: uuid("layanan_id")
      .notNull()
      .references(() => layananLayanan.id),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
    bolehDiTpu: boolean("boleh_di_tpu").notNull().default(false),
    createdAt: at("created_at").notNull(),
    createdByAccountId: text("created_by_account_id").notNull(),
  },
  (table) => [uniqueIndex("layanan_varian_layanan_name_idx").on(table.layananId, table.nameKey)],
);

/**
 * Owned by the Layanan module: which Layanan variants a Lokasi Mitra offers
 * (the catalog is global; each Lokasi switches on the ones it offers). The row
 * is kept when the Lokasi stops offering the variant, with the moment it did,
 * so the history and the Audit Log stay whole.
 * `lokasi_id` names a Lokasi Mitra of the Lokasi module (no foreign key across
 * modules).
 */
export const layananPenawaran = pgTable(
  "layanan_penawaran",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lokasiId: uuid("lokasi_id").notNull(),
    layananVariantId: uuid("layanan_variant_id")
      .notNull()
      .references(() => layananVarian.id),
    createdAt: at("created_at").notNull(),
    createdByAccountId: text("created_by_account_id").notNull(),
    stoppedAt: at("stopped_at"),
    stoppedByAccountId: text("stopped_by_account_id"),
  },
  (table) => [uniqueIndex("layanan_penawaran_lokasi_varian_idx").on(table.lokasiId, table.layananVariantId)],
);

/**
 * Owned by the Layanan module: a Paket Layanan, defined by Admin Platform as
 * its items (in `layanan_paket_item`) and a frequency. Its price is never a
 * column: it is the sum of its items' prices at the place it is offered.
 */
export const layananPaket = pgTable("layanan_paket", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull(),
  description: text("description").notNull(),
  frekuensi: text("frekuensi", { enum: frekuensiValues }).notNull(),
  createdAt: at("created_at").notNull(),
  createdByAccountId: text("created_by_account_id").notNull(),
  updatedAt: at("updated_at"),
});

/** One Paket Layanan's items, in the order Admin Platform listed them. */
export const layananPaketItem = pgTable(
  "layanan_paket_item",
  {
    paketId: uuid("paket_id")
      .notNull()
      .references(() => layananPaket.id),
    layananVariantId: uuid("layanan_variant_id")
      .notNull()
      .references(() => layananVarian.id),
    posisi: integer("posisi").notNull(),
  },
  (table) => [index("layanan_paket_item_paket_idx").on(table.paketId, table.posisi)],
);
