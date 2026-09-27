/**
 * The Pemesanan Terencana order (spec, domain module 6, Pemesanan > Terencana):
 * a booking made in advance, reserving one or more Petak Makam (or one whole
 * Kavling Keluarga) for a Calon Penghuni. Ticket 22 builds the shared
 * `pemesanan_makam` table for the Saat Duka order; the tables here carry what
 * only a Terencana order has — several chosen plots, a Calon Penghuni, and the
 * Syarat snapshot — and the two fold into one order table on a `kind`
 * discriminator when that ticket lands (see the ticket's Comments).
 *
 * Owns tables: pemesanan_terencana, pemesanan_terencana_unit.
 */
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/**
 * The statuses a Pemesanan Terencana runs through (spec, Pemesanan > Terencana):
 * Diajukan (the plots are held) → Dikonfirmasi (the payment hold runs, the
 * pay-first Tagihan is due when it ends) → Aktif (paid, one Hak Pakai per Petak
 * Makam or Kavling Keluarga), plus Ditolak and Dibatalkan. This ticket only ever
 * places an order Diajukan; the later steps are ticket 37 (confirmation and
 * payment) and ticket 38 (Pembatalan).
 */
export const pemesananTerencanaStatuses = ["diajukan", "dikonfirmasi", "aktif", "ditolak", "dibatalkan"] as const;
export type PemesananTerencanaStatus = (typeof pemesananTerencanaStatuses)[number];

/**
 * The Syarat Pemesanan Terencana as they were when the order was placed (spec,
 * Pemesanan > Terencana; story 44). They are snapshotted on the order and never
 * re-read from the Lokasi Mitra, so a later change of that Lokasi Mitra's policy
 * cannot change what a family agreed to.
 */
export interface SyaratTerencana {
  /** The Masa Pembatalan: the days after payment in which a Pembatalan refunds the full tariff. */
  masaPembatalanDays: number;
  /** What is refunded after that Masa Pembatalan, in percent of the tariff. */
  refundAfterMasaPembatalanPercent: number;
  /** The Hak Pakai is against the Lokasi Mitra, and the Operator only records it and collects the payment. */
  hakDengan: "lokasi_mitra";
  /** The Lokasi Mitra as it was named when the order was placed, since the right is against it. */
  lokasiNama: string;
}

/** The Pemegang Hak a Terencana order names (CONTEXT.md), never the Calon Penghuni. */
export interface PemegangHakTerencana {
  mode: "pemesan" | "lain";
  /** The holder's name, the Pemesan's own when `mode` is "pemesan", as recorded at submission. */
  name: string;
  /** Canonical E.164 (+62…), a contact only: never verified, never a login. */
  phoneNumber: string | null;
  email: string | null;
}

/** The Calon Penghuni the plot is prepared for: the Pemesan themselves by default, else a name the Pemegang Hak may change later. */
export interface CalonPenghuniTerencana {
  mode: "saya" | "lain";
  /** Null for "saya": the living person it is prepared for is the Pemesan. */
  name: string | null;
}

/**
 * Owned by the Pemesanan module: one Pemesanan Terencana, reserving one or more
 * Petak Makam (or one whole Kavling Keluarga) for one Calon Penghuni. `lokasi_id`
 * and the unit columns name an Inventory Lokasi Mitra, Petak Makam and Kavling
 * Keluarga (no foreign key across modules, as elsewhere).
 *
 * `lokasi_name`, the unit's `jenis_makam_name` and its number are copied at
 * submission, so the order reads the way it was placed even after the Lokasi
 * Mitra is renamed or a Petak Makam renumbered.
 *
 * Nothing is billed here: the Tagihan is issued when the Lokasi Mitra confirms
 * (`tagihan_id`, null until then), and `konfirmasi_due_at` the deadline its Jam
 * Operasional gave at submission are ticket 37's.
 */
export const pemesananTerencana = pgTable(
  "pemesanan_terencana",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** `MKM-2026-000123`: given at submission and shown at confirmation, from Billing's one series. */
    nomor: text("nomor").notNull(),
    status: text("status", { enum: pemesananTerencanaStatuses }).notNull(),
    lokasiId: uuid("lokasi_id").notNull(),
    lokasiName: text("lokasi_name").notNull(),
    /** The Akun that placed the order; the Kode Masuk at Kirim created it or found it (ADR 0004). */
    pemesanAccountId: text("pemesan_account_id").notNull(),
    /** The Pemesan's name as typed (their Akun keeps its own, possibly empty). */
    pemesanName: text("pemesan_name").notNull(),
    /** The Email Terverifikasi every family message goes to. */
    email: text("email").notNull(),
    /** The phone number as typed, a contact only: never verified, never a login. */
    phoneNumber: text("phone_number").notNull(),
    pemegangHak: jsonb("pemegang_hak").$type<PemegangHakTerencana>().notNull(),
    calonPenghuni: jsonb("calon_penghuni").$type<CalonPenghuniTerencana>().notNull(),
    syarat: jsonb("syarat").$type<SyaratTerencana>().notNull(),
    /** The instant the Lokasi Mitra's Jam Operasional promised a confirmation by; null until ticket 37 sets it. */
    konfirmasiDueAt: at("konfirmasi_due_at"),
    /** The Tagihan issued when the Lokasi Mitra confirmed; null until then. Nothing is billed at submission. */
    tagihanId: text("tagihan_id"),
    /** Why the Lokasi Mitra declined, or why the order was cancelled; null while none. */
    alasan: text("alasan"),
    diajukanAt: at("diajukan_at").notNull(),
  },
  (table) => [
    uniqueIndex("pemesanan_terencana_nomor_idx").on(table.nomor),
    index("pemesanan_terencana_pemesan_idx").on(table.pemesanAccountId),
    index("pemesanan_terencana_lokasi_idx").on(table.lokasiId),
  ],
);

/**
 * Owned by the Pemesanan module: one unit a Pemesanan Terencana reserves. Either
 * a Petak Makam (`petak_id`, with its Nomor Makam) or a Kavling Keluarga
 * (`kavling_id`, with its Nomor Kavling), never both; the member Petak of a Kavling
 * are not units of their own, because one Hak Pakai covers the whole Kavling.
 * `urutan` keeps the order the Pemesan picked them in, which the order page reads.
 */
export const pemesananTerencanaUnit = pgTable(
  "pemesanan_terencana_unit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pemesananId: uuid("pemesanan_id")
      .notNull()
      .references(() => pemesananTerencana.id),
    lokasiId: uuid("lokasi_id").notNull(),
    petakId: uuid("petak_id"),
    kavlingId: uuid("kavling_id"),
    nomorMakam: text("nomor_makam"),
    nomorKavling: text("nomor_kavling"),
    /** The Jenis Makam that prices this unit (a Kavling Keluarga has one of its own). */
    jenisMakamId: uuid("jenis_makam_id").notNull(),
    jenisMakamName: text("jenis_makam_name").notNull(),
    urutan: text("urutan").notNull(),
  },
  (table) => [
    index("pemesanan_terencana_unit_pemesanan_idx").on(table.pemesananId),
    index("pemesanan_terencana_unit_petak_idx").on(table.petakId),
    index("pemesanan_terencana_unit_kavling_idx").on(table.kavlingId),
  ],
);
