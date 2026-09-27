import { date, doublePrecision, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
  address: text("address").notNull(),
  /** Kota or kabupaten, as typed (e.g. "Kota Jakarta Timur", "Kabupaten Bogor"). */
  city: text("city").notNull(),
  pinLat: doublePrecision("pin_lat"),
  pinLng: doublePrecision("pin_lng"),
  status: text("status", { enum: lokasiMitraStatuses }).notNull(),
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
  createdAt: at("created_at").notNull(),
  updatedAt: at("updated_at").notNull(),
});

/**
 * Owned by the Lokasi module: the Hari Libur Nasional list Admin Platform
 * keeps for its Hari Kerja calendar, one row per date (WIB).
 */
export const lokasiHariLiburNasional = pgTable("lokasi_hari_libur_nasional", {
  date: date("date", { mode: "string" }).primaryKey(),
  name: text("name").notNull(),
  createdAt: at("created_at").notNull(),
});
