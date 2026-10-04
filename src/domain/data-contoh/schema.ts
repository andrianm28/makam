import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/**
 * Owned by the Data Contoh module (ticket 109): the registry of every example
 * entity a Data Contoh set planted on a stack that is not development or test,
 * so one command can retire all of it again.
 *
 * `kode` is the fixture's own code (`rilis1/lokasi/taman-makam-firdaus`), the key
 * `tanam` is idempotent on: at most ONE active row per code (the partial unique
 * index), so planting twice records nothing twice. A retired row (`dicabut_pada`)
 * is kept as history and frees its code, so a stack can plant again after a
 * `cabut`. `entitas_id` is the id the owning module gave the entity (a Lokasi
 * Mitra's, an Akun's, a Jenis Makam's), or `<tariff key>:<version seq>` for a
 * global price version, which has no id of its own. `induk_kode` names the
 * Lokasi entry a child (its Jenis Makam, its Admin Lokasi's Akun) belongs to.
 * `selesai_pada` is empty while an entry's build is still running: an active
 * entry left without it is a build that was cut short, and the next `tanam`
 * retires it rather than finishing it.
 */
export const dataContohEntri = pgTable(
  "data_contoh_entri",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kode: text("kode").notNull(),
    himpunan: text("himpunan").notNull(),
    jenis: text("jenis").notNull(),
    entitasId: text("entitas_id").notNull(),
    indukKode: text("induk_kode"),
    selesaiPada: at("selesai_pada"),
    dicatatPada: at("dicatat_pada").notNull(),
    /** The Akun the command acted as; no foreign key, like every Audit Log actor. */
    dicatatOleh: text("dicatat_oleh").notNull(),
    dicabutPada: at("dicabut_pada"),
    dicabutOleh: text("dicabut_oleh"),
  },
  (table) => [
    uniqueIndex("data_contoh_entri_kode_aktif_idx")
      .on(table.kode)
      .where(sql`${table.dicabutPada} is null`),
    index("data_contoh_entri_induk_idx").on(table.indukKode),
  ],
);
