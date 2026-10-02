import { sql } from "drizzle-orm";
import { boolean, check, customType, date, index, integer, jsonb, pgTable, primaryKey, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { RUPIAH_MAX, rupiahFromDatabase, type Rupiah } from "@/lib/rupiah";
import type { DeskripsiMakamTpu } from "./tpu-skema";

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
 * A Paket Layanan subscription's statuses (spec, Layanan > Recurring cycles): it
 * runs (`aktif`), two skipped cycles in a row pause it (`dijeda`), or it is stopped
 * (`dihentikan`). The cycles, their skips and the resume belong to ticket 54; this
 * closed list is here once so the later writes need no migration.
 */
export const paketStatuses = ["aktif", "dijeda", "dihentikan"] as const;
export type PaketStatus = (typeof paketStatuses)[number];

/**
 * Owned by the Layanan module: one Pemesan's subscription to a Paket Layanan for
 * one grave (spec, Layanan > Recurring cycles; ticket 54). Its items are
 * snapshotted in `pesanan_paket_item` at the order, so a later catalog edit cannot
 * change what a running subscription does; each cycle is priced fresh from the
 * place's tariffs, so a new tariff applies from the next cycle.
 *
 * `next_cycle_date` is the WIB date of the cycle still to be issued, or null once
 * a `sekali` Paket has had its one cycle: the cycle tick reads it, so a missed run
 * is not a missed cycle and running the tick twice issues nothing twice. The
 * subscription's own cycles are `pesanan_layanan` rows carrying `pesanan_paket_id`
 * and `siklus`, so one cycle's jobs, proof and refunds are the ones the one-off
 * order flow already has (tickets 50, 51).
 */
export const pesananPaket = pgTable(
  "pesanan_paket",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The MKM series every order kind shares. */
    nomor: text("nomor").notNull().unique(),
    lokasiId: uuid("lokasi_id").notNull(),
    petakId: uuid("petak_id").notNull(),
    hakPakaiId: uuid("hak_pakai_id").notNull(),
    paketId: uuid("paket_id")
      .notNull()
      .references(() => layananPaket.id),
    /** The Lokasi Mitra and the Petak as they were named at submission. */
    lokasiName: text("lokasi_name").notNull(),
    petakNomor: text("petak_nomor").notNull(),
    pemesanName: text("pemesan_name").notNull(),
    pemesanPhone: text("pemesan_phone").notNull(),
    pemesanEmail: text("pemesan_email").notNull(),
    pemesanAccountId: uuid("pemesan_account_id").notNull(),
    /** The frequency as it was at the order, which `next_cycle_date` advances by. */
    frekuensi: text("frekuensi", { enum: frekuensiValues }).notNull(),
    status: text("status", { enum: paketStatuses }).notNull().default("aktif"),
    /** The WIB date of the cycle still to issue, or null once a `sekali` Paket has had it. */
    nextCycleDate: date("next_cycle_date", { mode: "string" }),
    createdAt: at("created_at").notNull(),
  },
  (table) => [
    index("pesanan_paket_pemesan_idx").on(table.pemesanAccountId, table.createdAt),
    index("pesanan_paket_lokasi_idx").on(table.lokasiId),
  ],
);

/** One Paket Layanan subscription's items, as the order snapshotted them, in the order Admin Platform listed them. */
export const pesananPaketItem = pgTable(
  "pesanan_paket_item",
  {
    pesananPaketId: uuid("pesanan_paket_id")
      .notNull()
      .references(() => pesananPaket.id),
    posisi: integer("posisi").notNull(),
    layananId: uuid("layanan_id")
      .notNull()
      .references(() => layananLayanan.id),
    layananVariantId: uuid("layanan_variant_id")
      .notNull()
      .references(() => layananVarian.id),
  },
  (table) => [index("pesanan_paket_item_pesanan_idx").on(table.pesananPaketId, table.posisi)],
);

/**
 * The three Mitra Jasa statuses (spec, Layanan > Mitra Jasa). A Lokasi Mitra
 * has its own list, with "Belum Tayang" and "Terverifikasi"; a Mitra Jasa has
 * none of those, so there are exactly three (CONTEXT.md: Dihapus is avoided and
 * Ditangguhkan is reserved for a Lokasi Mitra or a Mitra Jasa alike).
 *
 * `aktif` is a Mitra Jasa taking work, `ditangguhkan` is one Admin Platform
 * suspends until reinstated, and `berhenti` is one whose partnership ended for
 * good. Only the last two take a reason.
 */
export const mitraJasaStatuses = ["aktif", "ditangguhkan", "berhenti"] as const;
export type MitraJasaStatus = (typeof mitraJasaStatuses)[number];

/**
 * Owned by the Layanan module: one Mitra Jasa's own record, which Admin Platform
 * onboards and which that person keeps up themselves (spec, Layanan > Mitra
 * Jasa > Profile).
 *
 * `email` is the address the Undangan Staf went to, and the key: the Mitra
 * Jasa is the Akun whose Email Terverifikasi is this address (ADR 0004), which
 * is how a profile created before that person ever logged in is found again.
 *
 * `nik` identifies the person, so it is unique as an email is: the same NIK
 * twice is the same Mitra Jasa entered twice, which is refused.
 *
 * There is **no NPWP column** (spec: "optional emergency contact (no NPWP)"):
 * the Operator pays a Mitra Jasa without one, and a field for it would only
 * invite someone to demand one.
 *
 * The bank account is where Pencairan go. `catatan_override_rekening` is the
 * override note the account name needs when it is not the name on the KTP
 * (`nama_lengkap`), which is the one rule `rekening` refuses to take without.
 */
export const layananMitraJasa = pgTable(
  "layanan_mitra_jasa",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    namaLengkap: text("nama_lengkap").notNull(),
    /** 16 digits. */
    nik: text("nik").notNull(),
    ktpFileKey: text("ktp_file_key"),
    ktpContentType: text("ktp_content_type"),
    fotoFileKey: text("foto_file_key"),
    fotoContentType: text("foto_content_type"),
    /** Home area: where the Mitra Jasa works from. */
    area: text("area").notNull(),
    /** The signed arrangement's scan and the date it was signed (either may still be missing). */
    perjanjianTandaTanganPada: text("perjanjian_tanda_tangan_pada"),
    perjanjianFileKey: text("perjanjian_file_key"),
    perjanjianContentType: text("perjanjian_content_type"),
    bankName: text("bank_name"),
    bankAccountNumber: text("bank_account_number"),
    bankAccountHolder: text("bank_account_holder"),
    /** Why the account name is not the KTP's; required when it is not. */
    catatanOverrideRekening: text("catatan_override_rekening"),
    kontakSiagaNama: text("kontak_siaga_nama"),
    kontakSiagaTelepon: text("kontak_siaga_telepon"),
    status: text("status", { enum: mitraJasaStatuses }).notNull(),
    statusAlasan: text("status_alasan"),
    statusDiubahPada: at("status_diubah_pada").notNull(),
    createdAt: at("created_at").notNull(),
    createdByAccountId: text("created_by_account_id").notNull(),
    updatedAt: at("updated_at"),
  },
  (table) => [
    uniqueIndex("layanan_mitra_jasa_email_idx").on(table.email),
    uniqueIndex("layanan_mitra_jasa_nik_idx").on(table.nik),
    check("layanan_mitra_jasa_nik_check", sql`${table.nik} ~ '^[0-9]{16}$'`),
    check(
      "layanan_mitra_jasa_status_alasan_check",
      sql`${table.status} = 'aktif' or length(coalesce(${table.statusAlasan}, '')) > 0`,
    ),
  ],
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
    /** The grave's Hak Pakai; null for a Layanan chosen with an empty plot (Terencana), whose Hak Pakai only exists once it is paid (ticket 53). */
    hakPakaiId: uuid("hak_pakai_id"),
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
    /** The Paket subscription whose cycle this order is (ticket 54); null for a one-off order. */
    pesananPaketId: uuid("pesanan_paket_id").references(() => pesananPaket.id),
    /** The WIB cycle date this order is a cycle of (ticket 54); null for a one-off order. */
    siklus: date("siklus", { mode: "string" }),
    createdAt: at("created_at").notNull(),
  },
  (table) => [
    index("pesanan_layanan_pemesan_idx").on(table.pemesanAccountId, table.createdAt),
    index("pesanan_layanan_lokasi_idx").on(table.lokasiId),
    uniqueIndex("pesanan_layanan_siklus_idx").on(table.pesananPaketId, table.siklus),
    check("pesanan_layanan_total_check", sql`${table.total} between 0 and ${rupiahMax}`),
  ],
);

/**
 * Which DKI TPUs one Mitra Jasa covers (spec: "coverage lists (DKI TPUs,
 * Layanan)"). `tpu_dki_id` names a TPU of the Lokasi module (no foreign key
 * across modules), and the assignment picker (ticket 56) filters on it.
 */
export const layananMitraJasaTpu = pgTable(
  "layanan_mitra_jasa_tpu",
  {
    mitraJasaId: uuid("mitra_jasa_id")
      .notNull()
      .references(() => layananMitraJasa.id),
    tpuDkiId: uuid("tpu_dki_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.mitraJasaId, table.tpuDkiId] }),
    index("layanan_mitra_jasa_tpu_tpu_idx").on(table.tpuDkiId),
  ],
);

/**
 * Which Layanan variants one Mitra Jasa covers. A variant and not a Layanan,
 * because the Mitra Jasa rate is per variant (spec, Tariffs), so that is the
 * grain a job and its picker are decided at.
 */
export const layananMitraJasaLayanan = pgTable(
  "layanan_mitra_jasa_layanan",
  {
    mitraJasaId: uuid("mitra_jasa_id")
      .notNull()
      .references(() => layananMitraJasa.id),
    layananVariantId: uuid("layanan_variant_id")
      .notNull()
      .references(() => layananVarian.id),
  },
  (table) => [
    primaryKey({ columns: [table.mitraJasaId, table.layananVariantId] }),
    index("layanan_mitra_jasa_layanan_varian_idx").on(table.layananVariantId),
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
 * One "Tidak tersedia" range a Mitra Jasa set for themselves (spec, story 177):
 * no work is assigned to them on those dates. `dari` and `sampai` are WIB
 * calendar dates, inclusive on both ends, because a person says "I am away
 * from the 3rd to the 7th". A range may not overlap another of the same
 * Mitra Jasa, and it survives a suspension or an ending: it is their own
 * calendar, not the Operator's judgement.
 */
export const layananMitraJasaTidakTersedia = pgTable(
  "layanan_mitra_jasa_tidak_tersedia",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mitraJasaId: uuid("mitra_jasa_id")
      .notNull()
      .references(() => layananMitraJasa.id),
    dari: text("dari").notNull(),
    sampai: text("sampai").notNull(),
    alasan: text("alasan"),
    dibuatPada: at("dibuat_pada").notNull(),
  },
  (table) => [
    index("layanan_mitra_jasa_tidak_tersedia_mitra_idx").on(table.mitraJasaId, table.dari),
    check("layanan_mitra_jasa_tidak_tersedia_rentang_check", sql`${table.dari} <= ${table.sampai}`),
  ],
);

/**
 * One Mitra Jasa's monthly scorecard review row (spec, Work Queues: the Tier 4
 * "monthly scorecard review" row; ticket 55). The tick writes the row on the
 * first of each WIB month with the 90-day numbers as they stand then, and
 * Admin Platform closes it by recording the review, so running the tick twice
 * changes nothing and the row is a projection of state, never a hand-made one.
 *
 * The numbers are kept as counted, so the review shows what the scorecard said
 * at the moment it was opened; `rata_penilaian` is null until the Mitra Jasa has
 * a Penilaian inside the window.
 */
export const layananMitraJasaTinjauan = pgTable(
  "layanan_mitra_jasa_tinjauan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mitraJasaId: uuid("mitra_jasa_id")
      .notNull()
      .references(() => layananMitraJasa.id),
    /** The WIB month being reviewed, "YYYY-MM". */
    bulan: text("bulan").notNull(),
    /** The 90-day scorecard the tick counted when it opened this row. */
    selesai: integer("selesai").notNull(),
    terlambat: integer("terlambat").notNull(),
    keluhanUpheld: integer("keluhan_upheld").notNull(),
    /** Declines and "Tidak direspons" together, as the spec's one scorecard line. */
    declines: integer("declines").notNull(),
    rataPenilaian: real("rata_penilaian"),
    dibukaPada: at("dibuka_pada").notNull(),
    ditinjauPada: at("ditinjau_pada"),
    ditinjauOlehAccountId: text("ditinjau_oleh_account_id"),
    catatan: text("catatan"),
  },
  (table) => [
    uniqueIndex("layanan_mitra_jasa_tinjauan_bulan_idx").on(table.mitraJasaId, table.bulan),
    index("layanan_mitra_jasa_tinjauan_bulan_idx_bulan").on(table.bulan),
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
    /**
     * When the proof was last **shown to the Pemesan**: the Admin Lokasi's upload at a
     * Lokasi Mitra (`selesaikanPekerjaan`, and again for a redo's new proof), or Admin
     * Platform's approval at a TPU (ticket 57). The 3×24 h Keluhan window is counted
     * from it. Null for a job that is not finished; a job finished before this column
     * existed reads its `selesai_at` instead.
     */
    buktiDitunjukkanAt: at("bukti_ditunjukkan_at"),
    /**
     * When the window-close tick saw the Keluhan window over with nothing left open: the
     * signal the message thread reads to close (ticket 52). Null while it is open.
     */
    jendelaDitutupAt: at("jendela_ditutup_at"),
    /** When Payouts confirmed the job's Pencairan item is due, so the tick stops offering it. */
    pencairanJatuhTempoAt: at("pencairan_jatuh_tempo_at"),
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
    /**
     * When the server last stored this kind, whichever capture that was. A redo after an
     * upheld Keluhan must show a proof taken **after** the decision, and the camera's own
     * `taken_at` is the phone's clock, which is not a witness for that: this is.
     */
    diperbaruiAt: at("diperbarui_at"),
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

/**
 * A Keluhan's statuses (spec, Layanan > Pekerjaan Layanan): filed and waiting for
 * Admin Platform (`terbuka`), then one of the three outcomes — `ditolak`,
 * `kerjakan_ulang` (the redo is owed) or `dana_kembali` (a refund of the item was
 * asked of Refunds) — and `selesai_ulang` once the redo's new proof has been shown.
 */
export const keluhanStatuses = ["terbuka", "ditolak", "kerjakan_ulang", "selesai_ulang", "dana_kembali"] as const;
export type KeluhanStatus = (typeof keluhanStatuses)[number];

/**
 * Owned by the Layanan module: one Keluhan on one Pekerjaan Layanan (CONTEXT.md:
 * "filed within 3×24 hours of its photo proof being shown to the Pemesan"). A job has
 * at most one, which is what makes the Pencairan trigger's "no Keluhan" a plain fact.
 *
 * `respon_pertama_due_at` is 4 daytime hours (06:00–18:00 WIB) after filing, kept beside
 * the filing so the Tier 1 row's deadline is a stored fact and not a recomputation.
 */
export const keluhanLayanan = pgTable(
  "keluhan_layanan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pekerjaanId: uuid("pekerjaan_id")
      .notNull()
      .references(() => pekerjaanLayanan.id),
    /** What the Pemesan wrote. */
    alasan: text("alasan").notNull(),
    diajukanAt: at("diajukan_at").notNull(),
    responPertamaDueAt: at("respon_pertama_due_at").notNull(),
    status: text("status", { enum: keluhanStatuses }).notNull().default("terbuka"),
    diputuskanAt: at("diputuskan_at"),
    diputuskanOleh: text("diputuskan_oleh"),
    /** The note Admin Platform gave with the decision (what to put right, or why it is rejected). */
    catatanKeputusan: text("catatan_keputusan"),
    /** The refund request in the Refunds module, when the outcome was a refund. */
    permintaanPengembalianId: text("permintaan_pengembalian_id"),
    /** When the redo's new proof was shown and the Kerjakan ulang row closed. */
    redoSelesaiAt: at("redo_selesai_at"),
  },
  (table) => [uniqueIndex("keluhan_layanan_pekerjaan_idx").on(table.pekerjaanId), index("keluhan_layanan_status_idx").on(table.status)],
);

/**
 * Owned by the Layanan module: the Pemesan's optional Penilaian of one finished
 * Pekerjaan Layanan, 1–5 stars with a comment, one per job. **Only Admin Platform
 * reads it** (CONTEXT.md): no read that reaches an Admin Lokasi or a Mitra Jasa
 * carries it.
 */
export const penilaianLayanan = pgTable(
  "penilaian_layanan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pekerjaanId: uuid("pekerjaan_id")
      .notNull()
      .references(() => pekerjaanLayanan.id),
    pemesanAccountId: uuid("pemesan_account_id").notNull(),
    bintang: integer("bintang").notNull(),
    komentar: text("komentar"),
    dibuatAt: at("dibuat_at").notNull(),
  },
  (table) => [
    uniqueIndex("penilaian_layanan_pekerjaan_idx").on(table.pekerjaanId),
    check("penilaian_layanan_bintang_check", sql`${table.bintang} between 1 and 5`),
  ],
);

/**
 * Where a TPU job came from (ticket 56): a standalone order at a DKI TPU (pay-first),
 * or a hari-H item of a Saat Duka TPU order (pay-after on that order's Tagihan).
 */
export const pekerjaanTpuSumberValues = ["pesanan_tpu", "saat_duka_tpu"] as const;
export type PekerjaanTpuSumber = (typeof pekerjaanTpuSumberValues)[number];

/**
 * A TPU job's statuses (spec, Layanan > Pekerjaan Layanan): Menunggu Pembayaran →
 * Dijadwalkan → Sedang Dikerjakan → Menunggu Verifikasi (TPU only) → Selesai, plus
 * Terlambat, Dibatalkan and Keluhan. This ticket writes the first two and Dibatalkan;
 * the proof steps are ticket 57's, so the closed list is here once and needs no migration then.
 */
export const pekerjaanTpuStatuses = [
  "menunggu_pembayaran",
  "dijadwalkan",
  "sedang_dikerjakan",
  "menunggu_verifikasi",
  "selesai",
  "terlambat",
  "dibatalkan",
  "keluhan",
] as const;
export type PekerjaanTpuStatus = (typeof pekerjaanTpuStatuses)[number];

/** How one assignment ended, or has not yet: `menunggu` and `diterima` are the two that hold the job. */
export const penugasanHasilValues = ["menunggu", "diterima", "ditolak", "tidak_direspons", "dilepas"] as const;
export type PenugasanHasil = (typeof penugasanHasilValues)[number];

/**
 * Owned by the Layanan module: one Pekerjaan Layanan at a DKI TPU, fulfilled by a
 * Mitra Jasa (spec, Layanan; ticket 56). It is not a `pekerjaan_layanan` row: that
 * table is a Lokasi Mitra's job at a Petak Makam with an Admin Lokasi who does it,
 * and a TPU has neither a Denah nor an Admin Lokasi. A TPU job carries the grave as
 * the family **described** it (`makam`), the price it was billed at, and the family's
 * own contact, which no Mitra Jasa read may ever return.
 *
 * `nomor` and `tagihan_id` name the order the job belongs to: a `pesanan_tpu` job's
 * order is a Nomor Pemesanan of its own, a `saat_duka_tpu` job's is the Pengurusan
 * order's (no foreign key crosses a module).
 *
 * Who holds the job is not a column: it is the one open row of
 * `pekerjaan_layanan_tpu_penugasan`, so a decline, a "Tidak direspons" and a release
 * stay on record for the scorecard instead of being overwritten by the next assignment.
 */
export const pekerjaanLayananTpu = pgTable(
  "pekerjaan_layanan_tpu",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sumber: text("sumber", { enum: pekerjaanTpuSumberValues }).notNull(),
    /** The Nomor Pemesanan of the order this job is one Layanan of. */
    nomor: text("nomor").notNull(),
    posisi: integer("posisi").notNull(),
    tagihanId: text("tagihan_id").notNull(),
    tpuId: text("tpu_id").notNull(),
    tpuName: text("tpu_name").notNull(),
    tpuAddress: text("tpu_address").notNull(),
    /** The grave as the family described it: block and number, whose it is, photos and pin. */
    makam: jsonb("makam").$type<DeskripsiMakamTpu>().notNull(),
    layananId: uuid("layanan_id")
      .notNull()
      .references(() => layananLayanan.id),
    layananVariantId: uuid("layanan_variant_id")
      .notNull()
      .references(() => layananVarian.id),
    /** "Layanan – Bunga Tabur (Reguler)", as the Tagihan words it. */
    label: text("label").notNull(),
    teks: text("teks"),
    amount: rupiah("amount").notNull(),
    /** The WIB date the work is due: the burial day for a hari-H item, the family's choice otherwise. */
    targetDate: date("target_date", { mode: "string" }).notNull(),
    status: text("status", { enum: pekerjaanTpuStatuses }).notNull(),
    /** The family. Never returned by a Mitra Jasa's read. Null for a Saat Duka order CS placed with no Akun to attach. */
    pemesanAccountId: text("pemesan_account_id"),
    pemesanName: text("pemesan_name").notNull(),
    pemesanEmail: text("pemesan_email"),
    pemesanPhone: text("pemesan_phone"),
    dijadwalkanAt: at("dijadwalkan_at"),
    dibatalkanAt: at("dibatalkan_at"),
    createdAt: at("created_at").notNull(),
    /** When the Mitra Jasa took the first proof (Sedang Dikerjakan). Ticket 57. */
    mulaiAt: at("mulai_at"),
    /** When the proof was sent for approval; the 24 h Tier 2 deadline counts from it. Null while not Menunggu Verifikasi. */
    buktiDikirimAt: at("bukti_dikirim_at"),
    /** Why Admin Platform sent the proof back; kept until the next approval. */
    buktiDitolakAlasan: text("bukti_ditolak_alasan"),
    /** When Admin Platform approved the proof: it is shown to the Pemesan from here and the 3×24 h Keluhan window opens. */
    buktiDitunjukkanAt: at("bukti_ditunjukkan_at"),
    selesaiAt: at("selesai_at"),
    /** Set by the window-close tick once the Keluhan window is over. */
    jendelaDitutupAt: at("jendela_ditutup_at"),
    /** The Payouts item this job's approval recorded (an id; no foreign key crosses a module). Null for an unpaid redo. */
    pencairanItemId: uuid("pencairan_item_id"),
    /** When Payouts was told the item is due. */
    pencairanJatuhTempoAt: at("pencairan_jatuh_tempo_at"),
    /** The job this one redoes after an upheld Keluhan (the original keeps its own row and its Pencairan). */
    kerjaUlangDariId: uuid("kerja_ulang_dari_id"),
  },
  (table) => [
    uniqueIndex("pekerjaan_layanan_tpu_posisi_idx").on(table.nomor, table.posisi),
    index("pekerjaan_layanan_tpu_status_idx").on(table.status, table.targetDate),
    index("pekerjaan_layanan_tpu_tagihan_idx").on(table.tagihanId),
    index("pekerjaan_layanan_tpu_pemesan_idx").on(table.pemesanAccountId),
  ],
);

/**
 * Owned by the Layanan module: one assignment of a TPU job to one Mitra Jasa, and
 * how it ended (ticket 56). At most one is open (`menunggu` or `diterima`) per job,
 * enforced by the partial unique index, so a job is never held by two people.
 *
 * The rows are the scorecard's raw material: a `ditolak` or `tidak_direspons` row is
 * one decline of that Mitra Jasa whoever the job goes to next, and `batas_jawab` is
 * the accept deadline the assignment was given (12 h, or H-1 18:00 when sooner).
 */
export const pekerjaanLayananTpuPenugasan = pgTable(
  "pekerjaan_layanan_tpu_penugasan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pekerjaanId: uuid("pekerjaan_id")
      .notNull()
      .references(() => pekerjaanLayananTpu.id),
    mitraJasaId: uuid("mitra_jasa_id")
      .notNull()
      .references(() => layananMitraJasa.id),
    ditugaskanAt: at("ditugaskan_at").notNull(),
    batasJawab: at("batas_jawab").notNull(),
    /** When the outcome was recorded: the answer, the deadline passing, or the release. */
    dijawabAt: at("dijawab_at"),
    hasil: text("hasil", { enum: penugasanHasilValues }).notNull(),
    alasan: text("alasan"),
    ditugaskanOlehAccountId: text("ditugaskan_oleh_account_id").notNull(),
  },
  (table) => [
    uniqueIndex("pekerjaan_layanan_tpu_penugasan_terbuka_idx")
      .on(table.pekerjaanId)
      .where(sql`${table.hasil} in ('menunggu', 'diterima')`),
    index("pekerjaan_layanan_tpu_penugasan_mitra_idx").on(table.mitraJasaId, table.ditugaskanAt),
    index("pekerjaan_layanan_tpu_penugasan_batas_idx").on(table.hasil, table.batasJawab),
  ],
);

/** Who wrote a message in a Pekerjaan Layanan's thread (ticket 52). */
export const pesanPengirimValues = ["pemesan", "admin_lokasi", "admin_platform", "mitra_jasa"] as const;
export type PesanPengirim = (typeof pesanPengirimValues)[number];

/** Which kind of job a thread belongs to: one at a Lokasi Mitra (`pekerjaan_layanan`) or one at a DKI TPU (`pekerjaan_layanan_tpu`). */
export const pesanSumberValues = ["lokasi", "tpu"] as const;
export type PesanSumber = (typeof pesanSumberValues)[number];

/**
 * Owned by the Layanan module: one message in a Pekerjaan Layanan's thread, between the
 * Pemesan and the fulfiller (spec, Layanan > Message thread). The text stays here; the
 * email the Pemesan gets carries a link and nothing of it. `pekerjaan_id` names a row of
 * either job table (see `sumber`), so it has no foreign key. Photos are rows of
 * `pekerjaan_layanan_pesan_foto`, kept in the private FileStore.
 */
export const pekerjaanLayananPesan = pgTable(
  "pekerjaan_layanan_pesan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Arrival order: two messages in one clock instant still read in the order they were written. */
    urutan: integer("urutan").generatedAlwaysAsIdentity(),
    sumber: text("sumber", { enum: pesanSumberValues }).notNull(),
    pekerjaanId: uuid("pekerjaan_id").notNull(),
    pengirim: text("pengirim", { enum: pesanPengirimValues }).notNull(),
    pengirimAccountId: text("pengirim_account_id").notNull(),
    teks: text("teks").notNull().default(""),
    createdAt: at("created_at").notNull(),
  },
  (table) => [index("pekerjaan_layanan_pesan_pekerjaan_idx").on(table.pekerjaanId, table.createdAt)],
);

/** One photo of a thread message: a private FileStore key, shown by a short-lived signed URL. */
export const pekerjaanLayananPesanFoto = pgTable(
  "pekerjaan_layanan_pesan_foto",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pesanId: uuid("pesan_id")
      .notNull()
      .references(() => pekerjaanLayananPesan.id),
    posisi: integer("posisi").notNull(),
    fileKey: text("file_key").notNull(),
    contentType: text("content_type").notNull(),
  },
  (table) => [uniqueIndex("pekerjaan_layanan_pesan_foto_idx").on(table.pesanId, table.posisi)],
);

/**
 * Owned by the Layanan module: one captured proof of a TPU job (ticket 57), kept in the
 * private FileStore like a Lokasi job's. `taken_at` is the in-app camera's own moment; the
 * required kinds are what the Layanan's `bukti` catalog setting asks for. Re-capturing a
 * kind replaces it, which is how a Mitra Jasa answers a rejection.
 */
export const pekerjaanLayananTpuBukti = pgTable(
  "pekerjaan_layanan_tpu_bukti",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pekerjaanId: uuid("pekerjaan_id")
      .notNull()
      .references(() => pekerjaanLayananTpu.id),
    kind: text("kind", { enum: buktiPekerjaanValues }).notNull(),
    fileKey: text("file_key").notNull(),
    contentType: text("content_type").notNull(),
    takenAt: at("taken_at").notNull(),
    diunggahOleh: text("diunggah_oleh").notNull(),
    createdAt: at("created_at").notNull(),
    diperbaruiAt: at("diperbarui_at").notNull(),
  },
  (table) => [uniqueIndex("pekerjaan_layanan_tpu_bukti_idx").on(table.pekerjaanId, table.kind)],
);

export const keluhanTpuStatuses = ["terbuka", "ditolak", "kerjakan_ulang", "dana_kembali"] as const;
export type KeluhanTpuStatus = (typeof keluhanTpuStatuses)[number];

/**
 * Owned by the Layanan module: the Pemesan's Keluhan on one finished TPU job (ticket 57). One per
 * job, which is what makes "the window closes with no Keluhan" a plain fact. Admin Platform
 * rejects it, has the job redone (`kerjaUlangTpu`) or has the Layanan refunded.
 */
export const keluhanLayananTpu = pgTable(
  "keluhan_layanan_tpu",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pekerjaanId: uuid("pekerjaan_id")
      .notNull()
      .references(() => pekerjaanLayananTpu.id),
    alasan: text("alasan").notNull(),
    diajukanAt: at("diajukan_at").notNull(),
    status: text("status", { enum: keluhanTpuStatuses }).notNull().default("terbuka"),
    diputuskanAt: at("diputuskan_at"),
    diputuskanOleh: text("diputuskan_oleh"),
    catatanKeputusan: text("catatan_keputusan"),
  },
  (table) => [uniqueIndex("keluhan_layanan_tpu_pekerjaan_idx").on(table.pekerjaanId), index("keluhan_layanan_tpu_status_idx").on(table.status)],
);
