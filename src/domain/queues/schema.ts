import { boolean, index, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
  /**
   * What the claimed row is about, the same `subjectKind` its row type reported
   * and its Catatan Internal thread is keyed on. It rides with the claim so a
   * hand-over (the Bertugas auto-off's, ticket 28) can write that thread without
   * rebuilding the Antrean. Null on a claim made before the column existed.
   */
  subjectKind: text("subject_kind"),
  claimedByAccountId: text("claimed_by_account_id").notNull(),
  claimedAt: at("claimed_at").notNull(),
});

/**
 * Owned by the Work Queues module: who is Bertugas now (CONTEXT.md; spec,
 * Work Queues; ticket 28), one row per Akun Staf that switched itself on duty.
 *
 * **Bertugas is an attribute of the Antrean, not an identity.** The table
 * carries an account id that already exists and grants nothing: switching on
 * creates no Akun, no role, no session, and a person with no Akun has no row
 * and cannot be Bertugas. There is deliberately **no Lokasi column**: Bertugas
 * is not scoped to one Lokasi Mitra, so one person is Bertugas for the whole
 * Antrean whatever other roles the Akun holds (spec: one Akun may hold many
 * roles), and no person can be Bertugas at "exactly one" place. The rota behind
 * it lives outside the platform, so nothing is read from a shift either.
 *
 * A row is kept after the shift ends, with `dimatikan_pada` and `alasan` on it:
 * that pair is the record of how the duty ended, and the tick's 18:00/12 h
 * rule reads only the rows still on duty.
 */
export const antreanBertugas = pgTable("antrean_bertugas", {
  /** The Akun Staf on duty. It is the column, not a column on the Akun: nothing here is an Akun of its own. */
  petugasAccountId: text("petugas_account_id").primaryKey(),
  /** When the duty started (the Clock), and when it ends by rule: 18:00 WIB or 12 h after this, whichever comes first. */
  dinyalakanPada: at("dinyalakan_pada").notNull(),
  berakhirPada: at("berakhir_pada").notNull(),
  /** Null while the duty is on; when it came off, and `otomatis` when the tick ended it. */
  dimatikanPada: at("dimatikan_pada"),
  alasan: text("alasan"),
});

/**
 * Owned by the Work Queues module: which Peringatan Staf a Tier 1 Antrean row
 * has already had, and when (ticket 28).
 *
 * Rows themselves are a projection and are never stored, so this is the only
 * trace a row's alerts leave. The insert is the claim: a stage already present
 * is never sent again, which is what makes the alert tick idempotent (a second
 * run at the same `now`, or two workers at once, send nothing the first did
 * not). `tahap` is 0 for the row's own alert and the minutes after the
 * announcement for each escalation (30, and 90 for Konfirmasi TPU Saat Duka).
 */
export const antreanPeringatan = pgTable(
  "antrean_peringatan",
  {
    /** `${rowType}:${subjectId}`, as in Ambil: this module's own key for a row, not a foreign key. */
    rowKey: text("row_key").notNull(),
    /** 0 = the row's own alert; otherwise the minute after the announcement the all-hands alert goes out. */
    tahap: integer("tahap").notNull(),
    dikirimPada: at("dikirim_pada").notNull(),
  },
  (table) => [primaryKey({ columns: [table.rowKey, table.tahap] })],
);

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
    /**
     * True when the platform wrote the note itself rather than a staff member:
     * the Bertugas auto-off's hand-over note (ticket 28), which no one signed to
     * write, so the thread does not put a person's name on it.
     */
    olehPlatform: boolean("oleh_platform").notNull().default(false),
    body: text("body").notNull(),
    createdAt: at("created_at").notNull(),
  },
  (table) => [index("catatan_internal_subject_idx").on(table.subjectKind, table.subjectId)],
);
