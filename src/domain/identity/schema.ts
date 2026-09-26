import { sql } from "drizzle-orm";
import { bigint, boolean, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { staffRoles } from "./authorize";

/**
 * Owned by the identity module. Better Auth reads and writes the first four
 * tables through its Drizzle adapter (models user, session, account,
 * verification); nothing outside src/domain/identity touches any of them.
 *
 * Every timestamp comes from the Clock (see ./better-auth.ts), so there are no
 * database defaults for time.
 */

const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/**
 * One Akun per Email Terverifikasi (ADR 0004, superseding ADR 0003's phone
 * number key). Better Auth model `user`.
 */
export const identityUser = pgTable(
  "identity_user",
  {
    id: text("id").primaryKey(),
    /** The name as recorded; empty until a wizard or the Akun Saya profile sets it. */
    name: text("name").notNull(),
    /**
     * Better Auth requires a unique email on every user. This holds an
     * undeliverable placeholder (`<id>@akun.makam.invalid`; before ADR 0004,
     * `6281…@wa.makam.invalid`), never shown and never mailed. The Akun's key
     * is `email` below.
     */
    email: text("placeholder_email").notNull().unique(),
    emailVerified: boolean("placeholder_email_verified").notNull().default(false),
    image: text("image"),
    /**
     * The phone number: a contact only (canonical E.164, +62), never verified
     * and never used to log in (ADR 0004), so several Akun may give the same
     * number. Asked for wherever the Akun is used (a wizard's Data & kirim,
     * Akun Saya) and never removed; empty only on an Akun a Kode Masuk has just
     * created on Masuk.
     */
    phoneNumber: text("phone_number"),
    /** Unused since ADR 0004 (Better Auth's phone-number flag); dropped in a later contract step. */
    phoneNumberVerified: boolean("phone_number_verified"),
    /**
     * The Akun's key: its Email Terverifikasi (lower-cased) while
     * `email_verified_at` is set. A Kode Masuk logs into the Akun whose Email
     * Terverifikasi it was sent to, and creates the Akun when there is none.
     * An Akun from before ADR 0004 may hold an email that was only typed in
     * (`email_verified_at` null): that email is no key, and the Akun cannot log
     * in until an Admin Platform does a Pemulihan Akun.
     */
    contactEmail: text("email"),
    /** When a code sent to `email` was entered (a Kode Masuk or Verifikasi Email), from the Clock. */
    emailVerifiedAt: at("email_verified_at"),
    /**
     * Set when Admin Platform deactivates the Akun Staf (its staff roles are revoked; it still logs in as a
     * Pemesan). Cleared when a new Undangan Staf grants it a role again.
     */
    deactivatedAt: at("deactivated_at"),
    createdAt: at("created_at").notNull(),
    updatedAt: at("updated_at").notNull(),
  },
  (table) => [
    // An Email Terverifikasi is the key of exactly one Akun, whatever its case (enforced here, not only
    // in code; the module also stores emails lower-cased).
    uniqueIndex("identity_user_verified_email_idx")
      .on(sql`lower(${table.contactEmail})`)
      .where(sql`email_verified_at is not null`),
  ],
);

/** The staff roles an Akun holds (Pemesan is implicit and never stored). */
export const identityStaffRole = pgTable(
  "identity_staff_role",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => identityUser.id, { onDelete: "cascade" }),
    role: text("role", { enum: staffRoles }).notNull(),
    grantedAt: at("granted_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.role] })],
);

/**
 * Which Lokasi Mitra an Admin Lokasi works for: many-to-many, all equal. The
 * `admin_lokasi` role row says only that the Akun is an Admin Lokasi somewhere;
 * these rows scope it. The Lokasi id is the Lokasi module's; it is not a
 * foreign key, so the identity module stays independent of that module's tables.
 */
export const identityAdminLokasi = pgTable(
  "identity_admin_lokasi",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => identityUser.id, { onDelete: "cascade" }),
    lokasiId: text("lokasi_id").notNull(),
    grantedAt: at("granted_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.lokasiId] }),
    index("identity_admin_lokasi_lokasi_idx").on(table.lokasiId),
  ],
);

/**
 * One Undangan Staf: a staff role offered to an email (with a phone number as
 * contact) by an Admin Platform. Single-use: the next Kode Masuk login of the
 * Akun whose Email Terverifikasi is that email, before `expiresAt`, accepts it
 * and grants the role.
 */
export const identityStaffInvite = pgTable(
  "identity_staff_invite",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The invitee's phone number: a contact only. */
    phoneNumber: text("phone_number").notNull(),
    /** Who may accept it (lower-cased): the Akun whose Email Terverifikasi this is. */
    email: text("email").notNull(),
    role: text("role", { enum: staffRoles }).notNull(),
    /**
     * The Lokasi Mitra an Admin Lokasi invite is for (required for that role,
     * null for the others). Accepting it links the Akun to that Lokasi.
     */
    lokasiId: text("lokasi_id"),
    invitedByAccountId: text("invited_by_account_id").notNull(),
    createdAt: at("created_at").notNull(),
    expiresAt: at("expires_at").notNull(),
    acceptedAt: at("accepted_at"),
    acceptedAccountId: text("accepted_account_id"),
  },
  (table) => [index("identity_staff_invite_email_idx").on(table.email, table.expiresAt)],
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

/** Better Auth model `account` (login providers). Unused by the Kode Masuk; kept because Better Auth expects it. */
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

/** Every code goes by email since ADR 0004; the column goes in a later contract step. */
export const otpChannels = ["email"] as const;
export const otpPurposes = ["masuk", "verifikasi_email"] as const;

/**
 * One row per code sent: a Kode Masuk or a Verifikasi Email code, both to an
 * email, under the shared code rules (./otp.ts). Only an HMAC of the code is
 * kept. Every time in it comes from the Clock.
 */
export const identityOtpRequest = pgTable(
  "identity_otp_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channel: text("channel", { enum: otpChannels }).notNull(),
    /** Where the code went: the lower-cased email. */
    target: text("target").notNull(),
    purpose: text("purpose", { enum: otpPurposes }).notNull(),
    /**
     * Whose wrong codes this row counts toward, and whom its lockout locks:
     * `email:<address>` for a Kode Masuk (the email is the Akun's key, so this
     * is the Akun's lockout, and an email with no Akun yet locks the same way);
     * `akun:<id>` for a Verifikasi Email code of a signed-in Akun.
     */
    lockKey: text("lock_key").notNull(),
    codeHash: text("code_hash").notNull(),
    sentAt: at("sent_at").notNull(),
    expiresAt: at("expires_at").notNull(),
    wrongAttempts: integer("wrong_attempts").notNull().default(0),
    /** Set when the code is used, or burnt by too many wrong attempts. */
    closedAt: at("closed_at"),
    closedReason: text("closed_reason", { enum: ["dipakai", "terlalu_banyak_percobaan"] }),
    /** Set on the code whose wrong entry locked `lock_key`: no code is sent and none accepted until then. */
    lockedUntil: at("locked_until"),
  },
  (table) => [
    index("identity_otp_request_target_sent_idx").on(table.channel, table.target, table.sentAt),
    index("identity_otp_request_lock_sent_idx").on(table.lockKey, table.sentAt),
  ],
);

/**
 * One row per request for an emailed code from one IP (a Kode Masuk, a
 * Verifikasi Email code), whether or not a code went out. Keeps no email.
 */
export const identityIpRequest = pgTable(
  "identity_ip_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ip: text("ip").notNull(),
    requestedAt: at("requested_at").notNull(),
  },
  (table) => [index("identity_ip_request_ip_idx").on(table.ip, table.requestedAt)],
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
