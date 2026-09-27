import { date, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

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
    diajukanAt: at("diajukan_at").notNull(),
  },
  (table) => [
    uniqueIndex("pemesanan_makam_nomor_idx").on(table.nomor),
    index("pemesanan_makam_pemesan_idx").on(table.pemesanAccountId),
    index("pemesanan_makam_lokasi_idx").on(table.lokasiId),
    // The open work of one Lokasi Mitra: what its Antrean Lokasi and its Tier 1 late rows read.
    index("pemesanan_makam_status_lokasi_idx").on(table.status, table.lokasiId),
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
