import { date, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/**
 * Owned by the Perpanjangan module: one Perpanjangan of a Hak Pakai at a Lokasi
 * Mitra, from the moment its pay-first Tagihan is issued (spec, Perpanjangan).
 *
 * The row keeps what the family and the Bukti Perpanjangan need as it stood at
 * issue (Lokasi, Petak, holder), the way a Tagihan keeps its place name. Its
 * status is not stored: it is `lunas` once `dibayar_pada` is set, otherwise
 * `menunggu_pembayaran` while its Tagihan can still be paid and `dibatalkan`
 * once that Tagihan lapsed, so the lapse (Billing's own tick) is never copied
 * into a second place that could disagree with it.
 *
 * `end_date_lama` / `end_date_baru` are set when the payment extends the Hak
 * Pakai, from the end date on record at that moment (never from the payment date).
 * `hak_pakai_id`, `lokasi_id` and `tagihan_id` name other modules' rows and have
 * no foreign key: only the owner of a table references it.
 */
export const perpanjangan = pgTable(
  "perpanjangan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hakPakaiId: text("hak_pakai_id").notNull(),
    lokasiId: text("lokasi_id").notNull(),
    lokasiName: text("lokasi_name").notNull(),
    /** The Petak Makam (or the Kavling Keluarga and its Petak) as the family knows it. */
    petakNomor: text("petak_nomor").notNull(),
    pemegangHakName: text("pemegang_hak_name").notNull(),
    terms: integer("terms").notNull(),
    tagihanId: text("tagihan_id").notNull().unique(),
    nomorTagihan: text("nomor_tagihan").notNull(),
    /** The Akun that ordered it and the Email Terverifikasi its documents go to. */
    pemohonAccountId: text("pemohon_account_id").notNull(),
    email: text("email"),
    dibuatPada: at("dibuat_pada").notNull(),
    dibayarPada: at("dibayar_pada"),
    endDateLama: date("end_date_lama", { mode: "string" }),
    endDateBaru: date("end_date_baru", { mode: "string" }),
    buktiId: text("bukti_id"),
    /** The approved manual request (KTP, heir, claim) this Perpanjangan was ordered on, or null for the direct path (ticket 41). */
    permohonanId: text("permohonan_id"),
  },
  (table) => [index("perpanjangan_hak_pakai_idx").on(table.hakPakaiId, table.dibuatPada)],
);

/** The three document-reviewed paths into a Perpanjangan (spec, domain module 7). */
export const jalurManual = ["ktp", "ahli_waris", "klaim"] as const;
export type JalurManual = (typeof jalurManual)[number];

/** Diajukan -> (Perlu Perbaikan <-> Diajukan) -> Disetujui | Ditolak | Dibatalkan (by the requester before a decision). */
export const statusPermohonan = ["diajukan", "perlu_perbaikan", "disetujui", "ditolak", "dibatalkan"] as const;
export type StatusPermohonan = (typeof statusPermohonan)[number];

/** One document of a request, in the private FileStore: never its content, only where it lives. */
export interface BerkasPermohonan {
  kunci: string;
  fileKey: string;
  contentType: string;
  diunggahPada: string;
}

/**
 * Owned by the Perpanjangan module: one manual Perpanjangan request (spec, domain
 * module 7; ticket 41), from the moment the applicant files it. Its Antrean Lokasi
 * row ("Periksa dokumen Perpanjangan") is a projection of `status = diajukan` and
 * `tenggat_pada`; nothing is stored for the row itself.
 *
 * `email` is the Email Terverifikasi of the applicant's Akun: an approval records it
 * as the holder's recorded email, so the direct path (a code, or the session) works
 * for that holder afterwards. `berlaku_sampai` is set on approval, 30 days on.
 * `hak_pakai_id` and `lokasi_id` name other modules' rows and have no foreign key.
 */
export const perpanjanganPermohonan = pgTable(
  "perpanjangan_permohonan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hakPakaiId: text("hak_pakai_id").notNull(),
    lokasiId: text("lokasi_id").notNull(),
    lokasiName: text("lokasi_name").notNull(),
    petakNomor: text("petak_nomor").notNull(),
    jalur: text("jalur").$type<JalurManual>().notNull(),
    status: text("status").$type<StatusPermohonan>().notNull(),
    pemohonAccountId: text("pemohon_account_id").notNull(),
    email: text("email").notNull(),
    nama: text("nama").notNull(),
    nomorTelepon: text("nomor_telepon").notNull(),
    catatan: text("catatan"),
    berkas: jsonb("berkas").$type<BerkasPermohonan[]>().notNull(),
    /** The Admin Lokasi's latest reason: what to fix (Perlu Perbaikan) or why it was rejected (Ditolak). */
    alasan: text("alasan"),
    diajukanPada: at("diajukan_pada").notNull(),
    /** 2 working days on the Lokasi's Jam Operasional calendar from `diajukan_pada`; null while that calendar is not filled in. */
    tenggatPada: at("tenggat_pada"),
    keputusanPada: at("keputusan_pada"),
    keputusanOlehAccountId: text("keputusan_oleh_account_id"),
    berlakuSampai: at("berlaku_sampai"),
    dibuatPada: at("dibuat_pada").notNull(),
  },
  (table) => [
    index("perpanjangan_permohonan_hak_pakai_idx").on(table.hakPakaiId, table.dibuatPada),
    index("perpanjangan_permohonan_lokasi_idx").on(table.lokasiId, table.status),
    index("perpanjangan_permohonan_pemohon_idx").on(table.pemohonAccountId),
  ],
);

/**
 * Owned by the Perpanjangan module: the claim on one Hak Pakai end reminder (ticket 42), so a tick that
 * runs twice, or two workers at once, announce each reminder once. `tahap` names it: `h60`, `h30`, `h7`
 * before the end date, or `tenggang-<n>` for the n-th weekly reminder after it. Keyed by the end date too,
 * so a Perpanjangan that moves the end date starts a fresh schedule. `hak_pakai_id` names Inventory's row
 * and has no foreign key.
 */
export const perpanjanganPengingat = pgTable(
  "perpanjangan_pengingat",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hakPakaiId: text("hak_pakai_id").notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    tahap: text("tahap").notNull(),
    dicatatPada: timestamp("dicatat_pada", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [unique("perpanjangan_pengingat_unik").on(table.hakPakaiId, table.endDate, table.tahap)],
);
