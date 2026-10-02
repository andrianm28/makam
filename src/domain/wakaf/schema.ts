import { doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uuid, date } from "drizzle-orm/pg-core";

const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/** Why a Pengajuan Wakaf exists: sosial (a public cemetery) or keluarga (a family one). */
export const tujuanWakaf = ["sosial", "keluarga"] as const;
export type TujuanWakaf = (typeof tujuanWakaf)[number];

/**
 * Diajukan -> Ditinjau -> Survei Dijadwalkan -> Menunggu Ikrar -> Proses Sertipikat -> Selesai,
 * plus Ditolak, Dirujuk (outside Jabodetabek, or by Admin Platform) and Dibatalkan (by the Wakif
 * until Menunggu Ikrar). Every move is by hand (spec, Wakaf), except Dirujuk at submission.
 */
export const statusWakaf = [
  "diajukan",
  "ditinjau",
  "survei_dijadwalkan",
  "menunggu_ikrar",
  "proses_sertipikat",
  "selesai",
  "ditolak",
  "dirujuk",
  "dibatalkan",
] as const;
export type StatusWakaf = (typeof statusWakaf)[number];

export const jenisNazhir = ["perorangan", "organisasi", "badan_hukum"] as const;
export type JenisNazhir = (typeof jenisNazhir)[number];

/**
 * Owned by the Wakaf module: the list of Nazhir Admin Platform matches a Wakif to (spec, Wakaf:
 * "name, type, kab/kota, contact, BWI number"). Entered in the dashboard, never seeded. A Nazhir
 * has no login. A Nazhir removed from the list stays on the Pengajuan that already names it
 * (the Pengajuan keeps the name as it stood).
 */
export const wakafNazhir = pgTable("wakaf_nazhir", {
  id: uuid("id").primaryKey().defaultRandom(),
  nama: text("nama").notNull(),
  jenis: text("jenis", { enum: jenisNazhir }).notNull(),
  kabKota: text("kab_kota").notNull(),
  kontak: text("kontak").notNull(),
  nomorBwi: text("nomor_bwi").notNull(),
  dibuatPada: at("dibuat_pada").notNull(),
  diubahPada: at("diubah_pada").notNull(),
});

/** One document on a Pengajuan, in the private FileStore: only where it lives, never its content. */
export interface BerkasWakaf {
  id: string;
  /** What it is: a proof of ownership, an ID, "lainnya", or the final "hasil" (AIW / certificate scan). */
  kunci: string;
  fileKey: string;
  contentType: string;
  oleh: "wakif" | "staf";
  diunggahPada: string;
}

/**
 * Owned by the Wakaf module: one Pengajuan Wakaf. The Wakif's email is the Email Terverifikasi of
 * the Akun that filed it (ADR 0004); the phone number is a contact only. `nazhirId` names a list
 * entry and `nazhirNama` is always the name as typed or as matched, so a removed Nazhir changes
 * nothing already filed. `tugasSurveiId` is the Survei Wakaf Tugas Lapangan (Field Work's own row);
 * its report is never read by anything that answers a Wakif.
 */
export const wakafPengajuan = pgTable(
  "wakaf_pengajuan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nomor: text("nomor").notNull().unique(),
    wakifAccountId: text("wakif_account_id").notNull(),
    wakifEmail: text("wakif_email").notNull(),
    tujuan: text("tujuan", { enum: tujuanWakaf }).notNull(),
    namaKeluarga: text("nama_keluarga"),
    wakifNama: text("wakif_nama").notNull(),
    wakifTelepon: text("wakif_telepon").notNull(),
    hubunganDenganTanah: text("hubungan_dengan_tanah").notNull(),
    kabKota: text("kab_kota").notNull(),
    alamat: text("alamat").notNull(),
    pinLat: doublePrecision("pin_lat"),
    pinLng: doublePrecision("pin_lng"),
    luasM2: integer("luas_m2").notNull(),
    jenisBukti: text("jenis_bukti").notNull(),
    nazhirId: text("nazhir_id"),
    nazhirNama: text("nazhir_nama"),
    status: text("status", { enum: statusWakaf }).notNull(),
    /** Set for Dirujuk, Ditolak: why. For Dirujuk outside Jabodetabek it is the pointer to the local KUA/BWI. */
    alasan: text("alasan"),
    /** Survei Dijadwalkan: the survey's date. Menunggu Ikrar: the KUA's date. */
    tanggalSurvei: date("tanggal_survei", { mode: "string" }),
    tanggalIkrar: date("tanggal_ikrar", { mode: "string" }),
    tugasSurveiId: text("tugas_survei_id"),
    berkas: jsonb("berkas").$type<BerkasWakaf[]>().notNull(),
    diajukanPada: at("diajukan_pada").notNull(),
    /** First contact is due 3 working days after filing (Tier 3 row, no alert); null once Admin Platform has moved it past Diajukan. */
    tenggatPada: at("tenggat_pada"),
    diubahPada: at("diubah_pada").notNull(),
  },
  (table) => [index("wakaf_pengajuan_wakif_idx").on(table.wakifAccountId), index("wakaf_pengajuan_status_idx").on(table.status)],
);

/** The timeline of a Pengajuan: one row per status it entered, with its date and the Wakif-visible note given with it. */
export const wakafRiwayat = pgTable(
  "wakaf_riwayat",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pengajuanId: uuid("pengajuan_id").notNull(),
    status: text("status", { enum: statusWakaf }).notNull(),
    pada: at("pada").notNull(),
    /** The date that goes with the status (survey, KUA), when it has one. */
    tanggal: date("tanggal", { mode: "string" }),
  },
  (table) => [index("wakaf_riwayat_pengajuan_idx").on(table.pengajuanId, table.pada)],
);

export const jenisCatatanWakaf = ["wakif", "internal", "pembatalan"] as const;
export type JenisCatatanWakaf = (typeof jenisCatatanWakaf)[number];

/**
 * Notes on a Pengajuan: `wakif` notes are written to the Wakif and shown in the Wakaf tab;
 * `internal` notes stay with Admin Platform (spec, Wakaf); `pembatalan` is the Wakif's own reason for cancelling,
 * which Admin Platform reads and which is not a note written to the Wakif. Separate kinds in one table, so a read
 * for a Wakif can never forget the filter: it asks for `wakif` only, by name.
 */
export const wakafCatatan = pgTable(
  "wakaf_catatan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pengajuanId: uuid("pengajuan_id").notNull(),
    jenis: text("jenis", { enum: jenisCatatanWakaf }).notNull(),
    isi: text("isi").notNull(),
    penulisAccountId: text("penulis_account_id").notNull(),
    pada: at("pada").notNull(),
  },
  (table) => [index("wakaf_catatan_pengajuan_idx").on(table.pengajuanId, table.pada)],
);
