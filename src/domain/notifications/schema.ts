import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Owned by the notifications module: one row per Perangkat Push, the push
 * subscription one browser (or installed staff app) handed over when its Akun
 * Staf turned push on. The time comes from the Clock; no database default.
 */
export const notificationsPushDevice = pgTable(
  "notifications_push_device",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The Akun Staf the device belongs to. Not a foreign key: identity owns its tables. */
    accountId: text("account_id").notNull(),
    /** The push service URL; one browser has one, so it identifies the device. */
    endpoint: text("endpoint").notNull().unique(),
    /** The browser's P-256 public key and auth secret (unpadded base64url), for payload encryption. */
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    enabledAt: timestamp("enabled_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [index("notifications_push_device_account_idx").on(table.accountId)],
);
