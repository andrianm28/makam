import { bigserial, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Owned by the audit module: one row per Entri Audit. Rows are only ever
 * inserted, never updated or deleted, so an account's history outlives it.
 * The time comes from the Clock; there is no database default for it.
 */
export const auditEntry = pgTable(
  "audit_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Write order, so entries at the same Clock time keep the order they were recorded in. */
    seq: bigserial("seq", { mode: "number" }).notNull(),
    at: timestamp("at", { withTimezone: true, mode: "date" }).notNull(),
    /** The Akun that did the write. Not a foreign key: the Audit Log outlives any account change. */
    actorAccountId: text("actor_account_id").notNull(),
    /** The role the Akun acted under, e.g. admin_platform. */
    actorRole: text("actor_role").notNull(),
    action: text("action").notNull(),
    entityKind: text("entity_kind").notNull(),
    entityId: text("entity_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
  },
  (table) => [index("audit_entry_entity_idx").on(table.entityKind, table.entityId, table.at, table.seq)],
);
