import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

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

/** Which channel a logged message went through (ADR 0004: email only for families; staff get push alongside email). */
export const pesanChannels = ["email", "push"] as const;

/**
 * Whether a logged message is still waiting, went out, failed for good,
 * was stopped (its Tagihan settled before the send) or had no address (an
 * order CS submitted with no email: CS shares document links by hand).
 */
export const pesanStatuses = ["menunggu", "terkirim", "gagal", "dibatalkan", "tanpa_email"] as const;

/**
 * Owned by the notifications module: one row per outbound message (ticket
 * 20), the log and the outbox in one. Retries update the same row
 * (`attempts`, `sendAfter`); the worker's tick sends every `menunggu` row
 * whose `sendAfter` has passed. The Kode Masuk never lands here (identity
 * sends it directly, spec Notifications).
 */
export const notificationsMessage = pgTable(
  "notifications_message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The email template (or staff-alert kind), from this module's event table. */
    template: text("template").notNull(),
    channel: text("channel", { enum: pesanChannels }).notNull(),
    /** The Tagihan the message is about, when it is about one. Not a foreign key: billing owns its tables. */
    tagihanId: text("tagihan_id"),
    nomorTagihan: text("nomor_tagihan"),
    nomorPemesanan: text("nomor_pemesanan"),
    /** The recipient address; null when the order has no email (CS shares links by hand). */
    email: text("email"),
    /** The Akun Staf a Peringatan Staf was sent to, for the staff message log. Not a foreign key: identity owns its tables. */
    akunStafId: text("akun_staf_id"),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: text("status", { enum: pesanStatuses }).notNull(),
    /** Sends attempted so far (the first send is attempt 1). */
    attempts: integer("attempts").notNull(),
    /** Not sent before this (the 08:00–20:00 WIB window, retry backoff). The time comes from the Clock; no database default. */
    sendAfter: at("send_after").notNull(),
    sentAt: at("sent_at"),
    createdAt: at("created_at").notNull(),
  },
  (table) => [
    index("notifications_message_due_idx").on(table.status, table.sendAfter),
    index("notifications_message_tagihan_idx").on(table.tagihanId),
  ],
);

/** Why a "Telepon Pemesan" row was opened: every send failed, or the order never had an email. */
export const teleponSebab = ["pesan_gagal", "tanpa_email"] as const;

/** What the staff member found when they called, logged to close the row. */
export const teleponHasil = ["sudah_dihubungi", "tidak_diangkat", "nomor_salah"] as const;

/**
 * Owned by the notifications module: one "Telepon Pemesan" call request
 * (ticket 20). Opened when a money message finally fails or when a family
 * must act and the order has no email; closed once a staff member logs the
 * call (`catatPanggilan`). The Antrean's Tier 2 row reads the open ones;
 * tickets 29 and 42 open more (their own subjects).
 */
export const notificationsTeleponPemesan = pgTable(
  "notifications_telepon_pemesan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** What the call is about: "tagihan" now (money subjects); tickets 29 and 42 add theirs. */
    subjectKind: text("subject_kind").notNull(),
    subjectId: text("subject_id").notNull(),
    nomorTagihan: text("nomor_tagihan"),
    sebab: text("sebab", { enum: teleponSebab }).notNull(),
    /** The failed message, when `sebab` is `pesan_gagal`. */
    pesanId: uuid("pesan_id"),
    dibukaPada: at("dibuka_pada").notNull(),
    ditutupPada: at("ditutup_pada"),
    hasil: text("hasil", { enum: teleponHasil }),
    catatan: text("catatan"),
    dicatatOleh: text("dicatat_oleh"),
  },
  (table) => [index("notifications_telepon_pemesan_subject_idx").on(table.subjectKind, table.subjectId)],
);

/**
 * Owned by the notifications module: where a Tagihan's family messages go,
 * recorded when the Tagihan is announced (`tagihanTerbit`). The Bukti
 * Pembayaran effect (which learns no address from Billing) reads it back to
 * address the receipt. Not a foreign key: billing owns its tables.
 */
export const notificationsTagihanKontak = pgTable("notifications_tagihan_kontak", {
  /** The Tagihan's id. */
  tagihanId: text("tagihan_id").primaryKey(),
  /** The email on the order; null when CS submitted it with no email. */
  email: text("email"),
  nomorTagihan: text("nomor_tagihan").notNull(),
  nomorPemesanan: text("nomor_pemesanan"),
  /** Whole rupiah, for the receipt the Bukti effect composes. */
  total: integer("total").notNull(),
  /** The unguessable part of the Tagihan page's link, for the email's link into the app. */
  tagihanLink: text("tagihan_link").notNull(),
});
