import { boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Owned by the identity module. Better Auth reads and writes the first four
 * tables through its Drizzle adapter (models user, session, account,
 * verification); nothing outside src/domain/identity touches any of them.
 *
 * Every timestamp comes from the Clock (see ./better-auth.ts), so there are no
 * database defaults for time.
 */

const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/** One account per WhatsApp number (ADR 0003). Better Auth model `user`. */
export const identityUser = pgTable("identity_user", {
  id: text("id").primaryKey(),
  /** The name as recorded; empty until a wizard or the Akun Saya profile sets it. */
  name: text("name").notNull(),
  /**
   * Better Auth requires a unique email on every user. The account has none of
   * its own at login, so this holds an undeliverable placeholder derived from
   * the number (`6281…@wa.makam.invalid`). It is never shown and never mailed;
   * the optional real email (ticket 60, Akun Saya profile) gets its own column.
   */
  email: text("placeholder_email").notNull().unique(),
  emailVerified: boolean("placeholder_email_verified").notNull().default(false),
  image: text("image"),
  /** Canonical E.164, e.g. +6281234567890. */
  phoneNumber: text("phone_number").unique(),
  phoneNumberVerified: boolean("phone_number_verified"),
  createdAt: at("created_at").notNull(),
  updatedAt: at("updated_at").notNull(),
});

/** Better Auth model `session`. Expiry is read against the Clock. */
export const identitySession = pgTable(
  "identity_session",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => identityUser.id, { onDelete: "cascade" }),
    expiresAt: at("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: at("created_at").notNull(),
    updatedAt: at("updated_at").notNull(),
  },
  (table) => [index("identity_session_user_idx").on(table.userId)],
);

/** Better Auth model `account` (login providers). Unused by WhatsApp OTP; kept because Better Auth expects it. */
export const identityAuthAccount = pgTable(
  "identity_auth_account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => identityUser.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: at("access_token_expires_at"),
    refreshTokenExpiresAt: at("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: at("created_at").notNull(),
    updatedAt: at("updated_at").notNull(),
  },
  (table) => [index("identity_auth_account_user_idx").on(table.userId)],
);

/** Better Auth model `verification`. OTP codes do not live here (see identity_otp_request). */
export const identityVerification = pgTable(
  "identity_verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: at("expires_at").notNull(),
    createdAt: at("created_at").notNull(),
    updatedAt: at("updated_at").notNull(),
  },
  (table) => [index("identity_verification_identifier_idx").on(table.identifier)],
);

/**
 * One row per OTP sent to a WhatsApp number. Only a hash of the code is kept.
 * Every time in it comes from the Clock.
 */
export const identityOtpRequest = pgTable(
  "identity_otp_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phoneNumber: text("phone_number").notNull(),
    codeHash: text("code_hash").notNull(),
    sentAt: at("sent_at").notNull(),
    expiresAt: at("expires_at").notNull(),
    wrongAttempts: integer("wrong_attempts").notNull().default(0),
    /** Set when the code is used, replaced by a newer one, or burnt by too many wrong attempts. */
    closedAt: at("closed_at"),
  },
  (table) => [index("identity_otp_request_phone_sent_idx").on(table.phoneNumber, table.sentAt)],
);
