/**
 * Owned by the Refunds module: `permintaan_pengembalian` (the mutable
 * lifecycle: raised, approved, transferred) and `bukti_pengembalian_dana`
 * (the append-only document a transfer issues), spec domain module 10, Billing
 * > Refunds; ticket 31.
 *
 * Every other module's data a row refers to — the Tagihan, its lines, a Lokasi
 * Mitra — belongs to a neighbour and is named here as a plain id and text
 * only, never a foreign key across modules, as elsewhere in this codebase
 * (Payouts' own `schema.ts` says the same about its own rows).
 */
import { sql } from "drizzle-orm";
import { boolean, check, customType, date, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { RUPIAH_MAX, rupiahFromDatabase, type Rupiah } from "@/lib/rupiah";

const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

const rupiah = customType<{ data: Rupiah; driverData: string }>({
  dataType: () => "bigint",
  fromDriver: (value) => rupiahFromDatabase(value),
  toDriver: (value) => String(value),
});

/**
 * Who is at fault (spec, Billing: whether the Biaya Layanan Platform is
 * refunded). "pemesan" is the only source with a real caller today (ticket
 * 24's Saat Duka cancellation, materialised here by the tick); the other three
 * are directly testable against the same rule so a future caller (a Keluhan, a
 * Pembatalan, a PTSP rejection) has only to raise a request, never to relearn
 * the rule.
 */
export const pihakBersalahKinds = ["pemesan", "lokasi", "mitra_jasa", "operator"] as const;
export type PihakBersalah = (typeof pihakBersalahKinds)[number];

export const permintaanPengembalianStatuses = ["diajukan", "disetujui", "ditransfer"] as const;
export type PermintaanPengembalianStatus = (typeof permintaanPengembalianStatuses)[number];

/** How a request reached Refunds: the one automatic source today, or a manual one Admin Platform raises. */
export const permintaanSumberKinds = ["pembatalan_pemesan", "manual"] as const;
export type PermintaanSumberKind = (typeof permintaanSumberKinds)[number];

/**
 * Owned by the Refunds module: one refund from request to transfer. At most
 * one request is open (`diajukan` or `disetujui`) per Tagihan at a time — the
 * partial unique index below — so approving and transferring always act on an
 * unambiguous row.
 */
export const permintaanPengembalian = pgTable(
  "permintaan_pengembalian",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tagihanId: text("tagihan_id").notNull(),
    nomorTagihan: text("nomor_tagihan").notNull(),
    nomorPemesanan: text("nomor_pemesanan"),
    sumber: text("sumber", { enum: permintaanSumberKinds }).notNull(),
    pihakBersalah: text("pihak_bersalah", { enum: pihakBersalahKinds }).notNull(),
    /** Derived from `pihakBersalah` at request time (spec, Billing: the fee table), never recomputed later. */
    biayaLayananPlatformDikembalikan: boolean("biaya_layanan_platform_dikembalikan").notNull(),
    /**
     * True for a refund the Operator chooses to give from its own funds: never
     * netted from a Lokasi Mitra's Pencairan, whatever Payouts holds for this
     * Tagihan (spec, Billing > Refunds).
     */
    goodwill: boolean("goodwill").notNull(),
    /** Whether this covers every line the Tagihan can still refund (the "penuh" side of AC 7's test). */
    penuh: boolean("penuh").notNull(),
    /** A snapshot of what is refunded, for the Bukti and for netting by Lokasi Mitra: {label, amount, provider}[]. */
    lines: jsonb("lines").notNull(),
    jumlah: rupiah("jumlah").notNull(),
    catatan: text("catatan"),
    diajukanPada: at("diajukan_pada").notNull(),
    /** Null for a request the tick materialised from a cancellation: nobody raised it by hand. */
    diajukanOleh: text("diajukan_oleh"),
    status: text("status", { enum: permintaanPengembalianStatuses }).notNull(),
    disetujuiPada: at("disetujui_pada"),
    disetujuiOleh: text("disetujui_oleh"),
    /** 2 Hari Kerja after approval (Admin Platform calendar, ticket 11): the Tier 3 "refund transfer" row's own deadline. */
    tenggatTransferPada: at("tenggat_transfer_pada"),
    rekeningBank: text("rekening_bank"),
    rekeningNomor: text("rekening_nomor"),
    rekeningNama: text("rekening_nama"),
    rekeningDiisiOleh: text("rekening_diisi_oleh", { enum: ["pemesan", "admin_platform"] }),
    rekeningDiisiPada: at("rekening_diisi_pada"),
    buktiId: uuid("bukti_id"),
  },
  (table) => [
    index("permintaan_pengembalian_tagihan_idx").on(table.tagihanId),
    // At most one open request per Tagihan: the materialising tick and a manual
    // raise both go through this, so a second one is a no-op / a refusal rather
    // than a second bill of the same money.
    uniqueIndex("permintaan_pengembalian_tagihan_open_idx")
      .on(table.tagihanId)
      .where(sql`${table.status} <> 'ditransfer'`),
    // The tick's own idempotency: a Tagihan the cancellation flow flagged gets
    // materialised at most once, ever (running the tick twice never doubles it).
    uniqueIndex("permintaan_pengembalian_tagihan_sumber_idx")
      .on(table.tagihanId, table.sumber)
      .where(sql`${table.sumber} = 'pembatalan_pemesan'`),
    check("permintaan_pengembalian_jumlah_check", sql`${table.jumlah} between 1 and ${sql.raw(String(RUPIAH_MAX))}`),
    check(
      "permintaan_pengembalian_rekening_check",
      sql`(${table.rekeningBank} is null) = (${table.rekeningNomor} is null) and (${table.rekeningBank} is null) = (${table.rekeningNama} is null)`,
    ),
  ],
);

/**
 * Owned by the Refunds module: one Bukti Pengembalian Dana per transfer.
 * Append-only (the migration refuses UPDATE and DELETE), like `bukti_pencairan`
 * and `bukti_pembayaran` elsewhere in this codebase — a family's proof that its
 * money came back must never be quietly rewritten or removed.
 */
export const buktiPengembalianDana = pgTable("bukti_pengembalian_dana", {
  id: uuid("id").primaryKey().defaultRandom(),
  nomor: text("nomor").notNull().unique(),
  link: text("link").notNull().unique(),
  permintaanId: uuid("permintaan_id").notNull().unique(),
  tagihanId: text("tagihan_id").notNull(),
  nomorTagihan: text("nomor_tagihan").notNull(),
  nomorPemesanan: text("nomor_pemesanan"),
  amount: rupiah("amount").notNull(),
  biayaLayananPlatformDikembalikan: boolean("biaya_layanan_platform_dikembalikan").notNull(),
  lines: jsonb("lines").notNull(),
  rekeningBank: text("rekening_bank").notNull(),
  rekeningNomor: text("rekening_nomor").notNull(),
  rekeningNama: text("rekening_nama").notNull(),
  buktiTransferKey: text("bukti_transfer_key").notNull(),
  ditransferPada: date("ditransfer_pada", { mode: "string" }).notNull(),
  header: jsonb("header").notNull(),
  dibuatPada: at("dibuat_pada").notNull(),
});
