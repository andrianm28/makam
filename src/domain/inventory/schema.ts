import { boolean, check, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/**
 * The terms a Pemesanan Terencana was bought under, kept on each Hak Pakai its
 * payment granted (spec, Inventory > Hak Pakai: "the terms in force at payment
 * (Syarat Pemesanan Terencana snapshot)"). Copied from the order's own snapshot,
 * never read again from the Lokasi Mitra's current policy.
 */
export interface SyaratHakPakai {
  masaPembatalanDays: number;
  refundAfterMasaPembatalanPercent: number;
  hakDengan: "lokasi_mitra";
  lokasiNama: string;
}

/**
 * Owned by the Inventory module: one Blok of a Lokasi Mitra's Denah, a grid of
 * `rows` × `cols`. `lokasi_id` names a Lokasi Mitra of the Lokasi module (no
 * foreign key across modules, as elsewhere in this codebase). `name_key` is
 * `name` folded (lower case, trimmed) for the one-name-per-Lokasi rule.
 * `number_pattern` is the editable pattern (e.g. `A-{nn}`) new Petak numbers
 * come from; a Kavling Keluarga created in this Blok defaults to the same
 * pattern with `K` inserted before its digits (e.g. `A-K{nn}`).
 * `photo_file_key` is the private FileStore key of its site-plan photo, null
 * until one is uploaded (ticket 60 builds the real S3 adapter).
 */
export const inventoryBlok = pgTable(
  "inventory_blok",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lokasiId: uuid("lokasi_id").notNull(),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
    numberPattern: text("number_pattern").notNull(),
    rows: integer("rows").notNull(),
    cols: integer("cols").notNull(),
    /** The Jenis Makam a newly added row/column's Petak cells start with (spec: rows/columns may be added at any edge). */
    defaultJenisMakamId: uuid("default_jenis_makam_id").notNull(),
    photoFileKey: text("photo_file_key"),
    createdAt: at("created_at").notNull(),
    createdByAccountId: text("created_by_account_id").notNull(),
  },
  (table) => [
    uniqueIndex("inventory_blok_lokasi_name_idx").on(table.lokasiId, table.nameKey),
    check("inventory_blok_size_check", sql`${table.rows} >= 1 and ${table.cols} >= 1`),
  ],
);

/**
 * Owned by the Inventory module: one Kavling Keluarga, a fixed group of at
 * least 2 adjacent Petak Makam in one Blok, sold under a single Hak Pakai.
 * `first_used_at` is null until it is ever granted a Hak Pakai (ticket 14
 * builds that entity; until then nothing sets this column, so every Kavling
 * Keluarga this ticket creates can still be split).
 */
export const inventoryKavling = pgTable(
  "inventory_kavling",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blokId: uuid("blok_id")
      .notNull()
      .references(() => inventoryBlok.id),
    lokasiId: uuid("lokasi_id").notNull(),
    nomorKavling: text("nomor_kavling").notNull(),
    nomorKavlingKey: text("nomor_kavling_key").notNull(),
    jenisMakamId: uuid("jenis_makam_id").notNull(),
    firstUsedAt: at("first_used_at"),
    createdAt: at("created_at").notNull(),
    createdByAccountId: text("created_by_account_id").notNull(),
  },
  (table) => [uniqueIndex("inventory_kavling_lokasi_nomor_idx").on(table.lokasiId, table.nomorKavlingKey)],
);

/**
 * A Denah cell's kind: a Petak Makam, a Jalan (path), a Bukan Petak (neutral
 * space) or a Pintu Masuk (the way into the Lokasi Mitra, so a family can
 * orient itself on the Denah). Only a `petak` cell can ever be picked, sold or
 * held, which is why the three others carry no Nomor Makam at all.
 *
 * `pintu_masuk` needs no migration: the column is `text`, and the check below
 * only ever tells a `petak` from the rest.
 */
export const inventoryPetakKinds = ["petak", "jalan", "bukan_petak", "pintu_masuk"] as const;

/**
 * Owned by the Inventory module: one cell of a Blok's grid, at `row`/`col`
 * (0-based, no gaps). Only a `petak` cell carries `nomor_makam` and
 * `jenis_makam_id`; a Jalan, a Bukan Petak and a Pintu Masuk keep both null.
 * `kavling_id` is set only for a `petak` cell that is part of a Kavling
 * Keluarga. `perlu_verifikasi` starts true for every new Petak (spec: not
 * assignable or sellable until the Admin Lokasi clears it, ticket 14).
 * `first_used_at` mirrors the one on `inventory_kavling` (see there); ticket
 * 14's Hak Pakai and Pemakaman are what will set it for real.
 */
export const inventoryPetak = pgTable(
  "inventory_petak",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blokId: uuid("blok_id")
      .notNull()
      .references(() => inventoryBlok.id),
    lokasiId: uuid("lokasi_id").notNull(),
    row: integer("row").notNull(),
    col: integer("col").notNull(),
    kind: text("kind", { enum: inventoryPetakKinds }).notNull(),
    nomorMakam: text("nomor_makam"),
    nomorMakamKey: text("nomor_makam_key"),
    jenisMakamId: uuid("jenis_makam_id"),
    kavlingId: uuid("kavling_id").references(() => inventoryKavling.id),
    perluVerifikasi: boolean("perlu_verifikasi").notNull().default(false),
    /**
     * Ticket 14: the reason an Admin Lokasi manually marked this Petak Tidak
     * Tersedia; only ever set while it has no Hak Pakai. Null the moment a Hak
     * Pakai is granted or the Petak is cleared Tersedia.
     */
    tidakTersediaReason: text("tidak_tersedia_reason"),
    firstUsedAt: at("first_used_at"),
    createdAt: at("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("inventory_petak_blok_position_idx").on(table.blokId, table.row, table.col),
    uniqueIndex("inventory_petak_lokasi_nomor_idx").on(table.lokasiId, table.nomorMakamKey),
    index("inventory_petak_kavling_idx").on(table.kavlingId),
    check(
      "inventory_petak_kind_fields_check",
      sql`(${table.kind} = 'petak' and ${table.nomorMakam} is not null and ${table.jenisMakamId} is not null)
          or (${table.kind} != 'petak' and ${table.nomorMakam} is null and ${table.jenisMakamId} is null and ${table.kavlingId} is null)`,
    ),
  ],
);

/** A Hak Pakai's own status (spec, Inventory > Hak Pakai). Ending it (Kedaluwarsa, Berakhir, Dibatalkan) is built by later tickets (Perpanjangan, Pembatalan, Pengembalian Hak Pakai); this ticket only ever grants Aktif ones. */
export const inventoryHakPakaiStatuses = ["aktif", "kedaluwarsa", "berakhir", "dibatalkan"] as const;

/**
 * Owned by the Inventory module: one Hak Pakai, the right of one Pemegang Hak
 * to use one Petak Makam or one Kavling Keluarga (exactly one of `petak_id` /
 * `kavling_id` is set). `tenure_years` is the Jenis Makam's tenure snapshotted
 * at grant time (null = Selamanya, ticket 14's clearing flow reads this off
 * the Tariffs module once and keeps it, per the spec's Perpanjangan-pricing
 * decision). `tenure_start_at` is null until the first Pemakaman under this
 * Hak Pakai (the tenure clock, spec); `end_date` is derived from it and
 * `tenure_years` and stays null while the clock hasn't started or the Jenis
 * Makam is perpetual — an empty `end_date` alone never means perpetual.
 * `perlu_verifikasi` is the Hak Pakai's own flag (an imported/"data menyusul"
 * Hak Pakai with a missing Pemegang Hak contact or tenure), distinct from a
 * Petak's own `perlu_verifikasi` (a newly drawn cell the Admin Lokasi hasn't
 * cleared yet).
 */
export const inventoryHakPakai = pgTable(
  "inventory_hak_pakai",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lokasiId: uuid("lokasi_id").notNull(),
    petakId: uuid("petak_id").references(() => inventoryPetak.id),
    kavlingId: uuid("kavling_id").references(() => inventoryKavling.id),
    status: text("status", { enum: inventoryHakPakaiStatuses }).notNull().default("aktif"),
    endReason: text("end_reason"),
    tenureYears: integer("tenure_years"),
    startAt: at("start_at").notNull(),
    tenureStartAt: at("tenure_start_at"),
    endDate: at("end_date"),
    perluVerifikasi: boolean("perlu_verifikasi").notNull().default(false),
    /**
     * Recorded once the Admin Lokasi removes the remains from the Petak (spec,
     * Inventory > Pembongkaran; story 129). A Petak stays Terisi after its Hak
     * Pakai ends until this is set, and only then may it be sold or cleared
     * again; `pembongkaran_reason` is the note that goes with it.
     */
    pembongkaranAt: at("pembongkaran_at"),
    pembongkaranReason: text("pembongkaran_reason"),
    /**
     * The Syarat Pemesanan Terencana in force when a Terencana order's payment
     * granted this right (spec, Inventory > Hak Pakai: "the terms in force at
     * payment"), and the Calon Penghuni label the order named for the plot; both
     * null for any other Hak Pakai (ticket 37).
     */
    syarat: jsonb("syarat").$type<SyaratHakPakai>(),
    calonPenghuni: text("calon_penghuni"),
    createdAt: at("created_at").notNull(),
    createdByAccountId: text("created_by_account_id").notNull(),
  },
  (table) => [
    index("inventory_hak_pakai_petak_idx").on(table.petakId),
    index("inventory_hak_pakai_kavling_idx").on(table.kavlingId),
    check(
      "inventory_hak_pakai_target_check",
      sql`(${table.petakId} is not null and ${table.kavlingId} is null) or (${table.petakId} is null and ${table.kavlingId} is not null)`,
    ),
  ],
);

/**
 * Owned by the Inventory module: one holder of a Hak Pakai (the current one
 * has `end_at` null); a later ticket's Ganti Pemegang Hak closes the current
 * row and opens a new one, keeping the history. `name` / `phone_number` /
 * `email` are all null together only for a "data menyusul" Hak Pakai.
 */
export const inventoryPemegangHak = pgTable(
  "inventory_pemegang_hak",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hakPakaiId: uuid("hak_pakai_id")
      .notNull()
      .references(() => inventoryHakPakai.id),
    name: text("name"),
    phoneNumber: text("phone_number"),
    email: text("email"),
    startAt: at("start_at").notNull(),
    endAt: at("end_at"),
    createdByAccountId: text("created_by_account_id").notNull(),
  },
  (table) => [index("inventory_pemegang_hak_hak_pakai_idx").on(table.hakPakaiId)],
);

/**
 * Owned by the Inventory module: one Pemakaman, always at a specific Petak
 * (even one that is a member of a Kavling Keluarga). `date` is a whole date
 * (WIB has no bearing on which calendar day a burial falls on). Several rows
 * on the same Petak make it a tumpang.
 */
export const inventoryPemakaman = pgTable(
  "inventory_pemakaman",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lokasiId: uuid("lokasi_id").notNull(),
    petakId: uuid("petak_id")
      .notNull()
      .references(() => inventoryPetak.id),
    hakPakaiId: uuid("hak_pakai_id")
      .notNull()
      .references(() => inventoryHakPakai.id),
    almarhumName: text("almarhum_name").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    layer: integer("layer").notNull().default(1),
    createdAt: at("created_at").notNull(),
    createdByAccountId: text("created_by_account_id").notNull(),
  },
  (table) => [index("inventory_pemakaman_petak_idx").on(table.petakId)],
);

/**
 * Owned by the Inventory module: one plot hold. A Pemesanan Terencana places it
 * at submission and it is released on decline, withdrawal or lapse (spec,
 * Inventory > Denah: "a plot hold for Terencana is placed at submission and
 * released on decline, withdrawal or lapse"), so no second family can take the
 * same Petak Makam or Kavling Keluarga. `nomor_pemesanan` names the order holding
 * it (no foreign key across modules, as elsewhere); `sampai` is null while the
 * hold is only placed and the order is still Diajukan, because the payment hold
 * with its deadline starts when the Lokasi Mitra confirms (ticket 37).
 *
 * One row per held unit, which makes the open hold of a Petak Makam and of a
 * Kavling Keluarga a uniqueness fact the database itself keeps: two submissions
 * for the same plot cannot both commit.
 */
export const inventoryPlotHold = pgTable(
  "inventory_plot_hold",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lokasiId: uuid("lokasi_id").notNull(),
    petakId: uuid("petak_id").references(() => inventoryPetak.id),
    kavlingId: uuid("kavling_id").references(() => inventoryKavling.id),
    /** The Nomor Pemesanan of the order holding it, e.g. `MKM-2026-000123`. */
    nomorPemesanan: text("nomor_pemesanan").notNull(),
    /**
     * Null while the hold is only placed (the order is Diajukan). **Ticket 37**
     * writes it when the Lokasi Mitra confirms and the payment hold starts running,
     * which is what the pay-first Tagihan's due date is set from; the lapse tick of
     * the same ticket releases a hold whose deadline has passed.
     */
    sampai: at("sampai"),
    placedAt: at("placed_at").notNull(),
  },
  (table) => [
    uniqueIndex("inventory_plot_hold_petak_idx").on(table.petakId),
    uniqueIndex("inventory_plot_hold_kavling_idx").on(table.kavlingId),
    index("inventory_plot_hold_lokasi_idx").on(table.lokasiId),
    index("inventory_plot_hold_nomor_idx").on(table.nomorPemesanan),
    check(
      "inventory_plot_hold_unit_check",
      sql`(${table.petakId} is not null and ${table.kavlingId} is null) or (${table.petakId} is null and ${table.kavlingId} is not null)`,
    ),
  ],
);

/**
 * Owned by the Inventory module: a Petak Makam's earlier Nomor Makam, kept
 * once Admin Platform renumbers it (spec, story 169). Never shown; only a
 * lookup by the old number, and the Audit Log, ever read it.
 */
export const inventoryPetakAlias = pgTable(
  "inventory_petak_alias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lokasiId: uuid("lokasi_id").notNull(),
    petakId: uuid("petak_id")
      .notNull()
      .references(() => inventoryPetak.id),
    nomorMakam: text("nomor_makam").notNull(),
    nomorMakamKey: text("nomor_makam_key").notNull(),
    createdAt: at("created_at").notNull(),
  },
  (table) => [index("inventory_petak_alias_lokasi_nomor_idx").on(table.lokasiId, table.nomorMakamKey)],
);

/**
 * Owned by the Inventory module: one attempt at the Makam keluarga hub's
 * lookup, counted per IP so the grave numbers of a cemetery cannot be guessed
 * through (spec, Inventory > lookup; ticket 34, AC "lookup is rate-limited to
 * prevent enumeration"). A row is written for every attempt, a hit as much as a
 * miss — an enumeration is made of misses — and it carries nothing but the IP
 * and the time: the question that was asked is never kept, because a record of
 * which numbers a visitor tried is a list of the numbers that exist.
 */
export const inventoryCariMakamAttempt = pgTable(
  "inventory_cari_makam_attempt",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The caller's IP as the host's proxy reports it (src/server/client-ip.ts); unknown ones share one bucket. */
    ip: text("ip").notNull(),
    dicobaAt: at("dicoba_at").notNull(),
  },
  (table) => [index("inventory_cari_makam_attempt_ip_idx").on(table.ip, table.dicobaAt)],
);
