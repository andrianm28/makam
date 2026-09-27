import { boolean, check, index, integer, pgTable, primaryKey, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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

/**
 * The three Mitra Jasa statuses (spec, Layanan > Mitra Jasa). A Lokasi Mitra
 * has its own list, with "Belum Tayang" and "Terverifikasi"; a Mitra Jasa has
 * none of those, so there are exactly three (CONTEXT.md: Dihapus is avoided and
 * Ditangguhkan is reserved for a Lokasi Mitra or a Mitra Jasa alike).
 *
 * `aktif` is a Mitra Jasa taking work, `ditangguhkan` is one Admin Platform
 * suspends until reinstated, and `berhenti` is one whose partnership ended for
 * good. Only the last two take a reason.
 */
export const mitraJasaStatuses = ["aktif", "ditangguhkan", "berhenti"] as const;
export type MitraJasaStatus = (typeof mitraJasaStatuses)[number];

/**
 * Owned by the Layanan module: one Mitra Jasa's own record, which Admin Platform
 * onboards and which that person keeps up themselves (spec, Layanan > Mitra
 * Jasa > Profile).
 *
 * `email` is the address the Undangan Staf went to, and the key: the Mitra
 * Jasa is the Akun whose Email Terverifikasi is this address (ADR 0004), which
 * is how a profile created before that person ever logged in is found again.
 *
 * `nik` identifies the person, so it is unique as an email is: the same NIK
 * twice is the same Mitra Jasa entered twice, which is refused.
 *
 * There is **no NPWP column** (spec: "optional emergency contact (no NPWP)"):
 * the Operator pays a Mitra Jasa without one, and a field for it would only
 * invite someone to demand one.
 *
 * The bank account is where Pencairan go. `catatan_override_rekening` is the
 * override note the account name needs when it is not the name on the KTP
 * (`nama_lengkap`), which is the one rule `rekening` refuses to take without.
 */
export const layananMitraJasa = pgTable(
  "layanan_mitra_jasa",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    namaLengkap: text("nama_lengkap").notNull(),
    /** 16 digits. */
    nik: text("nik").notNull(),
    ktpFileKey: text("ktp_file_key"),
    ktpContentType: text("ktp_content_type"),
    fotoFileKey: text("foto_file_key"),
    fotoContentType: text("foto_content_type"),
    /** Home area: where the Mitra Jasa works from. */
    area: text("area").notNull(),
    /** The signed arrangement's scan and the date it was signed (either may still be missing). */
    perjanjianTandaTanganPada: text("perjanjian_tanda_tangan_pada"),
    perjanjianFileKey: text("perjanjian_file_key"),
    perjanjianContentType: text("perjanjian_content_type"),
    bankName: text("bank_name"),
    bankAccountNumber: text("bank_account_number"),
    bankAccountHolder: text("bank_account_holder"),
    /** Why the account name is not the KTP's; required when it is not. */
    catatanOverrideRekening: text("catatan_override_rekening"),
    kontakSiagaNama: text("kontak_siaga_nama"),
    kontakSiagaTelepon: text("kontak_siaga_telepon"),
    status: text("status", { enum: mitraJasaStatuses }).notNull(),
    statusAlasan: text("status_alasan"),
    statusDiubahPada: at("status_diubah_pada").notNull(),
    createdAt: at("created_at").notNull(),
    createdByAccountId: text("created_by_account_id").notNull(),
    updatedAt: at("updated_at"),
  },
  (table) => [
    uniqueIndex("layanan_mitra_jasa_email_idx").on(table.email),
    uniqueIndex("layanan_mitra_jasa_nik_idx").on(table.nik),
    check("layanan_mitra_jasa_nik_check", sql`${table.nik} ~ '^[0-9]{16}$'`),
    check(
      "layanan_mitra_jasa_status_alasan_check",
      sql`${table.status} = 'aktif' or length(coalesce(${table.statusAlasan}, '')) > 0`,
    ),
  ],
);

/**
 * Which DKI TPUs one Mitra Jasa covers (spec: "coverage lists (DKI TPUs,
 * Layanan)"). `tpu_dki_id` names a TPU of the Lokasi module (no foreign key
 * across modules), and the assignment picker (ticket 56) filters on it.
 */
export const layananMitraJasaTpu = pgTable(
  "layanan_mitra_jasa_tpu",
  {
    mitraJasaId: uuid("mitra_jasa_id")
      .notNull()
      .references(() => layananMitraJasa.id),
    tpuDkiId: uuid("tpu_dki_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.mitraJasaId, table.tpuDkiId] }),
    index("layanan_mitra_jasa_tpu_tpu_idx").on(table.tpuDkiId),
  ],
);

/**
 * Which Layanan variants one Mitra Jasa covers. A variant and not a Layanan,
 * because the Mitra Jasa rate is per variant (spec, Tariffs), so that is the
 * grain a job and its picker are decided at.
 */
export const layananMitraJasaLayanan = pgTable(
  "layanan_mitra_jasa_layanan",
  {
    mitraJasaId: uuid("mitra_jasa_id")
      .notNull()
      .references(() => layananMitraJasa.id),
    layananVariantId: uuid("layanan_variant_id")
      .notNull()
      .references(() => layananVarian.id),
  },
  (table) => [
    primaryKey({ columns: [table.mitraJasaId, table.layananVariantId] }),
    index("layanan_mitra_jasa_layanan_varian_idx").on(table.layananVariantId),
  ],
);

/**
 * One "Tidak tersedia" range a Mitra Jasa set for themselves (spec, story 177):
 * no work is assigned to them on those dates. `dari` and `sampai` are WIB
 * calendar dates, inclusive on both ends, because a person says "I am away
 * from the 3rd to the 7th". A range may not overlap another of the same
 * Mitra Jasa, and it survives a suspension or an ending: it is their own
 * calendar, not the Operator's judgement.
 */
export const layananMitraJasaTidakTersedia = pgTable(
  "layanan_mitra_jasa_tidak_tersedia",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mitraJasaId: uuid("mitra_jasa_id")
      .notNull()
      .references(() => layananMitraJasa.id),
    dari: text("dari").notNull(),
    sampai: text("sampai").notNull(),
    alasan: text("alasan"),
    dibuatPada: at("dibuat_pada").notNull(),
  },
  (table) => [
    index("layanan_mitra_jasa_tidak_tersedia_mitra_idx").on(table.mitraJasaId, table.dari),
    check("layanan_mitra_jasa_tidak_tersedia_rentang_check", sql`${table.dari} <= ${table.sampai}`),
  ],
);

/**
 * One Mitra Jasa's monthly scorecard review row (spec, Work Queues: the Tier 4
 * "monthly scorecard review" row; ticket 55). The tick writes the row on the
 * first of each WIB month with the 90-day numbers as they stand then, and
 * Admin Platform closes it by recording the review, so running the tick twice
 * changes nothing and the row is a projection of state, never a hand-made one.
 *
 * The numbers are kept as counted, so the review shows what the scorecard said
 * at the moment it was opened; `rata_penilaian` is null until the Mitra Jasa has
 * a Penilaian inside the window.
 */
export const layananMitraJasaTinjauan = pgTable(
  "layanan_mitra_jasa_tinjauan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mitraJasaId: uuid("mitra_jasa_id")
      .notNull()
      .references(() => layananMitraJasa.id),
    /** The WIB month being reviewed, "YYYY-MM". */
    bulan: text("bulan").notNull(),
    /** The 90-day scorecard the tick counted when it opened this row. */
    selesai: integer("selesai").notNull(),
    terlambat: integer("terlambat").notNull(),
    keluhanUpheld: integer("keluhan_upheld").notNull(),
    /** Declines and "Tidak direspons" together, as the spec's one scorecard line. */
    declines: integer("declines").notNull(),
    rataPenilaian: real("rata_penilaian"),
    dibukaPada: at("dibuka_pada").notNull(),
    ditinjauPada: at("ditinjau_pada"),
    ditinjauOlehAccountId: text("ditinjau_oleh_account_id"),
    catatan: text("catatan"),
  },
  (table) => [
    uniqueIndex("layanan_mitra_jasa_tinjauan_bulan_idx").on(table.mitraJasaId, table.bulan),
    index("layanan_mitra_jasa_tinjauan_bulan_idx_bulan").on(table.bulan),
  ],
);
