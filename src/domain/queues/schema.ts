import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/**
 * Owned by the Work Queues module: one soft claim (Ambil) per Antrean row
 * (spec, story 141): visible to all, takeable by anyone (a claim simply
 * replaces the one before it), its history kept in the Audit Log
 * (`antrean.ambil`), not here.
 */
export const antreanAmbil = pgTable("antrean_ambil", {
  /** `${rowType}:${subjectId}`: this module's own key for a row, not a foreign key. */
  rowKey: text("row_key").primaryKey(),
  claimedByAccountId: text("claimed_by_account_id").notNull(),
  claimedAt: at("claimed_at").notNull(),
});

/**
 * Owned by the Work Queues module: a Catatan Internal (CONTEXT.md), staff-only,
 * on an Antrean row or an order; never shown to the Pemesan, Mitra Jasa or
 * Admin Lokasi (spec, Work Queues).
 */
export const catatanInternal = pgTable(
  "catatan_internal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** What the note is on, e.g. "lokasi_mitra", "tugas_lapangan": free text, no cross-module foreign key. */
    subjectKind: text("subject_kind").notNull(),
    subjectId: text("subject_id").notNull(),
    authorAccountId: text("author_account_id").notNull(),
    body: text("body").notNull(),
    createdAt: at("created_at").notNull(),
  },
  (table) => [index("catatan_internal_subject_idx").on(table.subjectKind, table.subjectId)],
);

/**
 * Owned by the Work Queues module: one stretch of Bertugas (CONTEXT.md) of one
 * Admin Platform, from switching it on to switching it off. Open while
 * `selesai_at` is null; at most one open stretch per Akun. Kept after it ends:
 * an automatic switch-off (18:00 WIB, or 12 h) has no staff writer to audit, so
 * the stretch's own `selesai_oleh` is the record that it happened.
 */
export const antreanBertugas = pgTable(
  "antrean_bertugas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id").notNull(),
    mulaiAt: at("mulai_at").notNull(),
    selesaiAt: at("selesai_at"),
    /** "manual" or "otomatis"; null while open. */
    selesaiOleh: text("selesai_oleh"),
  },
  (table) => [
    uniqueIndex("antrean_bertugas_satu_terbuka_per_akun").on(table.accountId).where(sql`${table.selesaiAt} is null`),
    index("antrean_bertugas_akun_idx").on(table.accountId),
  ],
);

/**
 * Owned by the Work Queues module: where one open Tier 1 row stands in its
 * alerts (ticket 28). Rows are projections, so this is the only state the
 * alerts have: when the tick first saw the row, when its first alert is due
 * (06:00 for a night TPU row) and which of the alerts have gone out. It is
 * deleted the tick after the row closes.
 */
export const antreanPeringatan = pgTable("antrean_peringatan", {
  /** The Antrean's own key for the row, `${type}:${subjectId}`. */
  rowKey: text("row_key").primaryKey(),
  terlihatAt: at("terlihat_at").notNull(),
  pertamaJatuhTempoAt: at("pertama_jatuh_tempo_at").notNull(),
  pertamaAt: at("pertama_at"),
  eskalasi30At: at("eskalasi_30_at"),
  eskalasi90At: at("eskalasi_90_at"),
});
