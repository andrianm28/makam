import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Owned by the identity module. One row per OTP sent to a WhatsApp number.
 * Only a hash of the code is kept. Every time in it comes from the Clock.
 */
export const identityOtpRequest = pgTable(
  "identity_otp_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phoneNumber: text("phone_number").notNull(),
    codeHash: text("code_hash").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    wrongAttempts: integer("wrong_attempts").notNull().default(0),
    /** Set when the code is used, replaced by a newer one, or burnt by too many wrong attempts. */
    closedAt: timestamp("closed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [index("identity_otp_request_phone_sent_idx").on(table.phoneNumber, table.sentAt)],
);
