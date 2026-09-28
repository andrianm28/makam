import { date, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/**
 * Every Tugas Lapangan type (spec, Field Work; CONTEXT.md): Kunjungan
 * Verifikasi and Cek Denah are fully built (ticket 15); Ambil surat pengantar
 * (ticket 45) and Setor Retribusi (a Retribusi Pemda paid in person, ticket 45)
 * are built here; Berkas IPTM and Survei Wakaf are typed hooks for tickets 46
 * and 58.
 */
export const tugasLapanganTypes = [
  "kunjungan_verifikasi",
  "cek_denah",
  "ambil_surat_pengantar",
  "berkas_iptm",
  "survei_wakaf",
  "setor_retribusi",
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
  /**
   * The Tagihan a Setor Retribusi Tugas settles, for that type only (billing
   * owns its tables, so this is its id and never a join); null for every other
   * type.
   */
  tagihanId: text("tagihan_id"),
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

/**
 * Owned by the Field Work module: one payment to a town's office on a Retribusi
 * Pemda line, recorded with the proof that it was paid (spec, Tariffs: "a
 * non-zero one is collected at cost and paid on to the Pemda by Admin Platform
 * or the Petugas Lapangan, recorded with an uploaded setoran proof"; ticket 45).
 *
 * It lives beside the Tugas whose upload carries the proof rather than in the
 * Billing module, because Billing knows nothing of a payment *out* to a town and
 * never reads this file: the row's own `buktiKey` is the private FileStore key of
 * the setoran receipt, read only through a signed URL.
 *
 * `tagihanId` names a Billing row and carries no foreign key, as everywhere; one
 * row per Tagihan (`fieldwork_setor_retribusi_tagihan_idx` is unique), so a
 * second recording of the same Tagihan is refused rather than a second payment
 * to the town. The Tier 3 "Setor Retribusi" Antrean row is a projection of
 * Billing's Lunas Retribusi Tagihan minus this table, so it closes itself when
 * the payment is recorded, whoever recorded it.
 */
export const fieldworkSetorRetribusi = pgTable(
  "fieldwork_setor_retribusi",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tagihanId: text("tagihan_id").notNull(),
    /** The Tagihan's number as issued, kept so the receipt names what it pays without billing's read. */
    nomorTagihan: text("nomor_tagihan").notNull(),
    /** The amount handed to the town, in rupiah; the Retribusi line's own amount, never the order's total. */
    amount: integer("amount").notNull(),
    /** The date the town took the money, as the paper says (a WIB calendar date, `YYYY-MM-DD`). */
    dibayarkanPada: at("dibayarkan_pada").notNull(),
    /** The private FileStore key of the setoran proof. */
    buktiKey: text("bukti_key").notNull(),
    /** Whoever recorded it: an Admin Platform, or the Petugas Lapangan who paid in person. */
    dicatatOleh: text("dicatat_oleh").notNull(),
    /** The Akun's role it was recorded under, as the Audit Log writes it. */
    dicatatOlehPeran: text("dicatat_oleh_peran").notNull(),
    /** The Setor Retribusi Tugas whose upload carried the proof; null when an Admin Platform recorded it directly. */
    tugasLapanganId: uuid("tugas_lapangan_id"),
    catatan: text("catatan"),
    dicatatPada: at("dicatat_pada").notNull(),
  },
  (table) => [uniqueIndex("fieldwork_setor_retribusi_tagihan_idx").on(table.tagihanId)],
);
