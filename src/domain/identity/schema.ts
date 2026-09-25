import { bigint, boolean, index, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
  /**
   * The account's real email (lower-cased), unlike `placeholder_email`.
   * Required for every Akun Staf (set by the seed or the accepted Undangan
   * Staf); optional for a Pemesan (ticket 27). Carries the email OTP fallback (ticket 60).
   */
  contactEmail: text("email"),
  /**
   * Set when Admin Platform deactivates the Akun Staf (its staff roles are revoked; it still logs in as a
   * Pemesan). Cleared when a new Undangan Staf grants it a role again.
   */
  deactivatedAt: at("deactivated_at"),
  createdAt: at("created_at").notNull(),
  updatedAt: at("updated_at").notNull(),
});

/** The staff roles an Akun holds (Pemesan is implicit and never stored). */
export const identityStaffRole = pgTable(
  "identity_staff_role",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => identityUser.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["admin_platform", "admin_lokasi", "petugas_lapangan", "mitra_jasa"] }).notNull(),
    grantedAt: at("granted_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.role] })],
);

/**
 * One Undangan Staf: a staff role offered to a WhatsApp number and email by an
 * Admin Platform. Single-use: the next OTP login of that number before
 * `expiresAt` accepts it and grants the role.
 */
export const identityStaffInvite = pgTable(
  "identity_staff_invite",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phoneNumber: text("phone_number").notNull(),
    email: text("email").notNull(),
    role: text("role", { enum: ["admin_platform", "admin_lokasi", "petugas_lapangan", "mitra_jasa"] }).notNull(),
    invitedByAccountId: text("invited_by_account_id").notNull(),
    createdAt: at("created_at").notNull(),
    expiresAt: at("expires_at").notNull(),
    acceptedAt: at("accepted_at"),
    acceptedAccountId: text("accepted_account_id"),
  },
  (table) => [index("identity_staff_invite_phone_idx").on(table.phoneNumber, table.expiresAt)],
);

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
    /** When this session passed TOTP (Admin Platform only). Unknown to Better Auth. */
    totpPassedAt: at("totp_passed_at"),
    /** Wrong TOTP codes typed in this session; the 5th ends it. Unknown to Better Auth. */
    totpWrongAttempts: integer("totp_wrong_attempts").notNull().default(0),
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
    /** Set when the code is used, or burnt by too many wrong attempts. */
    closedAt: at("closed_at"),
    closedReason: text("closed_reason", { enum: ["dipakai", "terlalu_banyak_percobaan"] }),
    /** Set on the OTP whose wrong code locked the number: no OTP is sent and no code accepted until then. */
    lockedUntil: at("locked_until"),
  },
  (table) => [index("identity_otp_request_phone_sent_idx").on(table.phoneNumber, table.sentAt)],
);

/**
 * The authenticator an Admin Platform enrolled for TOTP. The secret is kept
 * only encrypted with TOTP_ENCRYPTION_KEY (AES-256-GCM). Until `confirmedAt`
 * the enrolment is pending and may be restarted.
 */
export const identityTotp = pgTable("identity_totp", {
  accountId: text("account_id")
    .primaryKey()
    .references(() => identityUser.id, { onDelete: "cascade" }),
  secretCiphertext: text("secret_ciphertext").notNull(),
  createdAt: at("created_at").notNull(),
  /** Set by the first code that passes: enrolment is then complete. */
  confirmedAt: at("confirmed_at"),
  /** The last 30 s step whose code was accepted; that code and older ones are refused (no replay). */
  lastUsedStep: bigint("last_used_step", { mode: "number" }),
});
