/**
 * Reading one Pemesanan Makam for the Lokasi Mitra's own staff (spec,
 * Pemesanan; stories 115, 116, 120, 139; ticket 23): the Antrean Lokasi's open
 * confirmations, the Admin Platform Tier 1 "Konfirmasi Lokasi terlambat" row,
 * and the staff page of one order with the family's own details.
 *
 * An Admin Lokasi sees an order only for its own Lokasi Mitra (AC 8, story
 * 139): another Lokasi's order is nothing found, never another Lokasi's family.
 */
import { and, count, desc, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { authorize, lokasiMitraResource, type Actor } from "@/domain/identity";
import { pemesananBerkas, pemesananMakam, type PemegangHak, type PemesananStatus } from "./schema";
import type { PemesananDeps } from "./deps";
import { toPembayaranOrder, type PembayaranOrder } from "./pembayaran-order";

/** One order's document on the Lokasi Mitra's checklist, as both sides see it. */
export interface DokumenOrder {
  nama: string;
  /** When the family last put a file here, and who; null while none. */
  diunggah: { at: Date; oleh: string } | null;
  /** When the Admin Lokasi ticked it off, and who; null while not. */
  dicentang: { at: Date; oleh: string } | null;
}

/** One order as the Lokasi Mitra's staff read it: everything they need to confirm it and to call the family. */
export interface OrderStaf {
  nomor: string;
  kind: string;
  status: PemesananStatus;
  lokasi: { id: string; name: string };
  jenisMakam: { id: string; name: string } | null;
  /** The family, by name: the Pemesan, their contact and the Almarhum they write about. */
  pemesan: { name: string; phoneNumber: string | null; email: string | null };
  almarhum: { name: string; tanggalWafat: string };
  pemegangHak: PemegangHak;
  rencanaPemakamanAt: Date | null;
  /** What the Lokasi agreed; null until the order is Dikonfirmasi. */
  pemakamanAt: Date | null;
  petakNomor: string | null;
  tagihanId: string | null;
  konfirmasiDueAt: Date | null;
  diajukanAt: Date;
  alasan: string | null;
  /**
   * Where this order's money went, and what it agreed to bear: the same facts
   * Payouts prices its Pencairan item from (ticket 30), so the Lokasi's own page
   * cannot tell one story and the Pencairan run another.
   */
  pembayaran: PembayaranOrder["pembayaran"];
  partnerShare: number;
  /** The Lokasi Mitra's document checklist, with what has arrived and what is ticked. */
  dokumen: DokumenOrder[];
}

type Row = typeof pemesananMakam.$inferSelect;

/** One order as the Antrean rows read it: the few facts a row label and its deadline need. */
export interface OrderAntrean {
  id: string;
  nomor: string;
  status: PemesananStatus;
  lokasi: { id: string; name: string };
  /** The family, by name (the Antrean Lokasi's own row carries it). */
  pemesan: { name: string; phoneNumber: string | null };
  almarhum: { name: string };
  jenisMakam: { id: string; name: string } | null;
  /** The instant the Lokasi's Jam Operasional promised a confirmation by; null while it had none. */
  konfirmasiDueAt: Date | null;
  diajukanAt: Date;
}

function toAntrean(row: Row): OrderAntrean {
  return {
    id: row.id,
    nomor: row.nomor,
    status: row.status,
    lokasi: { id: row.lokasiId, name: row.lokasiName },
    pemesan: { name: row.pemesanName, phoneNumber: row.phoneNumber },
    almarhum: { name: row.almarhumName },
    jenisMakam: row.jenisMakamId && row.jenisMakamName ? { id: row.jenisMakamId, name: row.jenisMakamName } : null,
    konfirmasiDueAt: row.konfirmasiDueAt,
    diajukanAt: row.diajukanAt,
  };
}

/**
 * Every order of one Lokasi Mitra that still waits for its confirmation, oldest
 * first: the Antrean Lokasi's "Konfirmasi Saat Duka" rows. No actor: the caller
 * passes the Lokasi an Admin Lokasi is scoped to (the queue module's read).
 * The row closes itself: an order that is confirmed, declined or cancelled is
 * no longer `diajukan`, so it never appears again.
 */
export async function antreanKonfirmasi(deps: Pick<PemesananDeps, "db">, lokasiId: string): Promise<OrderAntrean[]> {
  const rows = await deps.db
    .select()
    .from(pemesananMakam)
    .where(and(eq(pemesananMakam.lokasiId, lokasiId), eq(pemesananMakam.status, "diajukan")))
    .orderBy(pemesananMakam.diajukanAt, pemesananMakam.nomor);
  return rows.map(toAntrean);
}

/**
 * Every order still waiting for its confirmation past the deadline its Lokasi's
 * Jam Operasional gave: the Admin Platform Antrean's Tier 1 "Konfirmasi Lokasi
 * terlambat" rows (spec, Work Queues; ticket 23). No deadline of its own — the
 * order's own is the row's. No actor: the Antrean is Admin Platform's.
 */
export async function konfirmasiLewatTenggat(deps: Pick<PemesananDeps, "db" | "clock">, now: Date): Promise<OrderAntrean[]> {
  const rows = await deps.db
    .select()
    .from(pemesananMakam)
    .where(and(eq(pemesananMakam.status, "diajukan"), isNotNull(pemesananMakam.konfirmasiDueAt), lte(pemesananMakam.konfirmasiDueAt, now)))
    .orderBy(pemesananMakam.konfirmasiDueAt, pemesananMakam.nomor);
  return rows.map(toAntrean);
}

/**
 * How many of a Lokasi Mitra's orders were confirmed after the deadline its Jam
 * Operasional gave (AC 6: late confirmations are counted on the Lokasi). No
 * actor, a count of stored facts, not a stored counter.
 */
export async function konfirmasiTerlambat(deps: Pick<PemesananDeps, "db">, lokasiId: string): Promise<number> {
  // Confirmed, and confirmed after the deadline its Jam Operasional gave: the whole rule, counted from the rows.
  const [row] = await deps.db
    .select({ n: count() })
    .from(pemesananMakam)
    .where(
      and(
        eq(pemesananMakam.lokasiId, lokasiId),
        isNotNull(pemesananMakam.dikonfirmasiPada),
        lte(pemesananMakam.konfirmasiDueAt, pemesananMakam.dikonfirmasiPada),
      ),
    );
  return row?.n ?? 0;
}

/**
 * One order as the Lokasi Mitra's own staff read it, with the family's own
 * details and its documents; null for an order that is not theirs (story 139:
 * an Admin Lokasi sees its own Lokasi's orders only). Admin Platform may read
 * any order, as everywhere else in the staff area.
 */
export async function orderUntukStaf(deps: Pick<PemesananDeps, "db" | "billing">, by: Actor, nomor: string): Promise<OrderStaf | null> {
  const [row] = await deps.db.select().from(pemesananMakam).where(eq(pemesananMakam.nomor, nomor));
  if (!row) return null;
  if (!authorize(by, "pemesanan.lihat_staf", lokasiMitraResource(row.lokasiId)).allowed) return null;
  return toOrderStaf(deps, row);
}

/** Every order of the Lokasi Mitra this Admin Lokasi manages that is not finished yet, newest first: its work list. */
export async function orderUntukStafTerbaru(
  deps: Pick<PemesananDeps, "db" | "billing">,
  by: Actor,
  lokasiId: string,
): Promise<OrderStaf[]> {
  if (!authorize(by, "pemesanan.lihat_staf", lokasiMitraResource(lokasiId)).allowed) return [];
  const rows = await deps.db
    .select()
    .from(pemesananMakam)
    .where(and(eq(pemesananMakam.lokasiId, lokasiId), inArray(pemesananMakam.status, ["diajukan", "dikonfirmasi"])))
    .orderBy(desc(pemesananMakam.diajukanAt), pemesananMakam.nomor);
  return Promise.all(rows.map((row) => toOrderStaf(deps, row)));
}

/** One order, its documents and all, as the staff reads it. */
async function toOrderStaf(deps: Pick<PemesananDeps, "db" | "billing">, row: Row): Promise<OrderStaf> {
  // The money facts come from the one projection Payouts reads, so the staff page and the
  // Pencairan run can never tell two different stories about the same order.
  const uang = toPembayaranOrder(
    row,
    row.tagihanId ? await deps.billing.tagihan(row.tagihanId) : null,
    row.tagihanId ? await deps.billing.metodePembayaran(row.tagihanId) : null,
  );
  return {
    pembayaran: uang.pembayaran,
    partnerShare: uang.partnerShare,
    nomor: row.nomor,
    kind: row.kind,
    status: row.status,
    lokasi: { id: row.lokasiId, name: row.lokasiName },
    jenisMakam: row.jenisMakamId && row.jenisMakamName ? { id: row.jenisMakamId, name: row.jenisMakamName } : null,
    pemesan: { name: row.pemesanName, phoneNumber: row.phoneNumber, email: row.email },
    almarhum: { name: row.almarhumName, tanggalWafat: row.tanggalWafat },
    pemegangHak: row.pemegangHak,
    rencanaPemakamanAt: row.rencanaPemakamanAt,
    pemakamanAt: row.pemakamanAt,
    petakNomor: row.petakNomor,
    tagihanId: row.tagihanId,
    konfirmasiDueAt: row.konfirmasiDueAt,
    diajukanAt: row.diajukanAt,
    alasan: row.alasan,
    dokumen: await dokumenOf(deps, row.id),
  };
}

/**
 * One order's documents, oldest first by the checklist wording they were
 * created with: an item's file and its tick, either of which may be missing.
 */
export async function dokumenOf(deps: Pick<PemesananDeps, "db">, pemesananId: string): Promise<DokumenOrder[]> {
  const rows = await deps.db
    .select()
    .from(pemesananBerkas)
    .where(eq(pemesananBerkas.pemesananId, pemesananId))
    .orderBy(pemesananBerkas.dibuatPada, pemesananBerkas.nama);
  return rows.map((row) => ({
    nama: row.nama,
    diunggah: row.diunggahPada ? { at: row.diunggahPada, oleh: row.diunggahOleh ?? "" } : null,
    dicentang: row.dicentangPada ? { at: row.dicentangPada, oleh: row.dicentangOleh ?? "" } : null,
  }));
}
