import { sql } from "drizzle-orm";
import { boolean, check, customType, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { RUPIAH_MAX, rupiahFromDatabase, type Rupiah } from "@/lib/rupiah";

const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/** Whole rupiah in a Postgres `bigint`, converted exactly (never a float), as Billing's own amounts keep it. */
const rupiah = customType<{ data: Rupiah; driverData: string }>({
  dataType: () => "bigint",
  fromDriver: (value) => rupiahFromDatabase(value),
  toDriver: (value) => String(value),
});

/** The range CHECK every whole-rupiah column of this module carries, written per table as the ones above are. */
const rupiahMax = sql.raw(String(RUPIAH_MAX));

/**
 * The proof a Pekerjaan Layanan must show (spec, Layanan > Catalog), derived
 * from what the Layanan *is*, never chosen freely: a photo afterwards always, a
 * photo before for Pembersihan Makam and Perawatan Rumput & Taman, a video for
 * the Laporan Foto/Video.
 *
 * `jenis_layanan` is therefore the catalog's closed list of v1 (decision ticket
 * 09: Bunga, Batu Nisan, Pembersihan Makam, Perawatan Rumput & Taman, Laporan
 * Foto/Video; no custom items per Lokasi in v1). A new kind of Layanan is a new
 * `jenis` here, with its proof beside it, never a proof an Admin Platform may
 * pick: the level is the kind's, and `proofOf` derives what it requires.
 */
export const jenisLayananValues = ["bunga", "nisan", "pembersihan", "perawatan", "laporan"] as const;
export type JenisLayanan = (typeof jenisLayananValues)[number];

/** The three proof levels the catalog's rule produces, as they are carried and shown. */
export const buktiValues = ["foto_sesudah", "foto_sebelum_dan_sesudah", "foto_dan_video"] as const;
export type Bukti = (typeof buktiValues)[number];

/** What each kind of Layanan requires as proof (spec, Catalog): the photo afterwards is never optional. */
export const buktiPerJenis: Record<JenisLayanan, Bukti> = {
  bunga: "foto_sesudah",
  nisan: "foto_sesudah",
  pembersihan: "foto_sebelum_dan_sesudah",
  perawatan: "foto_sebelum_dan_sesudah",
  laporan: "foto_dan_video",
};

/** How often a Paket Layanan repeats (spec, Paket Layanan). */
export const frekuensiValues = ["sekali", "bulanan", "tiga_bulanan", "tahunan"] as const;
export type Frekuensi = (typeof frekuensiValues)[number];

/**
 * Owned by the Layanan module: one Layanan of the one global catalog, kept by
 * Admin Platform. Its fixed-price variants are in `layanan_varian` and its
 * price at each place is a versioned tariff (the Tariffs module), never a
 * price of its own: there is no free pricing. Its proof is not a column: it is
 * what `jenis_layanan` requires (`buktiPerJenis`).
 *
 * `name_key` is the name folded for the one-name-per-catalog rule: lower case,
 * single spaces.
 */
export const layananLayanan = pgTable(
  "layanan_layanan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
    description: text("description").notNull(),
    /** What kind of Layanan this is, which fixes the proof it requires. */
    jenis: text("jenis", { enum: jenisLayananValues }).notNull(),
    /** The minimum days between ordering and the target date (0 = the same day). */
    leadTimeDays: integer("lead_time_days").notNull(),
    /** May be added at a Saat Duka checkout, targeted at the burial itself. */
    bisaHariH: boolean("bisa_hari_h").notNull(),
    /** May be offered on a plot with no burial yet (a Terencana plot). */
    adaDiPetakKosong: boolean("ada_di_petak_kosong").notNull(),
    /** What free text this Layanan asks the Pemesan for (e.g. "Teks nisan"), null when it asks for none. */
    teksLabel: text("teks_label"),
    createdAt: at("created_at").notNull(),
    createdByAccountId: text("created_by_account_id").notNull(),
    updatedAt: at("updated_at"),
  },
  (table) => [
    uniqueIndex("layanan_layanan_name_idx").on(table.nameKey),
    check("layanan_layanan_lead_time_check", sql`${table.leadTimeDays} between 0 and 365`),
  ],
);

/**
 * Owned by the Layanan module: one fixed-price variant of a Layanan ("Nisan
 * Granit 60 cm"). `boleh_di_tpu` is the mark Admin Platform sets by hand: only
 * a marked variant is offered at a DKI TPU, and no Pemda rule is encoded here.
 * Its price at a Lokasi Mitra or in DKI is a versioned tariff, never a column.
 */
export const layananVarian = pgTable(
  "layanan_varian",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    layananId: uuid("layanan_id")
      .notNull()
      .references(() => layananLayanan.id),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
    bolehDiTpu: boolean("boleh_di_tpu").notNull().default(false),
    createdAt: at("created_at").notNull(),
    createdByAccountId: text("created_by_account_id").notNull(),
  },
  (table) => [uniqueIndex("layanan_varian_layanan_name_idx").on(table.layananId, table.nameKey)],
);

/**
 * Owned by the Layanan module: which Layanan variants a Lokasi Mitra offers
 * (the catalog is global; each Lokasi switches on the ones it offers). The row
 * is kept when the Lokasi stops offering the variant, with the moment it did,
 * so the history and the Audit Log stay whole.
 * `lokasi_id` names a Lokasi Mitra of the Lokasi module (no foreign key across
 * modules).
 */
export const layananPenawaran = pgTable(
  "layanan_penawaran",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lokasiId: uuid("lokasi_id").notNull(),
    layananVariantId: uuid("layanan_variant_id")
      .notNull()
      .references(() => layananVarian.id),
    createdAt: at("created_at").notNull(),
    createdByAccountId: text("created_by_account_id").notNull(),
    stoppedAt: at("stopped_at"),
    stoppedByAccountId: text("stopped_by_account_id"),
  },
  (table) => [uniqueIndex("layanan_penawaran_lokasi_varian_idx").on(table.lokasiId, table.layananVariantId)],
);

/**
 * Owned by the Layanan module: a Paket Layanan, defined by Admin Platform as
 * its items (in `layanan_paket_item`) and a frequency. Its price is never a
 * column: it is the sum of its items' prices at the place it is offered.
 */
export const layananPaket = pgTable("layanan_paket", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull(),
  description: text("description").notNull(),
  frekuensi: text("frekuensi", { enum: frekuensiValues }).notNull(),
  createdAt: at("created_at").notNull(),
  createdByAccountId: text("created_by_account_id").notNull(),
  updatedAt: at("updated_at"),
});

/** One Paket Layanan's items, in the order Admin Platform listed them. */
export const layananPaketItem = pgTable(
  "layanan_paket_item",
  {
    paketId: uuid("paket_id")
      .notNull()
      .references(() => layananPaket.id),
    layananVariantId: uuid("layanan_variant_id")
      .notNull()
      .references(() => layananVarian.id),
    posisi: integer("posisi").notNull(),
  },
  (table) => [index("layanan_paket_item_paket_idx").on(table.paketId, table.posisi)],
);

/**
 * An order Layanan of the platform's statuses: it waits for its Tagihan to be
 * paid, and is `terbayar` once the payment scheduled its jobs. Nothing else —
 * the jobs' own statuses carry the work.
 */
export const pesananLayananStatuses = ["menunggu_pembayaran", "terbayar"] as const;
export type PesananLayananStatus = (typeof pesananLayananStatuses)[number];

/**
 * A Pekerjaan Layanan's statuses (spec, Layanan > Pekerjaan Layanan, and AC 3 of
 * the order it comes from): Menunggu Pembayaran → Dijadwalkan → Sedang
 * Dikerjakan → Selesai, plus Terlambat, Dibatalkan and Keluhan.
 *
 * `terlambat` is not a step between two others: a job two days past its target
 * date with no proof is flagged Terlambat whatever else it is (a started job
 * that ran late included), and it keeps that flag while the Admin Lokasi
 * finishes it, so the flag is never lost by the next transition.
 */
export const pekerjaanLayananStatuses = [
  "menunggu_pembayaran",
  "dijadwalkan",
  "sedang_dikerjakan",
  "terlambat",
  "selesai",
  "dibatalkan",
  "keluhan",
] as const;
export type PekerjaanLayananStatus = (typeof pekerjaanLayananStatuses)[number];

/** The three things a job's proof can be: its own list lives in `./pesanan-schema`, the one Zod-only file. */
export type { BuktiPekerjaan } from "./pesanan-schema";
import { buktiPekerjaanValues } from "./pesanan-schema";

/**
 * Owned by the Layanan module: one order Layanan (spec, Layanan > Order: "one
 * order = one grave with one or more Layanan"). Its price is not a column: the
 * Tagihan issued with it is the one immutable record of what was asked for
 * (Billing's lines carry the items and the one Biaya Layanan Platform), and
 * `total` here is that Tagihan's total, kept for a read that must not re-derive
 * it from lines that may one day be replaced.
 *
 * `pemesan_account_id` is who may read and cancel the order. It is never
 * required to be the Pemegang Hak: anyone may order Layanan for a grave
 * somebody else holds (story 84), and that is why the order names the Hak Pakai
 * it is for rather than joining one.
 */
export const pesananLayanan = pgTable(
  "pesanan_layanan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The MKM series every order kind shares, so a payment can find the order from the payment itself. */
    nomor: text("nomor").notNull().unique(),
    /** The grave this order is for: a Petak Makam of that Lokasi Mitra, with its Hak Pakai. */
    lokasiId: uuid("lokasi_id").notNull(),
    petakId: uuid("petak_id").notNull(),
    hakPakaiId: uuid("hak_pakai_id").notNull(),
    /** The Lokasi Mitra and the Petak as they were named at submission, for the Tagihan and the messages. */
    lokasiName: text("lokasi_name").notNull(),
    petakNomor: text("petak_nomor").notNull(),
    pemesanName: text("pemesan_name").notNull(),
    pemesanPhone: text("pemesan_phone").notNull(),
    /** The proven Email Terverifikasi, which is where the order's own messages go. */
    pemesanEmail: text("pemesan_email").notNull(),
    pemesanAccountId: uuid("pemesan_account_id").notNull(),
    status: text("status", { enum: pesananLayananStatuses }).notNull().default("menunggu_pembayaran"),
    /** The pay-first Tagihan issued with this order; the payment effect finds the order through it. */
    tagihanId: uuid("tagihan_id").notNull(),
    total: rupiah("total").notNull(),
    createdAt: at("created_at").notNull(),
  },
  (table) => [
    index("pesanan_layanan_pemesan_idx").on(table.pemesanAccountId, table.createdAt),
    index("pesanan_layanan_lokasi_idx").on(table.lokasiId),
    check("pesanan_layanan_total_check", sql`${table.total} between 0 and ${rupiahMax}`),
  ],
);

/**
 * One Layanan of an order, at the price its Lokasi Mitra charged: the variant
 * chosen, the free text the Layanan asked for (a nisan inscription), the
 * target date, and the whole price as a Tagihan line carries it. The lead time
 * is snapshotted because the due date of the Tagihan is counted from it, and a
 * later catalog edit must not move a due date that was already printed.
 */
export const pesananLayananItem = pgTable(
  "pesanan_layanan_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pesananId: uuid("pesanan_id")
      .notNull()
      .references(() => pesananLayanan.id),
    posisi: integer("posisi").notNull(),
    layananId: uuid("layanan_id")
      .notNull()
      .references(() => layananLayanan.id),
    layananVariantId: uuid("layanan_variant_id")
      .notNull()
      .references(() => layananVarian.id),
    /** "Layanan – Pembersihan Makam (Reguler)", as the catalog and the price word it at submission. */
    label: text("label").notNull(),
    amount: rupiah("amount").notNull(),
    leadTimeDays: integer("lead_time_days").notNull(),
    /** The WIB calendar date the family asked for, which the work may happen on ±2 days around. */
    targetDate: date("target_date", { mode: "string" }).notNull(),
    /** What the Layanan asked the Pemesan to write, or null when it asks for nothing. */
    teks: text("teks"),
  },
  (table) => [
    index("pesanan_layanan_item_pesanan_idx").on(table.pesananId, table.posisi),
    check("pesanan_layanan_item_amount_check", sql`${table.amount} between 0 and ${rupiahMax}`),
    check("pesanan_layanan_item_lead_time_check", sql`${table.leadTimeDays} between 0 and 365`),
  ],
);

/**
 * Owned by the Layanan module: one Pekerjaan Layanan — one Layanan carried out
 * at one Petak Makam on one target date (CONTEXT.md). It is created with the
 * order, `menunggu_pembayaran`, and the payment that settles the order's Tagihan
 * moves it to `dijadwalkan` (spec, Billing > Payment: "Pekerjaan Layanan
 * scheduled"), so no work is ever promised before it is paid for.
 *
 * `terlambat_at` is when the Terlambat tick first flagged it, kept beside the
 * status so the flag is visible to a staff member as a moment and so a
 * cancellation can tell a lateness cancellation from a family one.
 */
export const pekerjaanLayanan = pgTable(
  "pekerjaan_layanan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pesananId: uuid("pesanan_id")
      .notNull()
      .references(() => pesananLayanan.id),
    pesananItemId: uuid("pesanan_item_id")
      .notNull()
      .references(() => pesananLayananItem.id),
    lokasiId: uuid("lokasi_id").notNull(),
    petakId: uuid("petak_id").notNull(),
    status: text("status", { enum: pekerjaanLayananStatuses }).notNull().default("menunggu_pembayaran"),
    /** The same WIB date the order item carried; the ±2 days of work are counted from it. */
    targetDate: date("target_date", { mode: "string" }).notNull(),
    dijadwalkanAt: at("dijadwalkan_at"),
    mulaiAt: at("mulai_at"),
    selesaiAt: at("selesai_at"),
    /** When the Terlambat tick first flagged it (target date + 2 days, no proof). */
    terlambatAt: at("terlambat_at"),
    dibatalkanAt: at("dibatalkan_at"),
    /** The family’s own reason, or the lateness that cancelled it. */
    alasanPembatalan: text("alasan_pembatalan"),
    createdAt: at("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("pekerjaan_layanan_item_idx").on(table.pesananItemId),
    index("pekerjaan_layanan_lokasi_idx").on(table.lokasiId, table.status, table.targetDate),
    index("pekerjaan_layanan_terlambat_idx").on(table.status, table.targetDate),
  ],
);

/**
 * One piece of a job's photo proof, taken in the app by the fulfiller and kept
 * in the private FileStore. The proof a job must show is what its Layanan's
 * `jenis` requires (`buktiPerJenis`), never a free choice, so this row only
 * records what was captured and when.
 *
 * `taken_at` is the moment the Camera API's frame was captured, carried in the
 * form: a job photographed yesterday cannot be timestamped today by the server
 * clock alone, and the Admin Lokasi's own phone is the witness.
 */
export const pekerjaanLayananBukti = pgTable(
  "pekerjaan_layanan_bukti",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pekerjaanId: uuid("pekerjaan_id")
      .notNull()
      .references(() => pekerjaanLayanan.id),
    kind: text("kind", { enum: buktiPekerjaanValues }).notNull(),
    /** The private FileStore key; a proof is never public, only a short-lived signed URL. */
    fileKey: text("file_key").notNull(),
    contentType: text("content_type").notNull(),
    /** When it was captured, from the camera itself. */
    takenAt: at("taken_at").notNull(),
    /** The Akun Staf that captured it, for the Audit Log. */
    diunggahOleh: text("diunggah_oleh").notNull(),
    createdAt: at("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("pekerjaan_layanan_bukti_idx").on(table.pekerjaanId, table.kind),
    index("pekerjaan_layanan_bukti_pekerjaan_idx").on(table.pekerjaanId),
  ],
);

/**
 * Owned by the Layanan module: a refund this order owes, named but not yet paid.
 *
 * The rule the amount comes from is the Layanan module's own, because only it
 * knows which lines are this job's and whether the job was the fulfiller's
 * fault: a family cancelling keeps the Biaya Layanan Platform, a job cancelled
 * for lateness has it refunded (spec, Billing > Refunds). The money itself
 * leaves through Billing — Admin Platform approves every refund and issues the
 * Bukti Pengembalian Dana — so what is recorded here is the request that flow
 * reads, never a payment.
 *
 * `baris` is the refunded lines as the Bukti Pengembalian Dana lists them
 * (label, whole rupiah), kept whole because a Tagihan's lines are immutable and
 * a refund quotes them rather than recomputing them.
 */
export const pengembalianLayanan = pgTable(
  "pengembalian_layanan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The job this is for: one job, one request. */
    pekerjaanId: uuid("pekerjaan_id")
      .notNull()
      .references(() => pekerjaanLayanan.id),
    pesananId: uuid("pesanan_id")
      .notNull()
      .references(() => pesananLayanan.id),
    /** The Tagihan the money came in on, which the Bukti Pengembalian Dana references. */
    tagihanId: uuid("tagihan_id").notNull(),
    /** Why it is being refunded: the family changed their mind, or the job was Terlambat. */
    alasan: text("alasan", { enum: ["pemesan_batal", "terlambat_batal"] }).notNull(),
    /** The refunded lines, each `{ label, amount }` in whole rupiah. */
    baris: jsonb("baris").notNull(),
    /** What the refund comes to; never more than the Tagihan's total. */
    total: rupiah("total").notNull(),
    /** Whether the Biaya Layanan Platform is in the amount (a lateness refund is a full one). */
    platformDikembalikan: boolean("platform_dikembalikan").notNull(),
    createdAt: at("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("pengembalian_layanan_pekerjaan_idx").on(table.pekerjaanId),
    check("pengembalian_layanan_total_check", sql`${table.total} between 0 and ${rupiahMax}`),
  ],
);
