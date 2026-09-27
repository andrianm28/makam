import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
