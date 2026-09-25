import { bigserial, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Owned by the operator-settings module: one row per change to Pengaturan
 * Operator, each in force from its `in_force_from` until the next one. Rows are
 * only ever inserted, never updated or deleted, so the values in force at any
 * past instant (an issued Tagihan's header) can always be read back. The time
 * comes from the Clock; there is no database default for it.
 */
export const operatorSettingsVersion = pgTable(
  "operator_settings_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Write order, so changes at the same Clock time keep the order they were made in. */
    seq: bigserial("seq", { mode: "number" }).notNull(),
    inForceFrom: timestamp("in_force_from", { withTimezone: true, mode: "date" }).notNull(),
    legalName: text("legal_name").notNull(),
    address: text("address").notNull(),
    phone: text("phone").notNull(),
    email: text("email").notNull(),
    /** Canonical E.164 (+62) WhatsApp number. */
    csWhatsApp: text("cs_whatsapp").notNull(),
    csReplyHours: text("cs_reply_hours").notNull(),
    /** The Admin Platform's Akun. Not a foreign key, like the Audit Log. */
    changedByAccountId: text("changed_by_account_id").notNull(),
  },
  (table) => [index("operator_settings_version_in_force_idx").on(table.inForceFrom, table.seq)],
);
