import { date, doublePrecision, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/**
 * Every Tugas Lapangan type (spec, Field Work): Kunjungan Verifikasi and Cek
 * Denah are fully built (ticket 15); the other three are typed hooks for
 * later tickets (45 Ambil surat pengantar, 46 Berkas IPTM, 58 Survei Wakaf).
 */
export const tugasLapanganTypes = [
  "kunjungan_verifikasi",
  "cek_denah",
  "ambil_surat_pengantar",
  "berkas_iptm",
  "survei_wakaf",
] as const;

/** Ditugaskan until its required uploads are in and it is marked Selesai; no other status in v1. */
export const tugasLapanganStatuses = ["ditugaskan", "selesai"] as const;

/** One uploaded file against a Tugas Lapangan's required-upload kind. */
export interface TugasLapanganUpload {
  id: string;
  kind: string;
  /** The private FileStore key; read only through a signed URL. */
  key: string;
  uploadedAt: string;
}

/**
 * Owned by the Field Work module: one row per Tugas Lapangan. Every time in
 * it comes from the Clock; there are no database defaults for time.
 */
export const fieldworkTugas = pgTable(
  "fieldwork_tugas",
  {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type", { enum: tugasLapanganTypes }).notNull(),
  /** What the task is about, e.g. a Lokasi Mitra's name (no cross-module foreign key). */
  subject: text("subject").notNull(),
  /** The Lokasi Mitra id this task is about, when it is one (Kunjungan Verifikasi, Cek Denah); null otherwise. */
  lokasiId: text("lokasi_id"),
  address: text("address").notNull(),
  pinLat: doublePrecision("pin_lat"),
  pinLng: doublePrecision("pin_lng"),
  plannedDate: date("planned_date", { mode: "string" }).notNull(),
  /** The Petugas Lapangan's Akun id (identity's id; no foreign key across modules). */
  assigneeAccountId: text("assignee_account_id").notNull(),
  status: text("status", { enum: tugasLapanganStatuses }).notNull(),
  /** The type-specific form's answers, validated against its Zod schema before every write (./types.ts). */
  form: jsonb("form").$type<Record<string, unknown>>().notNull(),
  /** TugasLapanganUpload[], in upload order. */
  uploads: jsonb("uploads").$type<TugasLapanganUpload[]>().notNull(),
  createdByAccountId: text("created_by_account_id").notNull(),
  createdAt: at("created_at").notNull(),
  updatedAt: at("updated_at").notNull(),
  completedAt: at("completed_at"),
  },
  (table) => [
    index("fieldwork_tugas_assignee_idx").on(table.assigneeAccountId),
    index("fieldwork_tugas_lokasi_idx").on(table.lokasiId),
  ],
);
