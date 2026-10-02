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
import { alasanOrder } from "./alasan-tolak";
import { pemesananBerkas, pemesananMakam, type PemegangHak, type PemesananStatus } from "./schema";
import type { PemesananDeps } from "./deps";

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
  /** What the Admin Lokasi recorded as the day the burial actually happened; null until it did (ticket 25). */
  pemakamanTanggal: string | null;
  /** Which layer of the plot the Almarhum was laid in, once recorded. */
  pemakamanLayer: number | null;
  petakNomor: string | null;
  tagihanId: string | null;
  /** The Bukti Pemesanan issued when that Tagihan went Lunas; null until it did. */
  buktiPemesananId: string | null;
  konfirmasiDueAt: Date | null;
  diajukanAt: Date;
  /** Why the Lokasi declined, or the family cancelled; null while none. */
  alasan: string | null;
  /**
   * The alternative this Lokasi has offered and the family has not answered, as
   * the Lokasi itself reads it (ticket 24): the new Jenis Makam and day it
   * proposed, so the page can say the offer is already on the table. No total: a
   * price belongs to the family, and this read is the Lokasi's.
   */
  alternatif: { jenisMakam: string | null; pemakamanAt: Date | null } | null;
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
 * Every order of one Lokasi Mitra still waiting for its Pemakaman to be
 * recorded, oldest first: the Antrean Lokasi's "Catat Pemakaman" rows
 * (ticket 25's AC 1). The row is raised by the worker's prompt, the day after
 * the agreed burial, and closes itself: an order that is no longer `dikonfirmasi`
 * (recorded, declined or cancelled) never appears again, and one never prompted
 * yet is not yet on the list. No actor: the caller passes the Lokasi an Admin
 * Lokasi is scoped to (the queue module's read).
 */
export async function antreanCatatPemakaman(deps: Pick<PemesananDeps, "db">, lokasiId: string): Promise<OrderAntrean[]> {
  const rows = await deps.db
    .select()
    .from(pemesananMakam)
    .where(
      and(
        eq(pemesananMakam.lokasiId, lokasiId),
        eq(pemesananMakam.status, "dikonfirmasi"),
        isNotNull(pemesananMakam.catatPemakamanDitagihPada),
      ),
    )
    .orderBy(pemesananMakam.catatPemakamanDitagihPada, pemesananMakam.nomor);
  return rows.map(toAntrean);
}

/**
 * Every order still waiting for its confirmation past the deadline its Lokasi's
 * Jam Operasional gave: the Admin Platform Antrean's Tier 1 "Konfirmasi Lokasi
 * terlambat" rows (spec, Work Queues; ticket 23). No deadline of its own —
 * the order's own is the row's. No actor: the Antrean is Admin Platform's.
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
 * How many of a Lokasi Mitra's orders were declined (story 118: a decline is
 * counted on the Lokasi, beside its late confirmations). No actor, a count of
 * stored facts rather than a stored counter, so it cannot drift from the orders
 * it counts — and an order the Pemesan ended by refusing an alternative is a
 * Ditolak order, counted here like any other.
 */
export async function ditolak(deps: Pick<PemesananDeps, "db">, lokasiId: string): Promise<number> {
  const [row] = await deps.db
    .select({ n: count() })
    .from(pemesananMakam)
    .where(and(eq(pemesananMakam.lokasiId, lokasiId), eq(pemesananMakam.status, "ditolak")));
  return row?.n ?? 0;
}

/** One declined order as the Admin Platform Tier 1 call row reads it. */
export interface OrderDitolak {
  id: string;
  nomor: string;
  /** When the decline happened: the Tier 1 row's two hours are counted from here, never from the submission. */
  ditolakPada: Date;
  lokasi: { id: string; name: string };
  pemesan: { name: string; phoneNumber: string | null };
  almarhum: { name: string };
  /** Why, in the wording of the fixed list, so the call says it in the family's own language. */
  alasan: string;
}

/**
 * Every declined Saat Duka order, newest first: the Admin Platform Antrean's Tier 1
 * "Saat Duka ditolak" rows (spec, Work Queues: "Saat Duka ditolak (call within
 * 2 h)"; story 33; ticket 24). It carries no deadline of its own — the row's is
 * two daytime hours after the decline, which the row type computes. No actor:
 * the Antrean is Admin Platform's.
 */
export async function saatDukaDitolak(deps: Pick<PemesananDeps, "db">): Promise<OrderDitolak[]> {
  const rows = await deps.db
    .select()
    .from(pemesananMakam)
    .where(and(eq(pemesananMakam.status, "ditolak"), isNotNull(pemesananMakam.ditolakPada)))
    .orderBy(desc(pemesananMakam.ditolakPada), desc(pemesananMakam.nomor));
  return rows.map((row) => ({
    id: row.id,
    nomor: row.nomor,
    ditolakPada: row.ditolakPada as Date,
    lokasi: { id: row.lokasiId, name: row.lokasiName },
    pemesan: { name: row.pemesanName, phoneNumber: row.phoneNumber },
    almarhum: { name: row.almarhumName },
    // A decline always carries a reason off the list; the fallback says a hole
    // in the data is a hole rather than dressing it up as a reason.
    alasan: alasanOrder(row.alasanTolak, row.alasan) ?? "Alasan tidak tercatat",
  }));
}

/**
 * One order as the Lokasi Mitra's own staff read it, with the family's own
 * details and its documents; null for an order that is not theirs (story 139:
 * an Admin Lokasi sees its own Lokasi's orders only). Admin Platform may read
 * any order, as everywhere else in the staff area.
 */
export async function orderUntukStaf(deps: Pick<PemesananDeps, "db" | "lokasi">, by: Actor, nomor: string): Promise<OrderStaf | null> {
  const [row] = await deps.db.select().from(pemesananMakam).where(eq(pemesananMakam.nomor, nomor));
  if (!row) return null;
  if (!authorize(by, "pemesanan.lihat_staf", lokasiMitraResource(row.lokasiId)).allowed) return null;
  return toOrderStaf(deps, row);
}

/** Every order of the Lokasi Mitra this Admin Lokasi manages that is not finished yet, newest first: its work list. */
export async function orderUntukStafTerbaru(
  deps: Pick<PemesananDeps, "db" | "lokasi">,
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
async function toOrderStaf(deps: Pick<PemesananDeps, "db" | "lokasi">, row: Row): Promise<OrderStaf> {
  return {
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
    pemakamanTanggal: row.pemakamanTanggal,
    pemakamanLayer: row.pemakamanLayer,
    petakNomor: row.petakNomor,
    tagihanId: row.tagihanId,
    buktiPemesananId: row.buktiPemesananId,
    konfirmasiDueAt: row.konfirmasiDueAt,
    diajukanAt: row.diajukanAt,
    alasan: alasanOrder(row.alasanTolak, row.alasan),
    alternatif: row.alternatifDitawarkanPada
      ? { jenisMakam: row.alternatifJenisMakamId ? row.jenisMakamName : null, pemakamanAt: row.alternatifPemakamanAt }
      : null,
    dokumen: await dokumenOf(deps, row.id, row.lokasiId),
  };
}

/**
 * One order's documents as the staff reads them: every item of the Lokasi Mitra's
 * checklist (so a family that has uploaded nothing still shows what is asked), each
 * with its file and its tick, then any item the order holds that the checklist no
 * longer names.
 */
async function dokumenOf(deps: Pick<PemesananDeps, "db" | "lokasi">, pemesananId: string, lokasiId: string): Promise<DokumenOrder[]> {
  const [rows, checklist] = await Promise.all([
    deps.db.select().from(pemesananBerkas).where(eq(pemesananBerkas.pemesananId, pemesananId)).orderBy(pemesananBerkas.dibuatPada, pemesananBerkas.nama),
    deps.lokasi.documentChecklistOf(lokasiId),
  ]);
  const barisPerNama = new Map(rows.map((row) => [row.nama, row]));
  const daftarNama = [...checklist, ...rows.map((row) => row.nama).filter((nama) => !checklist.includes(nama))];
  return daftarNama.map((nama) => {
    const row = barisPerNama.get(nama);
    return {
      nama,
      diunggah: row?.diunggahPada ? { at: row.diunggahPada, oleh: row.diunggahOleh ?? "" } : null,
      dicentang: row?.dicentangPada ? { at: row.dicentangPada, oleh: row.dicentangOleh ?? "" } : null,
    };
  });
}
