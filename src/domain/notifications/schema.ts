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
    /**
     * The identity session push was turned on in: the Perangkat Push lasts as
     * long as it does (Keluar turns push off). Not a foreign key: identity owns its tables.
     */
    sessionId: text("session_id").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    enabledAt: timestamp("enabled_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [index("notifications_push_device_account_idx").on(table.accountId)],
);

/**
 * Owned by the notifications module: one row per Peringatan Staf sent to an
 * Akun Staf, for the bell in the staff header. It keeps only what the push
 * shows (lock-screen safe: no names, phone numbers or emails) and the staff
 * page of its subject. The times come from the Clock; no database default.
 */
export const notificationsStaffAlert = pgTable(
  "notifications_staff_alert",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The Akun Staf it was sent to. Not a foreign key: identity owns its tables. */
    accountId: text("account_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    /** The staff page of its subject (`/staf` or under it). */
    url: text("url").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }).notNull(),
    /** When the Akun opened the bell with it listed; null while unread. */
    readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [index("notifications_staff_alert_account_sent_idx").on(table.accountId, table.sentAt)],
);
