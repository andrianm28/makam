import { sql } from "drizzle-orm";
import { check, customType, date, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { RUPIAH_MAX, rupiahFromDatabase, type Rupiah } from "@/lib/rupiah";

const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/**
 * Whole rupiah in a Postgres `bigint`, converted exactly (never a float), as the
 * Tariffs and Billing price columns keep it: the driver hands the value over as
 * text and a stored amount outside Rp 0..RUPIAH_MAX is an error, not a rounded
 * number. Every rupiah column also has a CHECK for that range.
 */
const rupiah = customType<{ data: Rupiah; driverData: string }>({
  dataType: () => "bigint",
  fromDriver: (value) => rupiahFromDatabase(value),
  toDriver: (value) => String(value),
});

/**
 * Every Pemesanan Makam kind (CONTEXT.md): Saat Duka and Terencana at a Lokasi
 * Mitra, and a further burial under an existing Hak Pakai. Only Saat Duka is
 * built (this ticket); the others arrive with theirs.
 */
export const pemesananKinds = ["saat_duka", "terencana", "tumpang"] as const;
export type PemesananKind = (typeof pemesananKinds)[number];

/**
 * Every status of a Pemesanan Makam. Saat Duka runs Diajukan → Dikonfirmasi →
 * Dimakamkan → Selesai, and may end Ditolak or Dibatalkan; Terencana and a
 * further burial have their own steps in their own tickets.
 */
export const pemesananStatuses = ["diajukan", "dikonfirmasi", "dimakamkan", "selesai", "ditolak", "dibatalkan"] as const;
export type PemesananStatus = (typeof pemesananStatuses)[number];

/**
 * The Pemegang Hak the Pemesan named (CONTEXT.md): the Pemesan themselves by
 * default, else another relative with their own name, phone number and email
 * when it is known. Never the Almarhum (refused on the way in).
 */
export interface PemegangHak {
  mode: "pemesan" | "lain";
  /** The holder's name: the Pemesan's when `mode` is "pemesan", as recorded at submission. */
  name: string;
  /** Canonical E.164 (+62…), a contact only, never verified. */
  phoneNumber: string | null;
  email: string | null;
}

/**
 * Owned by the Pemesanan module: one Pemesanan Makam, a booking of one grave
 * for one Almarhum. `lokasi_id` and `jenis_makam_id` name a Lokasi Mitra and
 * one of its Jenis Makam (no foreign key across modules, as elsewhere);
 * `jenis_makam_id` is null only for a TPU order, which has no plot to choose.
 *
 * `lokasi_name` and `jenis_makam_name` are what was ordered, copied at
 * submission: the family reads them on the order page even after the Lokasi
 * Mitra is renamed or stops being listed, the way a Tagihan keeps the header
 * values in force when it was issued.
 *
 * Nothing is billed here: the Tagihan is issued at the Lokasi's confirmation
 * (`tagihan_id`, null until then), so a Saat Duka order at submission carries
 * no money. `konfirmasi_due_at` is the deadline the Lokasi's Jam Operasional
 * gave at submission (2 service hours), kept on the order so the family is
 * told the same time it was promised; null only while a Jam Operasional is
 * belum diisi.
 *
 * `pemesan_account_id` and `email` are null for an order CS placed on a
 * family's behalf with no Akun to attach (a later ticket); every family
 * message goes to `email`, which the Kode Masuk at Kirim proved (ADR 0004).
 */
export const pemesananMakam = pgTable(
  "pemesanan_makam",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** `MKM-2026-000123`: given at submission and shown at every confirmation. */
    nomor: text("nomor").notNull(),
    kind: text("kind", { enum: pemesananKinds }).notNull(),
    status: text("status", { enum: pemesananStatuses }).notNull(),
    lokasiId: text("lokasi_id").notNull(),
    lokasiName: text("lokasi_name").notNull(),
    jenisMakamId: text("jenis_makam_id"),
    jenisMakamName: text("jenis_makam_name"),
    /** The Akun that placed the order; null for one CS placed with no Akun. */
    pemesanAccountId: text("pemesan_account_id"),
    /** The Pemesan's name as typed (their Akun keeps its own, possibly empty). */
    pemesanName: text("pemesan_name").notNull(),
    /** The Email Terverifikasi every family message goes to (ADR 0004). */
    email: text("email"),
    /** The phone number as typed, a contact only: never verified, never a login. */
    phoneNumber: text("phone_number"),
    almarhumName: text("almarhum_name").notNull(),
    tanggalWafat: date("tanggal_wafat", { mode: "string" }).notNull(),
    /** The burial the family plans, if it has one; the Lokasi agrees the day at confirmation. */
    rencanaPemakamanAt: at("rencana_pemakaman_at"),
    /** A placement wish (e.g. near the family's other graves), free text. */
    keinginanPenempatan: text("keinginan_penempatan"),
    pemegangHak: jsonb("pemegang_hak").$type<PemegangHak>().notNull(),
    konfirmasiDueAt: at("konfirmasi_due_at"),
    /**
     * When the worker's re-alert went out: once 1 h of the Lokasi's Jam
     * Operasional has passed with the order still Diajukan (spec,
     * Notifications). Set by the claim that fires it, so a tick that runs twice
     * alerts once.
     */
    realertPada: at("realert_pada"),
    tagihanId: text("tagihan_id"),
    /**
     * What the Lokasi's confirmation assigned (ticket 23): the Petak Makam it
     * gave the order and the Hak Pakai that created, with the burial the Lokasi
     * agreed with the family. The Tagihan's due date counts from `pemakaman_at`
     * (the family's `rencana_pemakaman_at` is only what it planned). All null
     * until the order is Dikonfirmasi.
     */
    petakId: text("petak_id"),
    petakNomor: text("petak_nomor"),
    hakPakaiId: text("hak_pakai_id"),
    pemakamanAt: at("pemakaman_at"),
    dikonfirmasiPada: at("dikonfirmasi_pada"),
    /** Why the Lokasi declined, or the family / CS cancelled; null while none. */
    alasan: text("alasan"),
    /**
     * The share of a Harga Khusus the Lokasi Mitra agreed to bear (spec,
     * Payouts: "Admin Platform may enter on the order the amount the Lokasi
     * Mitra agreed to bear, with a required note (default 0)"; ticket 30). It
     * lives on the order, not on a Tagihan, for the two reasons the spec gives:
     * a reissue (a Harga Khusus is one) would lose it, and Pencairan is
     * computed per order. Whole rupiah; **null means 0**, so the Operator bears
     * the whole reduction (from the Biaya Layanan Platform first, then its own
     * funds). Read by the Payouts module through `pembayaranOrder`.
     */
    partnerShare: rupiah("partner_share"),
    /** Why the Lokasi Mitra agreed to bear it. Required whenever a share is entered. */
    partnerShareNote: text("partner_share_note"),
    /** The Admin Platform who entered it, and when. */
    partnerShareOleh: text("partner_share_oleh"),
    partnerSharePada: at("partner_share_pada"),
    /**
     * "Dibayar langsung ke Lokasi Mitra" (spec, Billing: the Admin Lokasi
     * records it with proof): the family paid the Lokasi Mitra itself, so no
     * money ever reached the Operator. The order therefore owes no tariff
     * Pencairan and a platform-fee Potongan instead, which the Payouts module
     * (ticket 32) reads through `pembayaranOrder`. Null while nobody recorded
     * it. Only Admin Platform may reverse it, and that is ticket 31's refund
     * machinery: nothing else may be written here.
     */
    bayarLangsungPada: at("bayar_langsung_pada"),
    /** The Admin Lokasi of this Lokasi Mitra who recorded it. */
    bayarLangsungOleh: text("bayar_langsung_oleh"),
    /** The private FileStore key of the proof they uploaded with it. */
    bayarLangsungBukti: text("bayar_langsung_bukti"),
    diajukanAt: at("diajukan_at").notNull(),
  },
  (table) => [
    uniqueIndex("pemesanan_makam_nomor_idx").on(table.nomor),
    index("pemesanan_makam_pemesan_idx").on(table.pemesanAccountId),
    index("pemesanan_makam_lokasi_idx").on(table.lokasiId),
    // The open work of one Lokasi Mitra: what its Antrean Lokasi and its Tier 1 late rows read.
    index("pemesanan_makam_status_lokasi_idx").on(table.status, table.lokasiId),
    check("pemesanan_makam_partner_share_check", sql`${table.partnerShare} is null or ${table.partnerShare} between 0 and ${sql.raw(String(RUPIAH_MAX))}`),
  ],
);

/**
 * Owned by the Pemesanan module: one document on one order's checklist (spec,
 * Pemesanan, stories 29–30 and 120). The family adds a file at any time — before
 * the burial, after it, or never — and the Admin Lokasi ticks the item off when
 * they have it in hand. Nothing here ever blocks a confirmation or a burial: a
 * row with no file is a document still to bring, not a missing one.
 *
 * `nama` is the Lokasi Mitra's own checklist wording, copied at the moment the
 * row is created, so a later change to the Lokasi's checklist never rewrites an
 * order's.
 */
export const pemesananBerkas = pgTable(
  "pemesanan_berkas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pemesananId: uuid("pemesanan_id")
      .notNull()
      .references(() => pemesananMakam.id),
    /** The checklist item's wording, as the Lokasi Mitra writes it. */
    nama: text("nama").notNull(),
    /** The private FileStore key of the file the family added, or null while none. */
    fileKey: text("file_key"),
    diunggahPada: at("diunggah_pada"),
    diunggahOleh: text("diunggah_oleh"),
    dicentangPada: at("dicentang_pada"),
    dicentangOleh: text("dicentang_oleh"),
    dibuatPada: at("dibuat_pada").notNull(),
  },
  (table) => [
    // One row per checklist item per order: a family that uploads twice replaces its file.
    uniqueIndex("pemesanan_berkas_item_idx").on(table.pemesananId, table.nama),
  ],
);

/**
 * The statuses a Pemesanan Terencana runs through (spec, Pemesanan > Terencana):
 * Diajukan (the plots are held) → Dikonfirmasi (the payment hold runs, the
 * pay-first Tagihan is due when it ends) → Aktif (paid, one Hak Pakai per Petak
 * Makam or Kavling Keluarga), plus Ditolak and Dibatalkan. Every one of them is a
 * Pemesanan Makam status (CONTEXT.md), so they are written as such: Aktif is where a
 * Terencana order sits once it is paid and its Hak Pakai runs, where a Saat Duka order
 * is already Dimakamkan. This ticket only ever places an order Diajukan; the later
 * steps are ticket 37 (the confirmation and the payment hold) and ticket 38
 * (Pembatalan).
 */
export const pemesananTerencanaStatuses = ["diajukan", "dikonfirmasi", "aktif", "ditolak", "dibatalkan"] as const;
/**
 * A Terencana order is a Pemesanan Makam, so it runs the module's shared statuses,
 * plus Aktif: where it sits once it is paid and its Hak Pakai runs, which is where a
 * Saat Duka order is already Dimakamkan and so has no name of its own.
 */
export type PemesananTerencanaStatus = PemesananStatus | "aktif";

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

/** The Calon Penghuni a Terencana order prepares the plot for: the Pemesan themselves by default, else a name the Pemegang Hak may change later. */
export interface CalonPenghuniTerencana {
  mode: "saya" | "lain";
  /** Null for "saya": the living person it is prepared for is the Pemesan. */
  name: string | null;
}

/**
 * Owned by the Pemesanan module: one Pemesanan Terencana — the `terencana` kind of
 * `pemesananKinds` — reserving one or more Petak Makam (or one whole Kavling
 * Keluarga) for one Calon Penghuni. It has a table of its own because the
 * single-plot `pemesanan_makam` cannot carry several chosen plots, a Calon Penghuni
 * or the Syarat snapshot; the two are one Pemesanan Makam each, read through the same
 * public interface.
 *
 * `lokasi_id` and the unit columns name an Inventory Lokasi Mitra, Petak Makam and
 * Kavling Keluarga (no foreign key across modules, as elsewhere). `lokasi_name`, each
 * unit's `jenis_makam_name` and its number are copied at submission, so the order reads
 * the way it was placed even after the Lokasi Mitra is renamed or a Petak Makam
 * renumbered.
 *
 * Nothing is billed here: the Tagihan is issued when the Lokasi Mitra confirms
 * (`tagihan_id`, null until then), and `konfirmasi_due_at` the deadline its Jam
 * Operasional gave at submission is ticket 37's.
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
    pemegangHak: jsonb("pemegang_hak").$type<PemegangHak>().notNull(),
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
