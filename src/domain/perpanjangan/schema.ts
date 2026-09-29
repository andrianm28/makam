import { date, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
  },
  (table) => [index("perpanjangan_hak_pakai_idx").on(table.hakPakaiId, table.dibuatPada)],
);
