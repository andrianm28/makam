import { date, doublePrecision, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { LokasiFlags, LokasiPolicies } from "./policies";
import type { LokasiFacility } from "./profile";

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
  createdAt: at("created_at").notNull(),
  updatedAt: at("updated_at").notNull(),
});
