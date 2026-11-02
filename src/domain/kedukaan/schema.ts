import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { jenisKedukaanValues, statusKedukaanValues, type RincianKedukaan } from "./skema";

const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export { jenisKedukaanValues, statusKedukaanValues };

/**
 * Owned by the Kedukaan module (ADR 0010): one family's request for a Layanan Kedukaan or a
 * Konsultasi Rencana Pemakaman. `tenggat_pada` is the first-contact deadline while it is Diajukan
 * (the Antrean row), and null once it has moved on.
 */
export const kedukaanPermintaan = pgTable(
  "kedukaan_permintaan",
  {
    id: uuid("id").primaryKey(),
    nomor: text("nomor").notNull().unique(),
    accountId: uuid("account_id").notNull(),
    email: text("email").notNull(),
    jenis: text("jenis", { enum: jenisKedukaanValues }).notNull(),
    nama: text("nama").notNull(),
    telepon: text("telepon").notNull(),
    kabKota: text("kab_kota").notNull(),
    rincian: jsonb("rincian").$type<RincianKedukaan>().notNull(),
    catatan: text("catatan").notNull(),
    status: text("status", { enum: statusKedukaanValues }).notNull(),
    alasan: text("alasan"),
    diajukanPada: at("diajukan_pada").notNull(),
    tenggatPada: at("tenggat_pada"),
    diubahPada: at("diubah_pada").notNull(),
  },
  (table) => [index("kedukaan_permintaan_account_idx").on(table.accountId), index("kedukaan_permintaan_status_idx").on(table.status)],
);

/** Owned by the Kedukaan module: every status a Permintaan Kedukaan entered, with who and why. */
export const kedukaanRiwayat = pgTable(
  "kedukaan_riwayat",
  {
    id: uuid("id").primaryKey(),
    permintaanId: uuid("permintaan_id")
      .notNull()
      .references(() => kedukaanPermintaan.id),
    status: text("status", { enum: statusKedukaanValues }).notNull(),
    pada: at("pada").notNull(),
    olehAccountId: uuid("oleh_account_id"),
    catatan: text("catatan"),
  },
  (table) => [index("kedukaan_riwayat_permintaan_idx").on(table.permintaanId, table.pada)],
);
