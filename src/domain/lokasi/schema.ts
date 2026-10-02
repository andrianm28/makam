import { boolean, date, doublePrecision, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { LokasiFlags, LokasiPolicies } from "./policies";
import type { LokasiFacility } from "./profile";
import type { JamOperasional } from "./jam-operasional-schema";

const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/** Every status a Lokasi Mitra can have. It starts Belum Tayang; later tickets set the others. */
export const lokasiMitraStatuses = ["belum_tayang", "terverifikasi", "ditangguhkan", "berhenti"] as const;

/**
 * Owned by the Lokasi module: one row per Lokasi Mitra, its onboarding record.
 * Every time in it comes from the Clock; there are no database defaults for time.
 */
export const lokasiMitra = pgTable("lokasi_mitra", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  pengelolaName: text("pengelola_name").notNull(),
  /** The pengelola's phone (+62) and email, shown to the family at a Berhenti Lokasi; null until recorded. */
  pengelolaTelepon: text("pengelola_telepon"),
  pengelolaEmail: text("pengelola_email"),
  address: text("address").notNull(),
  /** Kota or kabupaten, as typed (e.g. "Kota Jakarta Timur", "Kabupaten Bogor"). */
  city: text("city").notNull(),
  pinLat: doublePrecision("pin_lat"),
  pinLng: doublePrecision("pin_lng"),
  status: text("status", { enum: lokasiMitraStatuses }).notNull(),
  /**
   * This row is example data standing in for a cemetery, not a real one
   * (ticket 86's import of a source whose own catalog is entirely example
   * data). The Lokasi module refuses to publish such a row and every public
   * read leaves it out, whatever its status says.
   */
  dataContoh: boolean("data_contoh").notNull().default(false),
  /** Keys of `lokasiFacilities` (./profile.ts), in checklist order. */
  facilities: jsonb("facilities").$type<LokasiFacility[]>().notNull(),
  facilitiesNote: text("facilities_note").notNull(),
  /** The account Pencairan go to; set and changed only by Admin Platform. All three are set together or none. */
  bankName: text("bank_name"),
  bankAccountNumber: text("bank_account_number"),
  bankAccountHolder: text("bank_account_holder"),
  agreementSignedOn: date("agreement_signed_on", { mode: "string" }),
  /** The agreement scan's key in the private FileStore; read only through a signed URL. */
  agreementScanFileKey: text("agreement_scan_file_key"),
  /** The documents a family brings for a burial here, in order (editable per Lokasi). */
  documentChecklist: jsonb("document_checklist").$type<string[]>().notNull(),
  /** LokasiPolicies (./policies.ts), validated before every write. */
  policies: jsonb("policies").$type<LokasiPolicies>().notNull(),
  /** LokasiFlags (./policies.ts), validated before every write. */
  flags: jsonb("flags").$type<LokasiFlags>().notNull(),
  /** JamOperasional (./jam-operasional-schema.ts), validated before every write; null until the Admin Lokasi saves one (no default). */
  jamOperasional: jsonb("jam_operasional").$type<JamOperasional>(),
  /**
   * The Kontak Siaga's Akun (identity's id; no foreign key across modules) and
   * when it was picked. It counts only while that Akun is still Admin Lokasi
   * here, linked no later than the pick; otherwise a new pick is needed.
   */
  kontakSiagaAccountId: text("kontak_siaga_account_id"),
  kontakSiagaPickedAt: at("kontak_siaga_picked_at"),
  /**
   * Set by a completed Kunjungan Verifikasi (ticket 15, fieldwork module):
   * the visit's dated photos (FileStore keys, in upload order) and the date
   * (WIB) it confirmed the Lokasi. Null until the first Kunjungan Verifikasi.
   * The publish gate's `kunjungan_verifikasi` item is met once this is set.
   */
  visitPhotos: jsonb("visit_photos").$type<string[]>(),
  dikunjungiOn: date("dikunjungi_on", { mode: "string" }),
  /**
   * Set by a completed Cek Denah (ticket 15, fieldwork module): the input to
   * the Terencana switch (ticket 16). Null until the first Cek Denah.
   */
  cekDenahAt: at("cek_denah_at"),
  cekDenahNote: text("cek_denah_note"),
  /**
   * Berhenti (ticket 59): when Admin Platform decided it, the WIB date from
   * which no order of any kind is taken, and when the effective-date tick
   * finished its leftovers. All null unless the status is Berhenti.
   */
  berhentiDecidedAt: at("berhenti_decided_at"),
  berhentiBerlakuOn: date("berhenti_berlaku_on", { mode: "string" }),
  berhentiDiprosesAt: at("berhenti_diproses_at"),
  /** Set once, when the publish gate first admits this Lokasi Mitra (Belum Tayang → Terverifikasi, ticket 16). Null before. */
  publishedAt: at("published_at"),
  /**
   * Admin Platform's last "still meets the publish gate" confirmation, after a
   * revisit (ticket 17's Tier 4 "publish-gate check" row: open again once a
   * later Kunjungan Verifikasi completes). Null before the first one.
   */
  publishGateRecheckedAt: at("publish_gate_rechecked_at"),
  createdAt: at("created_at").notNull(),
  updatedAt: at("updated_at").notNull(),
});

/**
 * Owned by the Lokasi module: one row per DKI TPU (spec, Lokasi). A TPU is a
 * Lokasi Makam the Pemda owns and runs, so the platform holds no Petak Makam
 * for it and no publish gate: being on this list is what makes it public. Every
 * DKI TPU is listed, entered by Admin Platform in the dashboard, never seeded.
 */
export const tpuDki = pgTable(
  "tpu_dki",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** The name folded for the one-name-per-list rule: lower case, single spaces. */
    nameKey: text("name_key").notNull(),
    address: text("address").notNull(),
    /** Kota or kabupaten, as typed (e.g. "Kota Jakarta Timur"), the same label the directory's city filter uses. */
    city: text("city").notNull(),
    pinLat: doublePrecision("pin_lat"),
    pinLng: doublePrecision("pin_lng"),
    /** Where this TPU's record came from (the city's own data, a visit, a phone call), as Admin Platform writes it. */
    dataSource: text("data_source").notNull(),
    /** "Menerima makam baru": only TPUs taking new plots are offered a burial. Set with `flagUpdatedAt`, never alone. */
    menerimaMakamBaru: boolean("menerima_makam_baru").notNull(),
    flagUpdatedAt: at("flag_updated_at").notNull(),
    createdAt: at("created_at").notNull(),
    updatedAt: at("updated_at").notNull(),
  },
  (table) => [uniqueIndex("tpu_dki_name_key_idx").on(table.nameKey), index("tpu_dki_name_idx").on(table.name)],
);

/**
 * Owned by the Lokasi module: the Hari Libur Nasional list Admin Platform
 * keeps for its Hari Kerja calendar, one row per date (WIB).
 */
export const lokasiHariLiburNasional = pgTable("lokasi_hari_libur_nasional", {
  date: date("date", { mode: "string" }).primaryKey(),
  name: text("name").notNull(),
  createdAt: at("created_at").notNull(),
});
