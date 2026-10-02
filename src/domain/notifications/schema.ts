import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
 * whose `sendAfter` has passed, having claimed it first, so a tick that runs
 * twice sends once. The Kode Masuk never lands here (identity sends it
 * directly, spec Notifications).
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
    /**
     * The Pemesanan Makam the message is about, when it is about one (the
     * order submitted, the order confirmed). Not a foreign key: the pemesanan
     * module owns its tables, and the Notifications module never reads them.
     */
    pemesananId: text("pemesanan_id"),
    /**
     * The Lokasi Mitra whose own work the message is about, when it is (a
     * confirmation, a Bukti Pemesanan, a Perpanjangan, a Hak Pakai expiry, a
     * Layanan at that Lokasi). A message that keeps failing then reaches that
     * Lokasi's Admin Lokasi as a call row, while a money message without one
     * reaches Admin Platform.
     */
    lokasiId: text("lokasi_id"),
    /** The recipient address; null when the order has no email (CS shares links by hand). */
    email: text("email"),
    /** The Akun Staf a Peringatan Staf was sent to, for the staff message log. Not a foreign key: identity owns its tables. */
    akunStafId: text("akun_staf_id"),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: text("status", { enum: pesanStatuses }).notNull(),
    /** Sends attempted so far (the first send is attempt 1). */
    attempts: integer("attempts").notNull(),
    /** Not sent before this (the 08:00–20:00 WIB window, retry backoff, the claim a tick holds while it sends). The time comes from the Clock; no database default. */
    sendAfter: at("send_after").notNull(),
    sentAt: at("sent_at"),
    createdAt: at("created_at").notNull(),
  },
  (table) => [
    index("notifications_message_due_idx").on(table.status, table.sendAfter),
    index("notifications_message_tagihan_idx").on(table.tagihanId),
    index("notifications_message_pemesanan_idx").on(table.pemesananId),
    // One family message per Tagihan per template, whatever runs twice: a
    // reminder kind is a template of its own, so the four pay-after
    // reminders are four templates. A Peringatan Staf has no Tagihan, and
    // several nulls never collide.
    uniqueIndex("notifications_message_tagihan_template_idx").on(table.tagihanId, table.template),
    // The same, for a message about an order: one "pesanan_diajukan" and one
    // "pesanan_dikonfirmasi" per Pemesanan Makam, however often the
    // announcement or the tick runs. Only orders take part, so a Tagihan
    // message (whose `pemesanan_id` is null) never collides here.
    uniqueIndex("notifications_message_pemesanan_template_idx")
      .on(table.pemesananId, table.template)
      .where(sql`${table.pemesananId} is not null`),
  ],
);

/**
 * Why a "Telepon Pemesan" row was opened: every send failed, the order never had
 * an email, the family has to be called rather than emailed (a declined Saat
 * Duka order, spec Work Queues Tier 1 "Saat Duka ditolak (call within 2 h)"),
 * or a pay-after Tagihan is overdue and must be chased (ticket 29's Chasing;
 * the row reopens for each call the overdue list still expects, around H+1
 * and H+14).
 */
export const teleponSebab = ["pesan_gagal", "tanpa_email", "saat_duka_ditolak", "tagihan_lewat_jatuh_tempo", "hak_pakai_berakhir"] as const;

/**
 * What the staff member found when they called, logged to close the row.
 * `janji_bayar` and `menolak` are Chasing's own outcomes (spec, Billing >
 * Chasing: "outcome janji bayar / tidak diangkat / menolak / nomor salah"),
 * offered on every call log all the same: the row is one mechanism, whatever
 * it is open for.
 */
export const teleponHasil = ["sudah_dihubungi", "tidak_diangkat", "nomor_salah", "janji_bayar", "menolak"] as const;

/**
 * Owned by the notifications module: one "Telepon Pemesan" call request
 * (ticket 20). Opened when a money message finally fails or when a family
 * must act and the order has no email; closed once a staff member logs the
 * call (`catatPanggilan`). The Antrean's Tier 2 row reads the open ones;
 * ticket 23 routes Lokasi-work subjects to the Antrean Lokasi, and tickets
 * 29 and 42 open more (their own subjects).
 *
 * `lokasi_id` is what tells the two queues apart: a row with one belongs to
 * that Lokasi Mitra's own staff (a message about its work that failed, or an
 * order of its own with no email) and shows in the Antrean Lokasi; a row
 * without one is a money subject for Admin Platform. `perihal` is the sentence
 * the row says, so the queue never has to read another module's tables to name
 * the subject.
 */
export const notificationsTeleponPemesan = pgTable(
  "notifications_telepon_pemesan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** What the call is about: "tagihan" (money), "pemesanan" (an order of its own), "pesan_lokasi" (a failed Lokasi-work message). */
    subjectKind: text("subject_kind").notNull(),
    subjectId: text("subject_id").notNull(),
    nomorTagihan: text("nomor_tagihan"),
    nomorPemesanan: text("nomor_pemesanan"),
    /** The Lokasi Mitra whose own staff makes this call; null for Admin Platform's money subjects. */
    lokasiId: text("lokasi_id"),
    /** What the staff member has to tell the family, in one sentence. */
    perihal: text("perihal"),
    sebab: text("sebab", { enum: teleponSebab }).notNull(),
    /** The failed message, when `sebab` is `pesan_gagal`. */
    pesanId: uuid("pesan_id"),
    dibukaPada: at("dibuka_pada").notNull(),
    ditutupPada: at("ditutup_pada"),
    hasil: text("hasil", { enum: teleponHasil }),
    catatan: text("catatan"),
    dicatatOleh: text("dicatat_oleh"),
  },
  (table) => [
    index("notifications_telepon_pemesan_subject_idx").on(table.subjectKind, table.subjectId),
    // One open call row per subject, whoever opens it and however many ticks
    // run at once; a closed row frees the subject for a later call.
    uniqueIndex("notifications_telepon_pemesan_open_idx")
      .on(table.subjectKind, table.subjectId)
      .where(sql`${table.ditutupPada} is null`),
  ],
);

/**
 * Owned by the notifications module: the address a Tagihan's family messages
 * go to, recorded when the Tagihan is announced (`tagihanTerbit`) — the one
 * thing the Bukti Pembayaran effect cannot learn from the payment it runs in.
 * Everything else the receipt needs (the number, the amount, the document
 * link) Billing hands the effect with the payment. Not a foreign key:
 * billing owns its tables.
 */
export const notificationsTagihanKontak = pgTable("notifications_tagihan_kontak", {
  /** The Tagihan's id. */
  tagihanId: text("tagihan_id").primaryKey(),
  /** The email on the order; null when CS submitted it with no email. */
  email: text("email"),
});

/**
 * Owned by the notifications module: a standalone note on a chased Tagihan's
 * call log (ticket 29's AC 3: "the Admin Lokasi adds its notes on the same call
 * log"). It is **not a call**: a note never opens, closes or counts as a
 * "Telepon Pemesan" row, so it can never satisfy `declareTidakTertagih`'s "at
 * least one logged call". `tagihan_id` is Billing's, not a foreign key.
 */
export const notificationsCatatanTagihan = pgTable(
  "notifications_catatan_tagihan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tagihanId: text("tagihan_id").notNull(),
    /** The Lokasi Mitra the Tagihan is against, so its Admin Lokasi's write is checked against it. */
    lokasiId: text("lokasi_id"),
    catatan: text("catatan").notNull(),
    ditulisOleh: text("ditulis_oleh").notNull(),
    dibuatPada: at("dibuat_pada").notNull(),
  },
  (table) => [index("notifications_catatan_tagihan_idx").on(table.tagihanId, table.dibuatPada)],
);

/**
 * Owned by the notifications module: a Peringatan Staf about a Tier 1 row of the
 * Antrean, queued (ticket 28) in the transaction in which the Work Queues module
 * claims the alert's stage, and sent by the worker's tick. One row per recipient.
 * Kept after sending (`sent_at`), so a crash between the claim and the send loses
 * nothing: the queued row is still there. Times come from the Clock.
 */
export const notificationsPeringatanAntrean = pgTable(
  "notifications_peringatan_antrean",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The Akun Staf to alert. Not a foreign key: identity owns its tables. */
    accountId: text("account_id").notNull(),
    /** "baru", "eskalasi_30" or "eskalasi_90". */
    tahap: text("tahap").notNull(),
    label: text("label").notNull(),
    subjectLabel: text("subject_label").notNull(),
    href: text("href").notNull(),
    createdAt: at("created_at").notNull(),
    /** When every channel that applies went through (or the Akun is no longer staff): the alert is done. */
    sentAt: at("sent_at"),
    /** Send attempts so far (ticket 91). Defaulted, so the previous release's inserts still work. */
    attempts: integer("attempts").default(0),
    /** Not tried again before this; null before the first attempt. The time comes from the Clock. */
    nextAttemptAt: at("next_attempt_at"),
    /** When the email (or push) went through, so a retry never repeats that channel; null while it has not. */
    emailDoneAt: at("email_done_at"),
    pushDoneAt: at("push_done_at"),
    /** When the last attempt failed and none is left: the alert stops here, logged, never escalated. */
    gaveUpAt: at("gave_up_at"),
    /** When the bell entry was written (first completed attempt), so a retry never lists the alert twice. */
    bellAt: at("bell_at"),
    /** The Antrean row this alert is about (Queues' row key), when it has one: a retry asks Queues whether it is still open. */
    rowKey: text("row_key"),
  },
  (table) => [index("notifications_peringatan_antrean_belum_dikirim_idx").on(table.createdAt).where(sql`${table.sentAt} is null`)],
);

/**
 * Owned by the notifications module: a Peringatan Staf a domain event raises
 * directly (a new Saat Duka or Terencana order, a Tugas Lapangan assigned, a
 * Bukti Pencairan issued), queued (ticket 96) in the transaction of the event
 * itself and sent by the worker's tick, which retries it with the family
 * messages' policy (ticket 91). The rendered email and push are kept whole, so
 * the send needs nothing from the raising module and a crash between the event
 * and the send loses nothing. Times come from the Clock.
 */
export const notificationsPeringatanStaf = pgTable(
  "notifications_peringatan_staf",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The Akun Staf to alert. Not a foreign key: identity owns its tables. */
    accountId: text("account_id").notNull(),
    /** Which Peringatan Staf this is (a `staffAlertKinds` value). */
    kind: text("kind").notNull(),
    emailSubject: text("email_subject").notNull(),
    emailText: text("email_text").notNull(),
    pushTitle: text("push_title").notNull(),
    pushBody: text("push_body").notNull(),
    /** The staff page the push opens (`/staf` or under it). */
    pushUrl: text("push_url").notNull(),
    /** The subject the alert is about, when the raising module can name it: a retry asks that module whether it still needs the alert. */
    subjectKind: text("subject_kind"),
    subjectId: text("subject_id"),
    createdAt: at("created_at").notNull(),
    /** When every channel that applies went through (or the Akun is no longer staff): the alert is done. */
    sentAt: at("sent_at"),
    /** Send attempts so far (ticket 96). Defaulted, so the previous release's inserts still work. */
    attempts: integer("attempts").default(0),
    /** Not tried again before this; null before the first attempt. */
    nextAttemptAt: at("next_attempt_at"),
    /** When the email (or push) went through, so a retry never repeats that channel; null while it has not. */
    emailDoneAt: at("email_done_at"),
    pushDoneAt: at("push_done_at"),
    /** When the last attempt failed and none is left: the alert stops here, logged, never escalated. */
    gaveUpAt: at("gave_up_at"),
    /** When the bell entry was written (first completed attempt), so a retry never lists the alert twice. */
    bellAt: at("bell_at"),
  },
  (table) => [index("notifications_peringatan_staf_belum_dikirim_idx").on(table.createdAt).where(sql`${table.sentAt} is null`)],
);
