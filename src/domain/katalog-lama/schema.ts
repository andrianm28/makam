import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/**
 * Owned by the Katalog Lama module: which Lokasi Mitra of v1 came from which
 * cemetery in the old Laravel app's catalog (ticket 86).
 *
 * The old app's own code is the primary key, never a v1 id: it is the only
 * identifier both databases agree on, so running the import again over the same
 * export finds every row already imported and creates nothing twice.
 *
 * `lokasi_id` is null between the claim (the import reserved this code) and the
 * bind (the Lokasi module created the Lokasi Mitra and its id was written
 * here). A claim left unbound is an import that was cut short: the import
 * refuses it and reports it, rather than creating a second Lokasi Mitra.
 */
export const katalogLamaLokasi = pgTable("katalog_lama_lokasi", {
  kode: text("kode").primaryKey(),
  lokasiId: uuid("lokasi_id"),
  diklaimPada: at("diklaim_pada").notNull(),
  diimporPada: at("diimpor_pada"),
  /** The Akun the import acted as; no foreign key, like every Audit Log actor. */
  diimporOleh: text("diimpor_oleh"),
});

/**
 * Owned by the Katalog Lama module: which Jenis Makam came from which one in the
 * old app, keyed the same way, under the old code of the Lokasi it belongs to
 * (never the Lokasi Mitra's id, so a report can be read without v1's ids).
 */
export const katalogLamaJenisMakam = pgTable("katalog_lama_jenis_makam", {
  kode: text("kode").primaryKey(),
  /** The old app's code of the Lokasi this Jenis Makam sits under. */
  lokasiKode: text("lokasi_kode").notNull(),
  jenisMakamId: uuid("jenis_makam_id"),
  diklaimPada: at("diklaim_pada").notNull(),
  diimporPada: at("diimpor_pada"),
  diimporOleh: text("diimpor_oleh"),
});
