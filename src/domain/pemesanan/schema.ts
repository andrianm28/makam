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
    /**
     * When the Admin Lokasi of that Lokasi Mitra confirmed the order (ticket 37). Null
     * while it is still `diajukan`. `dikonfirmasi_oleh` is the Akun that did it: the
     * Entri Audit of the Hak Pakai each unit gets on payment is recorded under it, so
     * the grant names the Admin Lokasi whose decision created the right and not a
     * payment that only made it effective.
     */
    dikonfirmasiPada: at("dikonfirmasi_pada"),
    dikonfirmasiOleh: text("dikonfirmasi_oleh"),
    /**
     * When the order became `aktif`, i.e. its Tagihan was paid and the Hak Pakai of
     * every chosen unit exists (ticket 37). Null until then.
     */
    aktifPada: at("aktif_pada"),
    /** Why the Lokasi Mitra declined, or why the order was cancelled ("batas pembayaran lewat", a withdrawal); null while none. */
    alasan: text("alasan"),
    diajukanAt: at("diajukan_at").notNull(),
  },
  (table) => [
    uniqueIndex("pemesanan_terencana_nomor_idx").on(table.nomor),
    index("pemesanan_terencana_pemesan_idx").on(table.pemesanAccountId),
    index("pemesanan_terencana_lokasi_idx").on(table.lokasiId),
    // The open work of one Lokasi Mitra: its Antrean Lokasi row and the Admin Platform Tier 3 late row read this.
    index("pemesanan_terencana_status_lokasi_idx").on(table.status, table.lokasiId),
    // The lapse tick and the paid tick each read the orders waiting on them, never a table of their own.
    index("pemesanan_terencana_tagihan_idx").on(table.tagihanId),
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
    /**
     * The Hak Pakai this unit's right lives on, once the order is paid (ticket 37). One
     * per unit, and a Kavling Keluarga's covers the whole Kavling rather than its member
     * Petak one by one. Null until then: nothing is granted at submission or confirmation.
     */
    hakPakaiId: uuid("hak_pakai_id"),
  },
  (table) => [
    index("pemesanan_terencana_unit_pemesanan_idx").on(table.pemesananId),
    index("pemesanan_terencana_unit_petak_idx").on(table.petakId),
    index("pemesanan_terencana_unit_kavling_idx").on(table.kavlingId),
  ],
);

/**
 * Owned by the Pemesanan module: the Lunas half of a Pemesanan Terencana's payment,
 * written by the billing payment effect **inside the transaction that settled the
 * Tagihan** (ticket 37) and read by the tick that turns the payment into the order's
 * Hak Pakai and its Bukti Pemesanan.
 *
 * It is a table of its own, and the effect takes no dependencies, for the same reason
 * `payouts.pencairan_pembayaran` does (see `./efek-terencana.ts`): Billing is composed
 * before the module that owns the order, so an effect that needed this module would be a
 * cycle. Writing the fact is all the effect does, and it is what makes "paid first,
 * confirmed later" and "confirmed first, paid later" the same question to the tick.
 *
 * `nomor_pemesanan` is the primary key, so a redelivered webhook, a retried effect or a
 * second settle of the same Tagihan leaves one row.
 */
export const pemesananTerencanaPembayaran = pgTable("pemesanan_terencana_pembayaran", {
  nomorPemesanan: text("nomor_pemesanan").primaryKey(),
  tagihanId: uuid("tagihan_id").notNull(),
  /** When the money arrived, which is the Bukti Pemesanan's date and the Masa Pembatalan's first day. */
  dibayarPada: at("dibayar_pada").notNull(),
});
