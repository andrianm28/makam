import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { RUPIAH_MAX, rupiahFromDatabase, type Rupiah } from "@/lib/rupiah";

const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/** Whole rupiah in a Postgres `bigint`, converted exactly (never a float); each column also has a range CHECK. */
const rupiah = customType<{ data: Rupiah; driverData: string }>({
  dataType: () => "bigint",
  fromDriver: (value) => rupiahFromDatabase(value),
  toDriver: (value) => String(value),
});

/** The PaymentProvider's event kinds (PaymentEventKind). */
export const paymentEventKinds = ["paid", "expired", "failed"] as const;

/** What Billing did with a webhook event (PaymentWebhookResult's outcomes, less a replay, which is never recorded). */
export const webhookOutcomes = ["lunas", "sudah_lunas", "diabaikan", "perlu_ditinjau"] as const;

/** Why money reported as paid could not settle a Tagihan (a Pembayaran Perlu Ditinjau). */
export const reviewReasons = [
  /** A payment Billing never created through Bayar. */
  "pembayaran_tidak_dikenal",
  /** The amount paid is not the Tagihan's total. */
  "jumlah_tidak_cocok",
  /** The Tagihan was Dibatalkan (lapsed or replaced) before the money arrived. */
  "tagihan_dibatalkan",
  /** Paid at or after a pay-first Tagihan's due date, when it lapsed (whether or not the lapse tick had run). */
  "batas_pembayaran_lewat",
  /** The Tagihan was already Lunas through another payment: paid twice. */
  "sudah_lunas_dibayar_lagi",
] as const;

const quoted = (values: readonly string[]) => values.map((value) => `'${value}'`).join(", ");

/** The document series numbered per year (spec, Billing > Documents). */
export const documentSeries = ["TGH", "BYR", "RFD", "BKP", "BPM", "BPP", "MKM"] as const;

export const tagihanStatuses = [
  "belum_dibayar",
  "lunas",
  "lewat_jatuh_tempo",
  "tidak_tertagih",
  "dibatalkan",
  "dikembalikan_sebagian",
  "dikembalikan_penuh",
] as const;

/**
 * Owned by the Billing module: the last number given in each document series
 * per year (WIB). A number is taken by incrementing this row inside the
 * transaction that issues the document, so concurrent issues queue on the row
 * lock and a rolled-back issue gives its number back: the series stays gap-free.
 */
export const documentCounter = pgTable(
  "billing_document_counter",
  {
    series: text("series", { enum: documentSeries }).notNull(),
    year: integer("year").notNull(),
    lastNumber: integer("last_number").notNull(),
  },
  (table) => [primaryKey({ columns: [table.series, table.year] })],
);

/**
 * Owned by the Billing module: one row per Tagihan. Everything issued is
 * immutable (the migration adds a trigger refusing any change to it, and any
 * DELETE); only the status and what it records (payment, cancellation,
 * replacement) move. A change of lines is a cancel-and-reissue: a new row with
 * a new Nomor Tagihan, pointing at the one it replaces.
 */
export const tagihan = pgTable(
  "tagihan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nomor: text("nomor").notNull().unique(),
    /** The unguessable part of the document's link (256 random bits, base64url). */
    link: text("link").notNull().unique(),
    kind: text("kind", { enum: ["pay_first", "pay_after"] }).notNull(),
    /** The payment moment and the facts its due date came from (PaymentMoment, dates as ISO strings). */
    moment: jsonb("moment").notNull(),
    issuedAt: at("issued_at").notNull(),
    dueAt: at("due_at").notNull(),
    addresseeRole: text("addressee_role", { enum: ["pemesan", "pemegang_hak"] }).notNull(),
    addresseeName: text("addressee_name").notNull(),
    /** E.164 (+62). */
    addresseePhone: text("addressee_phone").notNull(),
    /** The addressee's Akun when known. Not a foreign key: Billing does not own Akun. */
    addresseeAccountId: text("addressee_account_id"),
    nomorPemesanan: text("nomor_pemesanan"),
    placeName: text("place_name"),
    /** How many lines were issued; no line can be added past it. */
    lineCount: integer("line_count").notNull(),
    total: rupiah("total").notNull(),
    /** Pengaturan Operator's header values in force at issue: legal name, address, phone, email. */
    header: jsonb("header").notNull(),
    /** The Tagihan this one was issued to replace (cancel-and-reissue). */
    replacesId: uuid("replaces_id"),
    status: text("status", { enum: tagihanStatuses }).notNull(),
    cancelledAt: at("cancelled_at"),
    cancelledReason: text("cancelled_reason", { enum: ["batas_pembayaran_lewat", "diganti"] }),
    replacedById: uuid("replaced_by_id"),
    paidAt: at("paid_at"),
  },
  (table) => [
    index("tagihan_lapse_idx").on(table.status, table.kind, table.dueAt),
    check("tagihan_total_check", sql`${table.total} between 0 and ${sql.raw(String(RUPIAH_MAX))}`),
  ],
);

/**
 * Owned by the Billing module: a Tagihan's lines, in order. Only inserted
 * while the Tagihan is issued (up to its line_count), never changed or deleted
 * (the migration adds triggers for both). A Harga Khusus is its own negative line.
 */
export const tagihanLine = pgTable(
  "tagihan_line",
  {
    tagihanId: uuid("tagihan_id")
      .notNull()
      .references(() => tagihan.id),
    position: integer("position").notNull(),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    /** Whole rupiah; negative only for a Penyesuaian Harga Khusus. */
    amount: bigint("amount", { mode: "number" }).notNull(),
    /** Who provides the line: { kind: "lokasi_mitra", lokasiId, name } | { kind: "operator" } | { kind: "pemda" }. */
    provider: jsonb("provider").notNull(),
    layananTargetDate: date("layanan_target_date", { mode: "string" }),
    layananLeadTimeDays: integer("layanan_lead_time_days"),
  },
  (table) => [
    primaryKey({ columns: [table.tagihanId, table.position] }),
    check(
      "tagihan_line_amount_check",
      sql`${table.amount} between -${sql.raw(String(RUPIAH_MAX))} and ${sql.raw(String(RUPIAH_MAX))}`,
    ),
  ],
);

/**
 * Owned by the Billing module: one Bukti Pembayaran per payment of a Tagihan.
 * Append-only (the migration refuses UPDATE and DELETE).
 *
 * `proofKey` is the private FileStore key of the proof a payment outside the
 * provider carries (a transfer slip, a cash receipt, the Lokasi Mitra's own
 * record of a direct payment); null for a provider payment and for a Rp 0
 * Tagihan, which has no money to prove. It is never part of the public
 * `BuktiPembayaran`: the document page is open to anyone holding its link, and
 * a payment slip is read through `urlBukti`, a short-lived signed URL, by
 * Admin Platform alone.
 */
export const buktiPembayaran = pgTable("bukti_pembayaran", {
  id: uuid("id").primaryKey().defaultRandom(),
  nomor: text("nomor").notNull().unique(),
  link: text("link").notNull().unique(),
  tagihanId: uuid("tagihan_id")
    .notNull()
    .references(() => tagihan.id),
  paidAt: at("paid_at").notNull(),
  amount: rupiah("amount").notNull(),
  /** PaymentMethod: how it was paid. */
  method: jsonb("method").notNull(),
  /** The provider's or the transfer's reference, when there is one. */
  reference: text("reference"),
  proofKey: text("proof_key"),
  /** Pengaturan Operator's header values in force when the Bukti was issued. */
  header: jsonb("header").notNull(),
});

/**
 * Owned by the Billing module: each payment the PaymentProvider created for a
 * Tagihan when someone clicked Bayar. Bayar reuses the newest while its link
 * is valid and asks for a new one once it expired; the Tagihan's own due date
 * is independent of these links.
 */
export const providerPayment = pgTable(
  "provider_payment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tagihanId: uuid("tagihan_id")
      .notNull()
      .references(() => tagihan.id),
    providerPaymentId: text("provider_payment_id").notNull().unique(),
    paymentUrl: text("payment_url").notNull(),
    /** Whole rupiah asked of the provider (the Tagihan's total). */
    amount: rupiah("amount").notNull(),
    createdAt: at("created_at").notNull(),
    /** When the provider's link stops working. */
    expiresAt: at("expires_at").notNull(),
  },
  (table) => [
    index("provider_payment_tagihan_idx").on(table.tagihanId, table.expiresAt),
    check("provider_payment_amount_check", sql`${table.amount} between 0 and ${sql.raw(String(RUPIAH_MAX))}`),
  ],
);

/**
 * Owned by the Billing module: every PaymentProvider webhook event processed,
 * by its event id (the Svix message id), so a replayed or duplicate delivery
 * is recognised and changes nothing. Recorded in the transaction that acts on
 * it, so an event whose processing failed is processed again on redelivery.
 */
export const paymentWebhookEvent = pgTable(
  "payment_webhook_event",
  {
    eventId: text("event_id").primaryKey(),
    kind: text("kind", { enum: paymentEventKinds }).notNull(),
    providerPaymentId: text("provider_payment_id").notNull(),
    receivedAt: at("received_at").notNull(),
    /** What Billing did with it. */
    outcome: text("outcome", { enum: webhookOutcomes }).notNull(),
  },
  (table) => [
    check("payment_webhook_event_kind_check", sql`${table.kind} in (${sql.raw(quoted(paymentEventKinds))})`),
    check("payment_webhook_event_outcome_check", sql`${table.outcome} in (${sql.raw(quoted(webhookOutcomes))})`),
  ],
);

/**
 * Owned by the Billing module: each Pembayaran Perlu Ditinjau, money the
 * PaymentProvider reports as paid that Billing could not settle a Tagihan
 * with. Kept for Admin Platform (the Antrean and refunds read it through
 * Billing's public query); append-only in this ticket.
 */
export const pembayaranPerluDitinjau = pgTable(
  "pembayaran_perlu_ditinjau",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reason: text("reason", { enum: reviewReasons }).notNull(),
    /** The webhook event that reported it: one Pembayaran Perlu Ditinjau per event. */
    eventId: text("event_id").notNull().unique(),
    providerPaymentId: text("provider_payment_id").notNull(),
    /** The Tagihan the payment was for, when Billing knows it. */
    tagihanId: uuid("tagihan_id").references(() => tagihan.id),
    /** Whole rupiah the provider reports as paid. */
    amount: rupiah("amount").notNull(),
    channel: text("channel"),
    paidAt: at("paid_at").notNull(),
    receivedAt: at("received_at").notNull(),
  },
  (table) => [
    index("pembayaran_perlu_ditinjau_received_idx").on(table.receivedAt),
    check("pembayaran_perlu_ditinjau_reason_check", sql`${table.reason} in (${sql.raw(quoted(reviewReasons))})`),
    check("pembayaran_perlu_ditinjau_amount_check", sql`${table.amount} between 0 and ${sql.raw(String(RUPIAH_MAX))}`),
  ],
);

/**
 * Owned by the Billing module: a downstream effect of a payment that failed.
 * The payment itself stands; the effect's own changes were rolled back and it
 * waits here to be run again (`retryFailedPaymentEffects`).
 */
export const paymentEffectFailure = pgTable(
  "payment_effect_failure",
  {
    tagihanId: uuid("tagihan_id")
      .notNull()
      .references(() => tagihan.id),
    effect: text("effect").notNull(),
    failedAt: at("failed_at").notNull(),
    attempts: integer("attempts").notNull(),
    /** Set once a retry succeeded. */
    resolvedAt: at("resolved_at"),
  },
  (table) => [primaryKey({ columns: [table.tagihanId, table.effect] })],
);
