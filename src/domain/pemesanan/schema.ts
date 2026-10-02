import { sql } from "drizzle-orm";
import { bigint, boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
    /**
     * The hari-H Layanan the family added at submission (story 23, ticket 53): variant and text only. Their date is the burial day
     * and their price the day the Tagihan is issued, so the confirmation prices them, puts them on the Tagihan and schedules their jobs.
     * Null when none.
     */
    layananHariH: jsonb("layanan_hari_h").$type<{ layananVariantId: string; teks: string | null }[]>(),
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
    /**
     * When the order became Ditolak or Dibatalkan (ticket 24), and the fixed
     * reason a Tolak carries (the key, never free text: the list is closed, see
     * `./alasan-tolak.ts`). A cancellation's own free-text reason is `alasan`.
     */
    ditolakPada: at("ditolak_pada"),
    alasanTolak: text("alasan_tolak"),
    dibatalkanPada: at("dibatalkan_pada"),
    /**
     * The alternative the Admin Lokasi has offered and the Pemesan has not yet
     * answered (ticket 24): another Jenis Makam, another burial day, or both
     * (spec, story 31). All three null while there is no offer on the table;
     * `konfirmasi_due_at` is then recomputed from the moment it is accepted,
     * never carried over from the day that was offered.
     */
    alternatifJenisMakamId: text("alternatif_jenis_makam_id"),
    alternatifPemakamanAt: at("alternatif_pemakaman_at"),
    alternatifDitawarkanPada: at("alternatif_ditawarkan_pada"),
    /**
     * When the Admin Lokasi recorded the burial, and the day it happened (a
     * whole date, which is what a burial is). The pay-after Tagihan's overdue
     * clock counts from this date, never from `pemakaman_at`, the day the two
     * agreed: a burial can happen days later than the plan, and the family's
     * three days run from when the ground was actually dug (ticket 25). Both
     * null while the order is not yet Dimakamkan.
     */
    dimakamkanPada: at("dimakamkan_pada"),
    pemakamanTanggal: date("pemakaman_tanggal", { mode: "string" }),
    /** Which layer of the plot the Almarhum was laid in, recorded with the burial (1 by default). */
    pemakamanLayer: integer("pemakaman_layer"),
    /**
     * When the worker's "Catat Pemakaman" prompt was raised: once the day after
     * the agreed burial has come with the order still Dikonfirmasi. Set by the
     * claim that raises it, so a tick that runs twice (or two workers at once)
     * raises it once; the Antrean Lokasi row reads it and closes when the burial
     * is recorded (ticket 25).
     */
    catatPemakamanDitagihPada: at("catat_pemakaman_ditagih_pada"),
    /**
     * The Bukti Pemesanan issued when this order's Tagihan became Lunas, and the
     * instant it did. Selesai is exactly this: a Lunas Tagihan plus the Bukti
     * (spec, Pemesanan > Saat Duka: "Selesai = Tagihan Lunas + Bukti Pemesanan
     * issued"), both null until the payment settles. The document itself is
     * Billing's, read back through its own public read.
     */
    buktiPemesananId: text("bukti_pemesanan_id"),
    selesaiPada: at("selesai_pada"),
    /** Why the Lokasi declined, or the family cancelled, or the Admin Lokasi recorded for them; null while none. */
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
    /**
     * The end of the Lokasi Mitra's next working day after submission (spec,
     * Pemesanan > Terencana: "Confirmation is due by the end of the Lokasi's next
     * working day, with no automatic cancel"), set at submission; null only while a
     * Jam Operasional is belum diisi. The Konfirmasi Terencana row is due then, and
     * the Tier 3 "Konfirmasi Terencana terlambat" row appears after it — neither
     * cancels or changes the order (ticket 37).
     */
    konfirmasiDueAt: at("konfirmasi_due_at"),
    /** The Tagihan issued when the Lokasi Mitra confirmed; null until then. Nothing is billed at submission. */
    tagihanId: text("tagihan_id"),
    /** The Layanan the family added for the empty plot (ticket 53): checked at submission, priced and written when the Lokasi confirms. Null when none. */
    layanan: jsonb("layanan").$type<{ layananVariantId: string; targetDate: string; teks: string | null }[]>(),
    /** Why the Lokasi Mitra declined, or why the order was cancelled; null while none. */
    alasan: text("alasan"),
    /**
     * The payment hold (ticket 37): when the Lokasi Mitra confirmed, and when the hold
     * on the plots runs out — the instant the pay-first Tagihan is due. Both null
     * until the confirmation; the lapse tick releases the plots once `tahan_sampai`
     * has passed with the Tagihan unpaid.
     */
    dikonfirmasiPada: at("dikonfirmasi_pada"),
    tahanSampai: at("tahan_sampai"),
    /** When the Lokasi Mitra declined, and the reason off the closed list (`./alasan-tolak.ts`); null while not Ditolak. */
    ditolakPada: at("ditolak_pada"),
    alasanTolak: text("alasan_tolak"),
    /** When the order became Dibatalkan (withdrawn by the Pemesan, or its payment hold lapsed). */
    dibatalkanPada: at("dibatalkan_pada"),
    /**
     * When the payment settled and the order became Aktif, the end of its Masa
     * Pembatalan (counted from that payment, on the Syarat snapshot, never the
     * Lokasi Mitra's current policy), and the Bukti Pemesanan it earned.
     */
    aktifPada: at("aktif_pada"),
    masaPembatalanBerakhirPada: at("masa_pembatalan_berakhir_pada"),
    buktiPemesananId: text("bukti_pemesanan_id"),
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
    /**
     * The term this unit was sold with, read from the quote the Lokasi Mitra's
     * confirmation priced it at (null = Selamanya); only meaningful once the order is
     * Dikonfirmasi. The Hak Pakai its payment grants carries the same term.
     */
    tenureYears: integer("tenure_years"),
    /** The Hak Pakai this unit's payment granted; null until the order is Aktif. */
    hakPakaiId: uuid("hak_pakai_id"),
    urutan: text("urutan").notNull(),
  },
  (table) => [
    index("pemesanan_terencana_unit_pemesanan_idx").on(table.pemesananId),
    index("pemesanan_terencana_unit_petak_idx").on(table.petakId),
    index("pemesanan_terencana_unit_kavling_idx").on(table.kavlingId),
  ],
);

/**
 * The statuses of a Pembatalan request from a Pemegang Hak (spec, Pemesanan > Requests
 * from the Pemegang Hak): Diajukan → (Perlu Perbaikan ↺ Diajukan) → Disetujui | Ditolak |
 * Dibatalkan (by the requester before a decision). The Antrean Lokasi row exists only
 * while it is Diajukan.
 */
export const permintaanPembatalanStatuses = ["diajukan", "perlu_perbaikan", "disetujui", "ditolak", "dibatalkan"] as const;
export type PermintaanPembatalanStatus = (typeof permintaanPembatalanStatuses)[number];

/** One refunded amount of a Pembatalan, as Refunds' `ajukanBaris` takes it: what the Bukti Pengembalian Dana repeats and what nets from the Lokasi Mitra. */
export interface BarisRefundPembatalan {
  label: string;
  amount: number;
  lokasiId: string | null;
}

/**
 * Owned by the Pemesanan module: one Pembatalan request of one Hak Pakai of a paid Pemesanan Terencana,
 * asked by that Hak Pakai's Pemegang Hak (ticket 38). The other Hak Pakai on the same order carry on:
 * the refund is that Hak Pakai's own line of the order's Tagihan.
 *
 * The refund is computed once, when the request is first made, from the **Syarat snapshot on the
 * order** (never the Lokasi Mitra's current policy), and kept here: `dalam_masa_pembatalan` says
 * which side of the Masa Pembatalan the request was made on, `persen_refund` the share of the
 * tariff, `lines` and `jumlah_refund` the amounts. The Biaya Layanan Platform is never in them. A
 * request the Admin Lokasi sends back for a fix and the Pemegang Hak files again keeps the same
 * figures: the family must not lose the full refund because a Lokasi took days to answer.
 *
 * At most one request is open (Diajukan or Perlu Perbaikan) per Hak Pakai, the partial unique index
 * below. `pemohon_email` is where the family's answers go: the Email Terverifikasi of the Akun that
 * asked, who may be somebody other than the Pemesan who paid.
 */
export const permintaanPembatalanTerencana = pgTable(
  "permintaan_pembatalan_terencana",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pemesananId: uuid("pemesanan_id")
      .notNull()
      .references(() => pemesananTerencana.id),
    nomorPemesanan: text("nomor_pemesanan").notNull(),
    /** The one Hak Pakai this request cancels, and the number its plot is known by (copied, for the rows and emails that name it). */
    hakPakaiId: uuid("hak_pakai_id").notNull(),
    unitNomor: text("unit_nomor").notNull(),
    lokasiId: uuid("lokasi_id").notNull(),
    status: text("status", { enum: permintaanPembatalanStatuses }).notNull(),
    pemohonAccountId: text("pemohon_account_id").notNull(),
    pemohonEmail: text("pemohon_email").notNull(),
    /** Why the Pemegang Hak cancels, in their own words; optional. */
    catatanPemohon: text("catatan_pemohon"),
    dalamMasaPembatalan: boolean("dalam_masa_pembatalan").notNull(),
    persenRefund: integer("persen_refund").notNull(),
    jumlahRefund: bigint("jumlah_refund", { mode: "number" }).notNull(),
    lines: jsonb("lines").$type<BarisRefundPembatalan[]>().notNull(),
    /** How many times the Admin Lokasi sent it back for a fix: what makes each "perlu perbaikan" message its own. */
    putaran: integer("putaran").notNull(),
    diajukanPada: at("diajukan_pada").notNull(),
    /** 2 Hari Kerja on the Lokasi's own calendar from the latest filing; null while its Jam Operasional is belum diisi. */
    tenggatPada: at("tenggat_pada"),
    diputuskanPada: at("diputuskan_pada"),
    diputuskanOleh: text("diputuskan_oleh"),
    /** The Admin Lokasi's reason to decline, or what it asks to be fixed. */
    alasanKeputusan: text("alasan_keputusan"),
    dibatalkanPada: at("dibatalkan_pada"),
    /** The refund request this approval raised in Refunds; null while none (undecided, declined, or a refund of nothing). */
    permintaanPengembalianId: uuid("permintaan_pengembalian_id"),
    /** Admin Platform's "Pembatalan refund approval" deadline: 2 Hari Kerja on its calendar from the Lokasi's approval. */
    persetujuanRefundTenggatPada: at("persetujuan_refund_tenggat_pada"),
  },
  (table) => [
    index("permintaan_pembatalan_terencana_pemesanan_idx").on(table.pemesananId),
    index("permintaan_pembatalan_terencana_lokasi_idx").on(table.lokasiId, table.status),
    // One open request per Hak Pakai: a second filing while one is open is refused, never a second refund.
    uniqueIndex("permintaan_pembatalan_terencana_terbuka_idx")
      .on(table.hakPakaiId)
      .where(sql`${table.status} in ('diajukan', 'perlu_perbaikan')`),
  ],
);

/** The two other requests a Pemegang Hak may make about a Hak Pakai (spec, Pemesanan > Requests from the Pemegang Hak; ticket 39). */
export const permintaanHakPakaiJenis = ["pengembalian", "ganti_pemegang_hak"] as const;
export type PermintaanHakPakaiJenis = (typeof permintaanHakPakaiJenis)[number];

/** The same status machine a Pembatalan request runs on (spec: Diajukan → (Perlu Perbaikan ↺ Diajukan) → Disetujui | Ditolak | Dibatalkan). */
export const permintaanHakPakaiStatuses = ["diajukan", "perlu_perbaikan", "disetujui", "ditolak", "dibatalkan"] as const;
export type PermintaanHakPakaiStatus = (typeof permintaanHakPakaiStatuses)[number];

/** Why a Hak Pakai changes hands: a sale (only where the Lokasi Mitra allows it) or inheritance (always allowed). */
export const permintaanGantiSebab = ["jual", "waris"] as const;
export type PermintaanGantiSebab = (typeof permintaanGantiSebab)[number];

/**
 * Owned by the Pemesanan module: one Pengembalian Hak Pakai or Ganti Pemegang Hak request of one
 * Hak Pakai, asked by that Hak Pakai's Pemegang Hak (spec, Pemesanan > Requests from the Pemegang
 * Hak; ticket 39). Both run the same status machine as a Pembatalan and both have an Antrean Lokasi
 * row while Diajukan, due 2 Hari Kerja on the Lokasi's own calendar.
 *
 * A Pengembalian carries no money: compensation is agreed directly with the Lokasi. A Ganti names
 * the new holder and why (`jual` / `waris`), and the Lokasi's own fee for it is collected offline:
 * this request only ever notes it (`biaya_ganti_offline`), never bills it.
 */
export const pemesananPermintaanHakPakai = pgTable(
  "pemesanan_permintaan_hak_pakai",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jenis: text("jenis", { enum: permintaanHakPakaiJenis }).notNull(),
    status: text("status", { enum: permintaanHakPakaiStatuses }).notNull(),
    lokasiId: text("lokasi_id").notNull(),
    hakPakaiId: uuid("hak_pakai_id").notNull(),
    /** The Nomor Makam / Nomor Kavling the plot is known by, copied for the rows and messages that name it. */
    unitNomor: text("unit_nomor").notNull(),
    pemohonAccountId: text("pemohon_account_id").notNull(),
    pemohonEmail: text("pemohon_email").notNull(),
    catatanPemohon: text("catatan_pemohon"),
    /** Ganti Pemegang Hak only: the new holder and why the right changes hands. */
    pemegangBaruName: text("pemegang_baru_name"),
    pemegangBaruPhone: text("pemegang_baru_phone"),
    pemegangBaruEmail: text("pemegang_baru_email"),
    sebab: text("sebab", { enum: permintaanGantiSebab }),
    /** Optional documents the family attached; the keys in the private FileStore. */
    dokumen: jsonb("dokumen").$type<string[]>().notNull(),
    /** Rupiah the Lokasi collects offline for a Ganti Pemegang Hak, noted when the Lokasi approves; never a Tagihan. */
    biayaGantiOffline: integer("biaya_ganti_offline"),
    putaran: integer("putaran").notNull(),
    diajukanPada: at("diajukan_pada").notNull(),
    /** 2 Hari Kerja on the Lokasi's own calendar from the latest filing; null while its Jam Operasional is belum diisi. */
    tenggatPada: at("tenggat_pada"),
    diputuskanPada: at("diputuskan_pada"),
    diputuskanOleh: text("diputuskan_oleh"),
    /** The Admin Lokasi's reason to decline, or what it asks to be fixed. */
    alasanKeputusan: text("alasan_keputusan"),
    dibatalkanPada: at("dibatalkan_pada"),
  },
  (table) => [
    index("pemesanan_permintaan_hak_pakai_lokasi_idx").on(table.lokasiId, table.status),
    index("pemesanan_permintaan_hak_pakai_hak_pakai_idx").on(table.hakPakaiId),
    // One open request of each kind per Hak Pakai: a second filing while one is open is refused.
    uniqueIndex("pemesanan_permintaan_hak_pakai_terbuka_idx")
      .on(table.hakPakaiId, table.jenis)
      .where(sql`${table.status} in ('diajukan', 'perlu_perbaikan')`),
  ],
);
