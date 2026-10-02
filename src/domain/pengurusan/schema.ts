import { date, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { ItemHariHTpu } from "@/domain/layanan";
import {
  jenisPenguburanValues,
  type DokumenPemakamanDanPengajuan,
  type Kelayakan,
  type KuburanTpu,
  type PemegangHak,
} from "./skema-pengurusan";

const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/**
 * Every Pengurusan order kind (spec, Pengurusan > order kinds; CONTEXT.md): a
 * Saat Duka at a TPU the Operator arranges the burial for, a Perpanjangan of
 * one IPTM, and a filing-only Pengurusan IPTM for a family that buried on its
 * own. Only Saat Duka TPU is placed here (ticket 44); the other two arrive with
 * their tickets.
 */
export const pengurusanTpuKinds = ["saat_duka_tpu", "perpanjangan_tpu", "pengurusan_iptm"] as const;
export type PengurusanTpuKind = (typeof pengurusanTpuKinds)[number];

/**
 * Every status a Pengurusan order can sit at, across the three kinds (spec,
 * Pengurusan > order kinds and statuses). The three kinds run different steps
 * through the same set: a Saat Duka TPU goes Diajukan → Dikonfirmasi →
 * Dimakamkan → Dokumen Lengkap → IPTM Diajukan → IPTM Terbit, a Perpanjangan
 * TPU goes Diajukan → (Perlu Perbaikan) → Menunggu Pembayaran → Diproses →
 * IPTM Diajukan → IPTM Terbit, and a filing-only Pengurusan IPTM starts at
 * Dimakamkan. This ticket writes Diajukan and Dikonfirmasi; the later steps are
 * tickets 46, 47 and 48.
 */
export const pengurusanTpuStatuses = [
  "diajukan",
  "dikonfirmasi",
  "dimakamkan",
  "dokumen_lengkap",
  "menunggu_pembayaran",
  "diproses",
  "perlu_perbaikan",
  "iptm_diajukan",
  "iptm_terbit",
  "ditolak",
  "dibatalkan",
] as const;
export type PengurusanTpuStatus = (typeof pengurusanTpuStatuses)[number];

/** The TPU's own office contact, as Admin Platform arranges the burial through it. */
export interface KontakTpu {
  /** The office's name as the staff member gives it, e.g. "Samsat TPU Kober". */
  name: string;
  /** A contact number, as typed: never verified, never a login. */
  phoneNumber: string;
}

/** A fixable PTSP rejection: what to correct, which documents were cleared for a new upload, and when. */
export interface PerbaikanPtsp {
  alasan: string;
  dokumen: string[];
  pada: string;
}

/** One filing document the Pemesan uploaded: the private FileStore key and when. */
export interface DokumenDiunggah {
  key: string;
  contentType: string;
  diunggahPada: string;
}

/** One price line as the confirmation shows it, kept on the order so the family reads the same figure later. */
export interface HargaBaris {
  kind: string;
  label: string;
  amount: number;
}

/**
 * Owned by the Pengurusan module: one Pengurusan order at a DKI TPU — the
 * Operator handling a Pemda permit on a family's behalf (spec, Pengurusan).
 *
 * `tpu_id` names a row of the Lokasi module's TPU list and no foreign key
 * crosses a module, as elsewhere; `tpu_name` and `tpu_address` are copied at
 * submission, so the family reads the place it applied to even after the TPU is
 * corrected on the list.
 *
 * `pemegang_hak` is the holder named for the IPTM (never the Almarhum), with
 * their phone number and, when it is known, their email: that address is what a
 * Tagihan / Bukti copy and the later reminders go to, and nothing else.
 *
 * `jenis_penguburan` is how the grave is made; `kuburan` describes the grave a
 * Tumpang is made in and `foto_iptm_key` is the FileStore key of the IPTM photo
 * that proves it — both null for a Baru, which the TPU itself lays out.
 *
 * `kelayakan` keeps the two answers the family gave, because they are what
 * decided the document set: a death outside Jakarta adds the Pasal 17(2)
 * documents. `dokumen_pemakaman` and `dokumen_pengajuan` are the two sets
 * snapshotted onto the order when it was placed, so a later change of the
 * module's own list cannot change what this family was told to bring.
 *
 * Nothing is billed at submission: the Tagihan is issued at the confirmation
 * (ticket 45), so `tagihan_id` is null until then. `konfirmasi_due_at` is the
 * instant the TPU window (06:00–18:00 WIB, ticket 11's calculator) gave at
 * submission: two service hours, counted again if Admin Platform has to offer
 * another TPU.
 *
 * From the confirmation on, the order carries what the family is told to
 * expect (spec, story 73): `pemakaman_at` the burial agreed with the TPU,
 * `kontak_tpu` the TPU's own office, `admin_platform_*` the staff member who
 * took the order and may be called, and `harga` the price lines the Tagihan
 * carries, so the confirmation a family reads later says the same figures the
 * Tagihan did. `catatan_konfirmasi` is the one line Admin Platform adds for this
 * family.
 *
 * An offer of another TPU is a row of its own and never an edit: the order keeps
 * the TPU the family applied to until they answer, and `tpu_ditawarkan_*` is
 * what waits for their answer.
 *
 * `pemesan_account_id` and `email` are null for an order CS placed on a family's
 * behalf with no Akun to attach (a later ticket); every family message goes to
 * `email`, which the Kode Masuk at Kirim proved (ADR 0004).
 */
export const pengurusanTpu = pgTable(
  "pengurusan_tpu",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** `MKM-2026-000123`: from Billing's one series, shown at the confirmation. */
    nomor: text("nomor").notNull(),
    kind: text("kind", { enum: pengurusanTpuKinds }).notNull(),
    status: text("status", { enum: pengurusanTpuStatuses }).notNull(),
    tpuId: text("tpu_id").notNull(),
    tpuName: text("tpu_name").notNull(),
    tpuAddress: text("tpu_address").notNull(),
    pemesanAccountId: text("pemesan_account_id"),
    /** The Pemesan's name as typed; their Akun keeps its own, possibly empty. */
    pemesanName: text("pemesan_name").notNull(),
    /** The Email Terverifikasi every family message goes to (ADR 0004). */
    email: text("email"),
    /** The phone number as typed, a contact only: never verified, never a login. */
    phoneNumber: text("phone_number"),
    almarhumName: text("almarhum_name").notNull(),
    tanggalWafat: date("tanggal_wafat", { mode: "string" }).notNull(),
    jenisPenguburan: text("jenis_penguburan", { enum: jenisPenguburanValues }).notNull(),
    kelayakan: jsonb("kelayakan").$type<Kelayakan>().notNull(),
    /** The grave a Tumpang is made in; null for a Baru. */
    kuburan: jsonb("kuburan").$type<KuburanTpu>(),
    /** The FileStore key of the IPTM photo of that grave; null for a Baru. */
    fotoIptmKey: text("foto_iptm_key"),
    pemegangHak: jsonb("pemegang_hak").$type<PemegangHak>().notNull(),
    /** The documents to bring to the burial, as this order was placed. */
    dokumenPemakaman: jsonb("dokumen_pemakaman").$type<DokumenPemakamanDanPengajuan["pemakaman"]>().notNull(),
    /** The documents to upload for the filing, as this order was placed. */
    dokumenPengajuan: jsonb("dokumen_pengajuan").$type<DokumenPemakamanDanPengajuan["pengajuan"]>().notNull(),
    /**
     * The hari-H Layanan the family added at submission (story 23): variant and text only,
     * because their target date is the burial day, agreed at the confirmation, which is where
     * they are priced onto the Tagihan and become Pekerjaan Layanan. Null when none.
     */
    layananHariH: jsonb("layanan_hari_h").$type<ItemHariHTpu[]>(),
    /** The instant the TPU window promised a confirmation by: two service hours. */
    konfirmasiDueAt: at("konfirmasi_due_at"),
    /** The Tagihan issued at the confirmation; null until then. */
    tagihanId: text("tagihan_id"),
    /** The Tagihan's own number, copied at issue so the order page names it without billing's read. */
    tagihanNomor: text("tagihan_nomor"),
    /** The burial Admin Platform agreed with the TPU; null until the confirmation. */
    pemakamanAt: at("pemakaman_at"),
    /** The TPU's own office contact, as recorded at the confirmation. */
    kontakTpu: jsonb("kontak_tpu").$type<KontakTpu>(),
    /** The Admin Platform who took the order: the person the family may call. */
    adminPlatformAccountId: text("admin_platform_account_id"),
    adminPlatformName: text("admin_platform_name"),
    adminPlatformPhoneNumber: text("admin_platform_phone_number"),
    /** The price lines the Tagihan carried, so the order page quotes the same figures later. */
    harga: jsonb("harga").$type<HargaBaris[]>(),
    /** The one line Admin Platform added for this family at the confirmation. */
    catatanKonfirmasi: text("catatan_konfirmasi"),
    /** The TPU offered instead, while the family has not answered. */
    tpuDitawarkanId: text("tpu_ditawarkan_id"),
    tpuDitawarkanName: text("tpu_ditawarkan_name"),
    tpuDitawarkanAddress: text("tpu_ditawarkan_address"),
    /** Why Admin Platform offered it, in the family's own words. */
    alasanTpuDitawarkan: text("alasan_tpu_ditawarkan"),
    tpuDitawarkanPada: at("tpu_ditawarkan_pada"),
    /** Why the order was cancelled, or a filing rejected; null while none. */
    alasan: text("alasan"),
    diajukanAt: at("diajukan_at").notNull(),
    dikonfirmasiPada: at("dikonfirmasi_pada"),
    /**
     * The filing (ticket 46). `dimakamkan_pada` is the instant Admin Platform recorded the burial
     * (it starts the pay-after clock and the 7-day filing window, `dokumen_due_at`); `dokumen_diunggah`
     * holds the filing documents the Pemesan has uploaded, by the name the checklist gives them;
     * the three later timestamps are the steps Dokumen Lengkap, IPTM Diajukan and IPTM Terbit.
     */
    dimakamkanPada: at("dimakamkan_pada"),
    dokumenDueAt: at("dokumen_due_at"),
    dokumenDiunggah: jsonb("dokumen_diunggah").$type<Record<string, DokumenDiunggah>>(),
    dokumenLengkapPada: at("dokumen_lengkap_pada"),
    iptmDiajukanPada: at("iptm_diajukan_pada"),
    iptmTerbitPada: at("iptm_terbit_pada"),
    /** The IPTM scan's FileStore key and its expiry, as uploaded at IPTM Terbit. */
    iptmScanKey: text("iptm_scan_key"),
    iptmBerlakuSampai: date("iptm_berlaku_sampai", { mode: "string" }),
    /** The Makam TPU this order created or updated at IPTM Terbit. */
    makamTpuId: text("makam_tpu_id"),
    dibatalkanPada: at("dibatalkan_pada"),
    /**
     * The filing-only Pengurusan IPTM (ticket 47). `berkas_lengkap_diunggah_pada` is when the last filing
     * document came in (it opens the 1-working-day document check); `lunas_pada` is when the pay-first Tagihan
     * was seen paid (it opens the 3-working-day filing); `surat_pengantar_tugas_id` is the Ambil surat pengantar
     * Tugas Lapangan made once it was Lunas. `perbaikan` is the fixable PTSP rejection the Pemesan is asked
     * to correct, and `ditolak_pada` the moment a final one closed the order (its reason is `alasan`).
     */
    berkasLengkapDiunggahPada: at("berkas_lengkap_diunggah_pada"),
    lunasPada: at("lunas_pada"),
    suratPengantarTugasId: text("surat_pengantar_tugas_id"),
    perbaikan: jsonb("perbaikan").$type<PerbaikanPtsp>(),
    ditolakPada: at("ditolak_pada"),
  },
  (table) => [
    uniqueIndex("pengurusan_tpu_nomor_idx").on(table.nomor),
    index("pengurusan_tpu_pemesan_idx").on(table.pemesanAccountId),
    index("pengurusan_tpu_tpu_idx").on(table.tpuId),
    // The Tier 1 "Konfirmasi TPU Saat Duka" row reads the orders still waiting
    // for a confirmation, so the one column it filters on is indexed.
    index("pengurusan_tpu_status_idx").on(table.status),
  ],
);

/** One IPTM of a Makam TPU, current or past: its scan, its expiry and the order that brought it. */
export interface RiwayatIptm {
  scanKey: string;
  berlakuSampai: string;
  /** ISO instant of IPTM Terbit. */
  diterbitkanPada: string;
  nomorPengurusan: string;
}

/**
 * Owned by the Pengurusan module: the TPU counterpart of a Hak Pakai (spec, Pengurusan > Makam TPU;
 * CONTEXT.md). One row per grave of a TPU, found by the TPU and the grave's blok/nomor (compared
 * without case or surrounding space), so a Tumpang order updates the record that is there instead of
 * creating a second one. `almarhum` lists every Almarhum buried in it; `pemegang_hak` is the holder
 * with their phone number and, when known, email; `pemegang_account_id` is the Akun whose Makam tab
 * shows it. `iptm_*` is the current permit and `riwayat_iptm` every one it has had, newest last.
 */
export const makamTpu = pgTable(
  "makam_tpu",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tpuId: text("tpu_id").notNull(),
    tpuName: text("tpu_name").notNull(),
    blokNomor: text("blok_nomor").notNull(),
    /** `blok_nomor` trimmed and lower-cased: what the one-record-per-grave rule is held on. */
    blokNomorKunci: text("blok_nomor_kunci").notNull(),
    almarhum: jsonb("almarhum").$type<{ name: string; tanggalWafat: string }[]>().notNull(),
    pemegangHak: jsonb("pemegang_hak").$type<PemegangHak>().notNull(),
    pemegangAccountId: text("pemegang_account_id"),
    iptmScanKey: text("iptm_scan_key").notNull(),
    iptmBerlakuSampai: date("iptm_berlaku_sampai", { mode: "string" }).notNull(),
    riwayatIptm: jsonb("riwayat_iptm").$type<RiwayatIptm[]>().notNull(),
    createdAt: at("created_at").notNull(),
    updatedAt: at("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("makam_tpu_tpu_blok_idx").on(table.tpuId, table.blokNomorKunci),
    index("makam_tpu_pemegang_idx").on(table.pemegangAccountId),
  ],
);
