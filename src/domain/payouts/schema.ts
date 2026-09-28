/**
 * Owned by the Payouts module: Pencairan items, Potongan and Bukti Pencairan
 * (spec, domain module 11; ticket 32). Every other table an item refers to —
 * the Tagihan and its lines, the order, the Lokasi Mitra, the bank account —
 * belongs to a neighbour, and is named here as a plain id and text only (no
 * foreign key across modules, as elsewhere in this codebase).
 *
 * The two `pencairan_pem*` tables are the trigger's two halves, not a copy of
 * anything: the Lunas side is written by the payment effect inside the
 * transaction that settles the Tagihan, the burial side by `pemakamanTercatat`
 * (whose caller, the Pemakaman module, is ticket 25 and is not merged yet).
 * Neither is ever read back from Billing or Pemesanan, which is what lets the two
 * arrive in either order and still be a single trigger.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
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
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { RUPIAH_MAX, rupiahFromDatabase, type Rupiah } from "@/lib/rupiah";

const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
/** A plain Postgres `boolean`, named so a field and a column helper never collide. */
const flag = (name: string) => boolean(name);

/**
 * Whole rupiah in a Postgres `bigint`. Never a float: the driver's text is
 * converted exactly, and a stored value outside Rp 0..RUPIAH_MAX is refused
 * (an error) rather than rounded. Every rupiah column also has a CHECK for that
 * range, and every one of them is a `Rupiah`, never a raw number.
 */
const rupiah = customType<{ data: Rupiah; driverData: string }>({
  dataType: () => "bigint",
  fromDriver: (value) => rupiahFromDatabase(value),
  toDriver: (value) => String(value),
});
const inRupiahRange = (column: unknown) => sql`${column} between 0 and ${sql.raw(String(RUPIAH_MAX))}`;
const inPositiveRupiahRange = (column: unknown) => sql`${column} between 1 and ${sql.raw(String(RUPIAH_MAX))}`;

/** Who a Pencairan is paid to (CONTEXT.md): a Lokasi Mitra or a Mitra Jasa, never anyone else. */
export const penerimaKinds = ["lokasi_mitra", "mitra_jasa"] as const;
export type PenerimaKind = (typeof penerimaKinds)[number];

/**
 * What a Pencairan item is money for (spec, Billing > Payouts > Pencairan
 * items). This ticket's trigger makes the two order kinds due; the other two
 * arrive with their own tickets (Perpanjangan on payment, a Layanan's job once
 * its Keluhan window closes), which is why an item of those kinds may sit at
 * `belum_jatuh_tempo` for a while: nothing is omitted, and nothing is paid
 * before its own trigger says so.
 */
export const pencairanItemKinds = ["harga_hak_pakai", "biaya_pemakaman", "perpanjangan", "layanan"] as const;
export type PencairanItemKind = (typeof pencairanItemKinds)[number];

/**
 * An item's one-way status. `dicairkan` and `dibatalkan` are terminal: an item
 * that has been transferred is never transferred again and never comes back, so
 * no amount can leave the Operator twice for the same work (ticket 32's AC 5).
 * A hold-out is not a status (see `tahan_*` on the item): Admin Platform may
 * take an item out of the run and put it back.
 */
export const pencairanItemStatuses = ["belum_jatuh_tempo", "jatuh_tempo", "dicairkan", "dibatalkan"] as const;
export type PencairanItemStatus = (typeof pencairanItemStatuses)[number];

/**
 * Why an item was cancelled: a full refund to the Pelanggan, an amount a
 * partner's share or a refund has already taken in full, or a held Terencana
 * order released (which a later ticket, 59, sets).
 */
export const pencairanItemBatalReasons = ["dikembalikan_penuh", "telah_ditanggung", "dilepas"] as const;
export type PencairanItemBatalReason = (typeof pencairanItemBatalReasons)[number];

/** Where a Pencairan item's amount comes from, as the two rules that can lower it name it. */
export const pencairanItemReasons = ["setelah_keluhan", "porsi_pemegang_saham", "pengembalian_dana"] as const;
export type PencairanItemReason = (typeof pencairanItemReasons)[number];

/**
 * Owned by the Payouts module: one Pencairan item — an amount the Operator owes
 * a Lokasi Mitra or a Mitra Jasa for one piece of work.
 *
 * `amount` is the amount of the **issued Tagihan line** the item came from,
 * copied when the item is created. It is never quoted again: an issued
 * Tagihan's lines are immutable (Billing's own trigger refuses to change them),
 * and a tariff entered between the issue and the burial must not move a number
 * the family has already been sent.
 *
 * `tagihan_id` + `tagihan_posisi` name that line and are unique together, so
 * one line can produce at most one item for the life of the system: the trigger
 * is idempotent in the database, not only in the tick's own bookkeeping.
 */
export const pencairanItem = pgTable(
  "pencairan_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The recipient: `lokasi_mitra` (with `lokasi_id`) or `mitra_jasa` (with `penerima_akun_id`). */
    penerimaKind: text("penerima_kind", { enum: penerimaKinds }).notNull(),
    /** The Lokasi Mitra the money goes to, or the one whose order it is when a Mitra Jasa did the work. */
    lokasiId: text("lokasi_id"),
    /** The recipient as it was named when the item was created, the way a Tagihan keeps its place name. */
    penerimaNama: text("penerima_nama").notNull(),
    /** The Mitra Jasa's Akun; null for a Lokasi Mitra (a partnership, not a login). */
    penerimaAkunId: text("penerima_akun_id"),
    kind: text("kind", { enum: pencairanItemKinds }).notNull(),
    /** The wording the issued Tagihan line carried; the Bukti Pencairan repeats it. */
    label: text("label").notNull(),
    /** Whole rupiah: the issued line's amount, as issued. */
    amount: rupiah("amount").notNull(),
    /** The Tagihan and the line inside it this item came from; null for a line kind with no Tagihan yet. */
    tagihanId: text("tagihan_id"),
    tagihanPosisi: integer("tagihan_posisi"),
    /** The order this work belongs to, for the Admin Lokasi view (AC 8); null for a job with no order. */
    nomorPemesanan: text("nomor_pemesanan"),
    /** The Layanan's target date (WIB "YYYY-MM-DD"), as the issued line carried it. */
    tanggalLayanan: date("tanggal_layanan", { mode: "string" }),
    /**
     * The Mitra Jasa's own view of this item (spec, story 181: job, Layanan,
     * date and rate only) — snapshotted here, because a Mitra Jasa must never
     * see the family's order, the Lokasi's name or anything else. `rate` is the
     * item's own `amount`.
     */
    pekerjaanLabel: text("pekerjaan_label"),
    layananNama: text("layanan_nama"),
    /** Null until the item's own trigger fires; then the instant the work became due. */
    dueAt: at("due_at"),
    /** `dueAt` plus 2 Hari Kerja on the Admin Platform calendar: the Antrean row's deadline (AC 6). */
    jatuhTempoAt: at("jatuh_tempo_at"),
    status: text("status", { enum: pencairanItemStatuses }).notNull(),
    /** Why it was cancelled, when `status` is `dibatalkan`. */
    batalAlasan: text("batal_alasan", { enum: pencairanItemBatalReasons }),
    batalPada: at("batal_pada"),
    /** The amount actually payable: `jumlah_disesuaikan` when it was lowered, else `amount`. */
    jumlahDisesuaikan: rupiah("jumlah_disesuaikan"),
    /** Which rule lowered it, and the note that rule requires. */
    alasanPenyesuaian: text("alasan_penyesuaian", { enum: pencairanItemReasons }),
    catatanPenyesuaian: text("catatan_penyesuaian"),
    disesuaikanOleh: text("disesuaikan_oleh"),
    disesuaikanPada: at("disesuaikan_pada"),
    /**
     * A hold-out: kept out of the Pencairan run and the Antrean with a reason,
     * and put back by Admin Platform. A column, not a status, because it is not
     * a step forward: holding an item and releasing it must not make the item
     * transferable twice, which the one-way status is there to guarantee.
     */
    tahanAlasan: text("tahan_alasan"),
    tahanPada: at("tahan_pada"),
    tahanOleh: text("tahan_oleh"),
    /** Set once, when a Bukti Pencairan covered it. */
    dicairkanPada: at("dicairkan_pada"),
    dibuatPada: at("dibuat_pada").notNull(),
  },
  (table) => [
    // One item per issued Tagihan line, for ever: the trigger cannot run twice into money.
    uniqueIndex("pencairan_item_tagihan_posisi_idx").on(table.tagihanId, table.tagihanPosisi),
    index("pencairan_item_jatuh_tempo_idx").on(table.status, table.jatuhTempoAt),
    // The Admin Lokasi view (AC 8) and the Lokasi's own run row.
    index("pencairan_item_lokasi_idx").on(table.lokasiId, table.status),
    index("pencairan_item_akun_idx").on(table.penerimaAkunId, table.status),
    check("pencairan_item_amount_check", inRupiahRange(table.amount)),
    check("pencairan_item_jumlah_disesuaikan_check", inRupiahRange(table.jumlahDisesuaikan)),
    // A Mitra Jasa is a person, so its item always names the Akun that holds the
    // role; a Lokasi Mitra is a partnership, so its item always names the record.
    // Nothing else is checked here on purpose: the upgrade seed (ticket 71) fills
    // every column of every table with values it invents, and a check it cannot
    // satisfy would leave this table empty, which is exactly what that seed exists
    // to prevent. The pairing itself is built in one place (`recipientOf`).
    check("pencairan_item_penerima_check", sql`${table.penerimaKind} <> 'mitra_jasa' or ${table.penerimaAkunId} is not null`),
    check("pencairan_item_lokasi_check", sql`${table.penerimaKind} <> 'lokasi_mitra' or ${table.lokasiId} is not null`),
  ],
);

/**
 * Owned by the Payouts module: a Potongan — an amount a Lokasi Mitra owes the
 * Operator (CONTEXT.md), kept as a negative line in the next Pencairan.
 *
 * `amount` is positive: what the Lokasi owes, not what is left of the transfer.
 * There is deliberately no `penerima_akun_id` here: a Potongan is never
 * something a Mitra Jasa can owe, so there is nowhere to name one.
 *
 * The one-way status: `berjalan` (it nets the next transfer) → `terpotong` (a
 * Bukti Pencairan took it) or, at 60 days, `perlu_offline` → `lunas` (Admin
 * Platform recorded the offline payment). A `terpotong` Potongan is never
 * netted again, and `bukti_pencairan_potongan.potongan_id` is unique, so that
 * is true in the database as well as in the code.
 */
export const potonganStatuses = ["berjalan", "perlu_offline", "terpotong", "lunas"] as const;
export type PotonganStatus = (typeof potonganStatuses)[number];

/** Why a Lokasi Mitra owes the Operator, in the three ways the spec names them. */
export const potonganAlasanKinds = ["biaya_layanan_platform", "pengembalian_dana", "lainnya"] as const;
export type PotonganAlasanKind = (typeof potonganAlasanKinds)[number];

export const potongan = pgTable(
  "potongan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The Lokasi Mitra that owes it. Never a Mitra Jasa. */
    lokasiId: text("lokasi_id").notNull(),
    /** Whole rupiah, positive: what the Lokasi owes the Operator. */
    amount: rupiah("amount").notNull(),
    /** Which kind of debt this is; `pengembalian_dana` is recorded by the Refunds module (ticket 31). */
    alasanKind: text("alasan_kode", { enum: potonganAlasanKinds }).notNull(),
    /** What the Lokasi owes it for, in words (a staff write, so it always has one). */
    alasan: text("alasan").notNull(),
    /** A link to what shows the debt: a Bukti Pengembalian Dana's page, an email, a Catatan. */
    tautan: text("tautan"),
    /** The Tagihan and order this debt came from, when it came from one (the structured half of the link). */
    sumberTagihanId: text("sumber_tagihan_id"),
    sumberNomorPemesanan: text("sumber_nomor_pemesanan"),
    status: text("status", { enum: potonganStatuses }).notNull(),
    /**
     * How much of it a Bukti Pencairan has already taken. Kept apart from
     * `amount` so the debt itself is never rewritten: a transfer that only
     * covers part of a Potongan leaves the rest `berjalan`, which is what
     * carrying forward means (AC 4), and the next run offers it again.
     */
    terpotongSebesar: rupiah("terpotong_sebesar").notNull().default(sql`'0'::bigint`),
    /** Set by the ageing tick at 60 days: from here it is an offline request, not a netting line. */
    perluOfflinePada: at("perlu_offline_pada"),
    /** When a Bukti Pencairan took it all, or when its offline payment was recorded. */
    tercatatPada: at("tercatat_pada"),
    dicatatOleh: text("dicatat_oleh"),
    dibuatPada: at("dibuat_pada").notNull(),
  },
  (table) => [
    index("potongan_lokasi_status_idx").on(table.lokasiId, table.status, table.dibuatPada),
    // A debt that came from one Tagihan is recorded once: the "dibayar langsung" platform fee of an order cannot be charged twice, however often the trigger runs.
    uniqueIndex("potongan_sumber_kode_idx").on(table.sumberTagihanId, table.alasanKind),
    check("potongan_amount_check", inPositiveRupiahRange(table.amount)),
    check("potongan_terpotong_check", sql`${table.terpotongSebesar} between 0 and ${table.amount}`),
  ],
);

/**
 * Owned by the Payouts module: one Bukti Pencairan — the Operator's record of
 * **one** bank transfer to one recipient (spec, Billing > Pencairan run;
 * `BKP/YYYY/NNNNNN`). The number and the link are taken from Billing's own
 * document series inside the transaction that issues it, exactly as a Bukti
 * Pembayaran takes `BYR/…`.
 *
 * `amount` is what left the bank: the items it covers minus the Potongan it
 * nets, so it can never be 0 and never negative (both are refused rather than
 * transferred). `bukti_transfer_key` is the private FileStore key of the proof
 * Admin Platform uploaded; the key is the record, never the file's bytes.
 */
export const buktiPencairan = pgTable(
  "bukti_pencairan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** `BKP/2026/000001`. */
    nomor: text("nomor").notNull().unique(),
    /** The unguessable part of the Bukti Pencairan page's link (256 random bits, base64url). */
    link: text("link").notNull().unique(),
    /** The recipient, copied from the items it covers: a Bukti is a record of what was paid, to whom. */
    penerimaKind: text("penerima_kind", { enum: penerimaKinds }).notNull(),
    lokasiId: text("lokasi_id"),
    penerimaNama: text("penerima_nama").notNull(),
    penerimaAkunId: text("penerima_akun_id"),
    /** Whole rupiah: what the bank transfer was for. */
    amount: rupiah("amount").notNull(),
    itemCount: integer("item_count").notNull(),
    potonganCount: integer("potongan_count").notNull(),
    /** The date of the transfer as Admin Platform entered it (WIB "YYYY-MM-DD" on a `date`). */
    ditransferPada: date("ditransfer_pada", { mode: "string" }).notNull(),
    /** The private FileStore key of the uploaded transfer proof. */
    buktiTransferKey: text("bukti_transfer_key").notNull(),
    /** Pengaturan Operator's header values in force when the Bukti was issued. */
    header: jsonb("header").notNull(),
    dibuatPada: at("dibuat_pada").notNull(),
  },
  (table) => [
    check("bukti_pencairan_amount_check", inPositiveRupiahRange(table.amount)),
    index("bukti_pencairan_lokasi_idx").on(table.lokasiId, table.ditransferPada),
    index("bukti_pencairan_akun_idx").on(table.penerimaAkunId, table.ditransferPada),
  ],
);

/**
 * Owned by the Payouts module: one item a Bukti Pencairan covered, with the
 * wording and the amount as that Bukti states them. `item_id` is unique across
 * the whole table, which is the database's own half of "an item is transferred
 * at most once in its life": even a bug in the code above it cannot write a
 * second line for the same item.
 */
export const buktiPencairanItem = pgTable(
  "bukti_pencairan_item",
  {
    buktiId: uuid("bukti_id")
      .notNull()
      .references(() => buktiPencairan.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => pencairanItem.id),
    label: text("label").notNull(),
    /** Whole rupiah: what this item contributed to the transfer. */
    amount: rupiah("amount").notNull(),
    nomorPemesanan: text("nomor_pemesanan"),
  },
  (table) => [
    uniqueIndex("bukti_pencairan_item_item_idx").on(table.itemId),
    check("bukti_pencairan_item_amount_check", inPositiveRupiahRange(table.amount)),
  ],
);

/** One Potongan a Bukti Pencairan netted, for the same reason: `potongan_id` is unique, so a Potongan is taken at most once. */
export const buktiPencairanPotongan = pgTable(
  "bukti_pencairan_potongan",
  {
    buktiId: uuid("bukti_id")
      .notNull()
      .references(() => buktiPencairan.id),
    potonganId: uuid("potongan_id")
      .notNull()
      .references(() => potongan.id),
    /** Whole rupiah netted, positive: how much of the Potongan this transfer took. */
    amount: rupiah("amount").notNull(),
    alasan: text("alasan").notNull(),
  },
  (table) => [
    uniqueIndex("bukti_pencairan_potongan_potongan_idx").on(table.potonganId),
    check("bukti_pencairan_potongan_amount_check", inPositiveRupiahRange(table.amount)),
  ],
);

/**
 * Owned by the Payouts module: the Lunas half of the Saat Duka Pencairan
 * trigger, written by the payment effect in the very transaction that settles
 * the Tagihan. Only what the effect was handed is kept — the Tagihan's id, its
 * order, when the money arrived and how it was paid — so nothing here is ever
 * read back from Billing, and a redelivered webhook or a retried effect leaves
 * exactly one row (`tagihan_id` is the primary key).
 */
export const pencairanPembayaran = pgTable("pencairan_pembayaran", {
  tagihanId: text("tagihan_id").primaryKey(),
  nomorPemesanan: text("nomor_pemesanan"),
  dibayarPada: at("dibayar_pada").notNull(),
  /** Billing's PaymentMethod as the effect was handed it: "dibayar langsung" owes no tariff Pencairan. */
  metode: jsonb("metode").notNull(),
});

/**
 * Owned by the Payouts module: the burial half of the Saat Duka Pencairan
 * trigger, meant to be written by the Pemakaman module (ticket 25) in the very
 * transaction that records the burial. That caller does not exist yet, so the
 * table stays empty in this release except in tests; the tick then finds no burial
 * and creates no items, which is the safe direction.
 *
 * Only the instant Payouts needs to know a Pemakaman is recorded: the burial
 * itself — the Almarhum, the Petak, the order's own status — stays the Pemesanan
 * module's, and is not duplicated here.
 */
export const pencairanPemakaman = pgTable("pencairan_pemakaman", {
  nomorPemesanan: text("nomor_pemesanan").primaryKey(),
  pemakamanPada: at("pemakaman_pada").notNull(),
});

/**
 * Whose fault a refund is (spec, Billing > Refunds: "Whether the Biaya Layanan
 * Platform is refunded"). The whole rule of the table below is these four words:
 * the Operator's own fee is kept for `pemesan` and refunded for the other three,
 * because the fee buys the convenience the Pemesan chose and the Operator owes
 * nothing back when the fault is not the Pemesan's.
 *
 * `lokasi` and `mitra_jasa` are separate, not one "partner": a Mitra Jasa is
 * never clawed back (spec, Payouts) and a Lokasi Mitra's share becomes a
 * Potongan, so the two cannot share a value.
 */
export const pengembalianFaults = ["pemesan", "lokasi", "mitra_jasa", "operator"] as const;
export type PengembalianFault = (typeof pengembalianFaults)[number];

/**
 * What asked for the money back, in the six words the spec and the ticket use
 * (ticket 31: "a cancellation, a Keluhan, a Pembatalan, a PTSP rejection,
 * Berhenti leftovers or a goodwill decision"). It is a **why**, kept on the row
 * so the Entri Audit and the Bukti Pengembalian Dana can name it; the amount
 * itself comes from the lines, never from this list.
 */
export const pengembalianSebabs = [
  /** A Saat Duka order cancelled after confirmation (ticket 24). */
  "pemesanan_dibatalkan",
  /** A Keluhan, decided by Admin Platform. */
  "keluhan",
  /** A Terencana Hak Pakai's Pembatalan (ticket 38). */
  "pembatalan",
  /** A TPU Pengurusan refused at the PTSP (ticket 47). */
  "ptsp_ditolak",
  /** Open Pekerjaan Layanan left over when a Lokasi Mitra goes Berhenti (spec, Lokasi). */
  "sisa_berhenti",
  /** A goodwill decision the Operator makes of its own accord. */
  "goodwill",
] as const;
export type PengembalianSebab = (typeof pengembalianSebabs)[number];

/**
 * Who bears the money (spec, Billing > Refunds: "Goodwill refunds the Operator
 * chooses to give come from its own funds and are never netted as a Potongan, so
 * each refund records whether it is netted from the partner or Operator-funded").
 * `mitra` is the only value that may produce a Potongan, and it may produce one
 * only for a Lokasi Mitra's own share.
 */
export const pengembalianPenanggung = ["mitra", "operator"] as const;
export type PengembalianPenanggung = (typeof pengembalianPenanggung)[number];

/**
 * A refund's one-way status. `diminta` → `disetujui` → `ditransfer`, and
 * `ditransfer` is terminal: money that has left the bank is not asked for
 * again, which is what makes "no money leaves without an approval" (AC 2) and
 * "an amount cannot be refunded twice" the same rule. The Tier 3 Antrean row is
 * exactly the `disetujui` rows, so it closes itself on the transfer (AC 3).
 */
export const pengembalianStatuses = ["diminta", "disetujui", "ditransfer"] as const;
export type PengembalianStatus = (typeof pengembalianStatuses)[number];

/**
 * Owned by the Payouts module: one refund — a request for a Pemesan's money to
 * go back, from the moment something asks for it to the moment the transfer
 * proof is uploaded.
 *
 * A refund is **not** an edit of a Tagihan. The Tagihan keeps the two columns
 * ticket 24 wrote (`pengembalian_diminta_at` / `pengembalian_jumlah`) as the
 * *request* a cancellation made, and Billing moves the Tagihan's own status when
 * the money is transferred; this row is the decision about the money, which is
 * the Operator's and lives here. The Tagihan's number, the Pemesan's name and
 * phone, and each line's label, amount and provider are **copied** on the way
 * in, exactly as a Bukti Pencairan copies its items' wording: a document must
 * never need a read back to say what it says, and a tariff or a name entered
 * later must not move a number the family has already been sent.
 *
 * `jumlah` is what leaves the bank, and `biaya_layanan_platform` is the Operator's
 * own fee on this bill — the amount that was **kept** when
 * `biaya_layanan_platform_dikembalikan` is false, and part of `jumlah` when it
 * is true. Keeping the fee's own figure (rather than only a yes/no) is what lets
 * the Bukti say "Biaya Layanan Platform: tidak dikembalikan, Rp 150.000" in the
 * words the spec asks for, without adding it up again.
 */
export const pengembalian = pgTable(
  "pengembalian",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Billing's Tagihan this reverses, as a plain id (no foreign key across modules). */
    tagihanId: text("tagihan_id").notNull(),
    /** `TGH/2026/000123`, copied at the request so a document never reads Billing back. */
    nomorTagihan: text("nomor_tagihan").notNull(),
    nomorPemesanan: text("nomor_pemesanan"),
    /** The addressee the money goes to: the Pemesan who paid, who may not be the Pemegang Hak. */
    pemesanNama: text("pemesan_nama").notNull(),
    pemesanTelepon: text("pemesan_telepon").notNull(),
    pemesanAkunId: text("pemesan_akun_id"),
    /** Whose fault it is, which is what decides the Biaya Layanan Platform. */
    fault: text("fault", { enum: pengembalianFaults }).notNull(),
    /** What asked for it, in the six words above. */
    sebab: text("sebab", { enum: pengembalianSebabs }).notNull(),
    /** Whole rupiah to give back: the sum of `pengembalian_baris`. */
    jumlah: rupiah("jumlah").notNull(),
    /** The Biaya Layanan Platform on this bill; 0 when the bill has none. */
    biayaLayananPlatform: rupiah("biaya_layanan_platform").notNull().default(sql`'0'::bigint`),
    /** The fault rule, stored rather than recomputed: what the Bukti has to say. */
    biayaLayananPlatformDikembalikan: flag("biaya_layanan_platform_dikembalikan").notNull(),
    /** Whether the money comes out of the partner's share or the Operator's own funds. */
    penanggung: text("penanggung", { enum: pengembalianPenanggung }).notNull(),
    /** Why, in words; required for a goodwill decision, which is the Operator's own money. */
    catatan: text("catatan"),
    /**
     * Where the money goes: `{ bankName, accountNumber, accountHolder }`, entered
     * by the Pemesan or recorded by Admin Platform (AC 5). Null until someone
     * records it, and a transfer is refused without it — the account is a person's
     * statement about where to pay, never a value this module can guess.
     */
    rekening: jsonb("rekening"),
    status: text("status", { enum: pengembalianStatuses }).notNull(),
    dimintaPada: at("diminta_pada").notNull(),
    /** Who asked for it: an Admin Platform's account, or null when another module asked in its own write. */
    dimintaOleh: text("diminta_oleh"),
    disetujuiPada: at("disetujui_pada"),
    disetujuiOleh: text("disetujui_oleh"),
    /**
     * `disetujui_pada` plus 2 Hari Kerja on the Admin Platform calendar: the Tier 3
     * Antrean row's deadline (AC 3), stamped once at approval and read, never
     * recalculated. Null until it is approved.
     */
    jatuhTempoAt: at("jatuh_tempo_at"),
    /** The transfer's date as Admin Platform entered it (WIB "YYYY-MM-DD"), null until the transfer. */
    ditransferPada: date("ditransfer_pada", { mode: "string" }),
    dibuatPada: at("dibuat_pada").notNull(),
  },
  (table) => [
    // The Tier 3 row's own query: every approved refund still waiting for its money.
    index("pengembalian_status_idx").on(table.status, table.jatuhTempoAt),
    // One **live** request per Tagihan per cause, so a cancellation that records
    // its request twice does not queue two approvals for the same rupiah, while a
    // second refund of the same cause after the first was paid out is still
    // possible (the condition is what makes that true).
    uniqueIndex("pengembalian_tagihan_sebab_idx")
      .on(table.tagihanId, table.sebab)
      .where(sql`${table.status} <> 'ditransfer'`),
    check("pengembalian_jumlah_check", inPositiveRupiahRange(table.jumlah)),
    check("pengembalian_biaya_layanan_platform_check", inRupiahRange(table.biayaLayananPlatform)),
    // A fee that was refunded is part of the amount refunded, never more: the two
    // columns are the fault rule, and a stored pair that contradicts it is refused.
    check(
      "pengembalian_biaya_layanan_platform_dikembalikan_check",
      sql`${table.biayaLayananPlatform} = 0 or ${table.biayaLayananPlatform} <= ${table.jumlah}`,
    ),
  ],
);

/**
 * One issued Tagihan line a refund gives back, with the wording and the amount
 * as that line was issued. `posisi` is the line's own position inside the Tagihan,
 * so a Bukti Pengembalian Dana lists its lines in the order the family saw on the
 * bill.
 *
 * The primary key is (`pengembalian_id`, `posisi`) so a line can be refunded by
 * two separate partial refunds — which is normal — and the guard against
 * over-refunding is the amount rule, not a uniqueness: a request whose lines
 * would give back more than a line is still worth is refused.
 */
export const pengembalianBaris = pgTable(
  "pengembalian_baris",
  {
    pengembalianId: uuid("pengembalian_id")
      .notNull()
      .references(() => pengembalian.id),
    /** The issued Tagihan line's own position. */
    posisi: integer("posisi").notNull(),
    label: text("label").notNull(),
    /** Whole rupiah given back for this line. */
    jumlah: rupiah("jumlah").notNull(),
    /** The issued line's provider, copied: the Bukti says who provided what it returns. */
    provider: jsonb("provider").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.pengembalianId, table.posisi] }),
    check("pengembalian_baris_jumlah_check", inPositiveRupiahRange(table.jumlah)),
  ],
);

/**
 * Owned by the Payouts module: one Bukti Pengembalian Dana (CONTEXT.md: the
 * Operator's record of a refund transfer to a Pemesan, referencing the Tagihan it
 * partly or fully reverses). The number comes from Billing's own `RFD/YYYY/NNNNNN`
 * series inside the transaction that issues it, exactly as a Bukti Pencairan
 * takes `BKP/…`.
 *
 * The same three guards as `terbitkanBuktiPencairan` make it impossible to pay
 * one refund twice: a row lock on the refund, the one-way `ditransfer` status,
 * and a unique index on `pengembalian_id`.
 */
export const buktiPengembalianDana = pgTable(
  "bukti_pengembalian_dana",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** `RFD/2026/000001`. */
    nomor: text("nomor").notNull().unique(),
    /** The unguessable part of the Bukti Pengembalian Dana page's link (256 random bits, base64url). */
    link: text("link").notNull().unique(),
    pengembalianId: uuid("pengembalian_id")
      .notNull()
      .references(() => pengembalian.id),
    /** Whole rupiah: what left the bank. */
    jumlah: rupiah("jumlah").notNull(),
    /** The transfer's date as Admin Platform entered it (WIB "YYYY-MM-DD" on a `date`). */
    ditransferPada: date("ditransfer_pada", { mode: "string" }).notNull(),
    /** The private FileStore key of the uploaded transfer proof; the key is the record, never the bytes. */
    buktiTransferKey: text("bukti_transfer_key").notNull(),
    /** Pengaturan Operator's header values in force when the Bukti was issued. */
    header: jsonb("header").notNull(),
    dibuatPada: at("dibuat_pada").notNull(),
  },
  (table) => [
    // One transfer per refund, for ever: a bug above this line cannot pay twice.
    uniqueIndex("bukti_pengembalian_dana_pengembalian_idx").on(table.pengembalianId),
    check("bukti_pengembalian_dana_jumlah_check", inPositiveRupiahRange(table.jumlah)),
  ],
);
