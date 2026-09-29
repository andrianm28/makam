/**
 * Reading the Pembatalan requests of paid Pemesanan Terencana (ticket 38): what the family sees of its own
 * request, what the Lokasi Mitra's staff work down (the Antrean Lokasi row while a request is Diajukan) and
 * Admin Platform's Tier 3 "Pembatalan refund approval" row. Every read is a projection of the request's
 * own state, so a row closes itself the moment the request moves on.
 */
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { authorize, lokasiMitraResource, type Actor } from "@/domain/identity";
import type { PemesananDeps } from "./deps";
import { pemesananTerencana, permintaanPembatalanTerencana, type PermintaanPembatalanStatus } from "./schema";

type Row = typeof permintaanPembatalanTerencana.$inferSelect;

/** One Pembatalan request as its own family reads it. */
export interface PermintaanPembatalan {
  id: string;
  nomor: string;
  /** The Hak Pakai this request cancels, and the number its plot is known by. */
  hakPakaiId: string;
  unitNomor: string;
  status: PermintaanPembatalanStatus;
  /** Which side of the Masa Pembatalan the request was made on, and the share of the tariff and the amount that follows from it. */
  dalamMasaPembatalan: boolean;
  persenRefund: number;
  jumlahRefund: number;
  catatanPemohon: string | null;
  /** The Admin Lokasi's reason to decline, or what it asked to be fixed. */
  alasanKeputusan: string | null;
  /** How many times it was sent back for a fix. */
  putaran: number;
  diajukanPada: Date;
  /** When the Lokasi Mitra must answer by (2 Hari Kerja on its calendar); null while its Jam Operasional is belum diisi. */
  tenggatPada: Date | null;
  diputuskanPada: Date | null;
  dibatalkanPada: Date | null;
}

export function toPermintaan(row: Row): PermintaanPembatalan {
  return {
    id: row.id,
    nomor: row.nomorPemesanan,
    hakPakaiId: row.hakPakaiId,
    unitNomor: row.unitNomor,
    status: row.status,
    dalamMasaPembatalan: row.dalamMasaPembatalan,
    persenRefund: row.persenRefund,
    jumlahRefund: row.jumlahRefund,
    catatanPemohon: row.catatanPemohon,
    alasanKeputusan: row.alasanKeputusan,
    putaran: row.putaran,
    diajukanPada: row.diajukanPada,
    tenggatPada: row.tenggatPada,
    diputuskanPada: row.diputuskanPada,
    dibatalkanPada: row.dibatalkanPada,
  };
}

/** A request as the Lokasi Mitra's staff read it: who asked, and where the answer goes. */
export interface PermintaanPembatalanStaf extends PermintaanPembatalan {
  pemohonEmail: string;
}

/** The Antrean Lokasi's "Pembatalan" row: one Diajukan request of that Lokasi Mitra. */
export interface BarisAntreanPembatalan {
  id: string;
  nomor: string;
  unit: string[];
  diajukanPada: Date;
  /** The row's deadline: 2 Hari Kerja from the filing; null while the Lokasi's Jam Operasional is belum diisi. */
  tenggatPada: Date | null;
}

/** Admin Platform's Tier 3 "Pembatalan refund approval" row: an approved Pembatalan whose refund still waits for approval. */
export interface BarisPersetujuanRefundPembatalan {
  id: string;
  nomor: string;
  lokasi: { id: string; name: string };
  jumlahRefund: number;
  /** The refund request in Refunds, where Admin Platform approves it. */
  permintaanPengembalianId: string;
  /** 2 Hari Kerja on Admin Platform's calendar from the Lokasi's approval. */
  tenggatPada: Date | null;
}

/**
 * The Pembatalan requests still Diajukan at one Lokasi Mitra, oldest first: the Antrean Lokasi's rows. No
 * actor: the caller passes the Lokasi an Admin Lokasi is scoped to. A request sent back for a fix, approved,
 * declined or withdrawn is no longer Diajukan, and its row is gone.
 */
export async function antreanPembatalan(deps: Pick<PemesananDeps, "db">, lokasiId: string): Promise<BarisAntreanPembatalan[]> {
  const rows = await deps.db
    .select()
    .from(permintaanPembatalanTerencana)
    .where(and(eq(permintaanPembatalanTerencana.lokasiId, lokasiId), eq(permintaanPembatalanTerencana.status, "diajukan")))
    .orderBy(permintaanPembatalanTerencana.diajukanPada, permintaanPembatalanTerencana.nomorPemesanan);
  return rows.map((row) => ({
    id: row.id,
    nomor: row.nomorPemesanan,
    unit: [row.unitNomor],
    diajukanPada: row.diajukanPada,
    tenggatPada: row.tenggatPada,
  }));
}

/**
 * Every Pembatalan the Admin Lokasi approved whose refund Admin Platform has not approved yet, oldest first
 * (spec, Work Queues, Tier 3 "Pembatalan refund approval", 2 Hari Kerja): the row closes itself when the
 * refund request in Refunds is approved. No actor: the Antrean is Admin Platform's.
 */
export async function persetujuanRefundPembatalan(deps: Pick<PemesananDeps, "db" | "refunds">): Promise<BarisPersetujuanRefundPembatalan[]> {
  const rows = await deps.db
    .select({ request: permintaanPembatalanTerencana, lokasiName: pemesananTerencana.lokasiName })
    .from(permintaanPembatalanTerencana)
    .innerJoin(pemesananTerencana, eq(pemesananTerencana.id, permintaanPembatalanTerencana.pemesananId))
    .where(and(eq(permintaanPembatalanTerencana.status, "disetujui"), isNotNull(permintaanPembatalanTerencana.permintaanPengembalianId)))
    .orderBy(permintaanPembatalanTerencana.persetujuanRefundTenggatPada, permintaanPembatalanTerencana.nomorPemesanan);
  const terbuka: BarisPersetujuanRefundPembatalan[] = [];
  for (const { request, lokasiName } of rows) {
    if (!request.permintaanPengembalianId) continue;
    const refund = await deps.refunds.permintaan(request.permintaanPengembalianId);
    if (refund?.status !== "diajukan") continue;
    terbuka.push({
      id: request.id,
      nomor: request.nomorPemesanan,
      lokasi: { id: request.lokasiId, name: lokasiName },
      jumlahRefund: request.jumlahRefund,
      permintaanPengembalianId: request.permintaanPengembalianId,
      tenggatPada: request.persetujuanRefundTenggatPada,
    });
  }
  return terbuka;
}

/**
 * Every Pembatalan request on one order, newest first, for that Lokasi Mitra's own staff (or Admin Platform):
 * an order that is another Lokasi's is nothing found, as every staff read of an order is.
 */
export async function pembatalanUntukStaf(deps: Pick<PemesananDeps, "db">, by: Actor, nomor: string): Promise<PermintaanPembatalanStaf[]> {
  const [order] = await deps.db.select().from(pemesananTerencana).where(eq(pemesananTerencana.nomor, nomor));
  if (!order) return [];
  if (!authorize(by, "pemesanan.lihat_staf", lokasiMitraResource(order.lokasiId)).allowed) return [];
  const rows = await deps.db
    .select()
    .from(permintaanPembatalanTerencana)
    .where(eq(permintaanPembatalanTerencana.pemesananId, order.id))
    .orderBy(desc(permintaanPembatalanTerencana.diajukanPada), desc(permintaanPembatalanTerencana.id));
  return rows.map((row) => ({ ...toPermintaan(row), pemohonEmail: row.pemohonEmail }));
}

/**
 * Every Pembatalan request on the order of this Pemesan, newest first (one per Hak Pakai cancelled, and a plot may be
 * asked about more than once): what the order page says about them, and where it asks for the bank account. The Pemesan
 * who paid may be somebody other than the Pemegang Hak who asked.
 */
export async function pembatalanUntukPesanan(
  deps: Pick<PemesananDeps, "db">,
  pemesan: { accountId: string },
  nomor: string,
): Promise<PermintaanPembatalan[]> {
  const [order] = await deps.db
    .select()
    .from(pemesananTerencana)
    .where(and(eq(pemesananTerencana.nomor, nomor), eq(pemesananTerencana.pemesanAccountId, pemesan.accountId)));
  if (!order) return [];
  const rows = await deps.db
    .select()
    .from(permintaanPembatalanTerencana)
    .where(eq(permintaanPembatalanTerencana.pemesananId, order.id))
    .orderBy(desc(permintaanPembatalanTerencana.diajukanPada), desc(permintaanPembatalanTerencana.id));
  return rows.map(toPermintaan);
}

/**
 * True while a Pembatalan request on this Hak Pakai is open (Diajukan, or sent back and
 * waiting for its fix): what blocks a Ganti Pemegang Hak (spec: "blocked while a Pembatalan is open").
 */
export async function adaPembatalanTerbuka(deps: Pick<PemesananDeps, "db">, hakPakaiId: string): Promise<boolean> {
  const [row] = await deps.db
    .select({ id: permintaanPembatalanTerencana.id })
    .from(permintaanPembatalanTerencana)
    .where(and(eq(permintaanPembatalanTerencana.hakPakaiId, hakPakaiId), inArray(permintaanPembatalanTerencana.status, ["diajukan", "perlu_perbaikan"])))
    .limit(1);
  return row !== undefined;
}
