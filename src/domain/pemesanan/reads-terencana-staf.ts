/**
 * Reading Pemesanan Terencana for the Lokasi Mitra's own staff and for Admin
 * Platform (spec, Work Queues: the Antrean Lokasi's "Konfirmasi Terencana" row in
 * Lainnya and the Tier 3 "Konfirmasi Terencana terlambat" row; ticket 37). The same
 * shape as `./reads-staf.ts` is for a Saat Duka order, over the Terencana tables.
 *
 * An Admin Lokasi sees an order only for its own Lokasi Mitra: another Lokasi's
 * order is nothing found, never another Lokasi's family.
 */
import { and, eq, isNotNull, lt } from "drizzle-orm";
import { authorize, lokasiMitraResource, type Actor } from "@/domain/identity";
import { alasanBatalTerencana } from "./alasan-batal-terencana";
import { alasanOrder } from "./alasan-tolak";
import type { PemesananDeps } from "./deps";
import { nomorUnit, unitsOfOrders } from "./terencana-unit";
import {
  pemesananTerencana,
  type CalonPenghuniTerencana,
  type PemegangHak,
  type PemesananTerencanaStatus,
  type SyaratTerencana,
} from "./schema";

/** One plot of a Terencana order, as the staff and the family read it. */
export interface UnitTerencanaBaca {
  jenis: "petak" | "kavling";
  nomor: string;
  jenisMakamName: string;
  /** The Hak Pakai this plot's payment granted; null until the order is Aktif. */
  hakPakaiId: string | null;
}

/** One Terencana order as the Lokasi Mitra's staff read it: everything they need to confirm or decline it and to call the family. */
export interface OrderTerencanaStaf {
  id: string;
  nomor: string;
  status: PemesananTerencanaStatus;
  lokasi: { id: string; name: string };
  pemesan: { name: string; phoneNumber: string; email: string };
  pemegangHak: PemegangHak;
  calonPenghuni: CalonPenghuniTerencana;
  /** The Syarat as they were when the order was placed. */
  syarat: SyaratTerencana;
  unit: UnitTerencanaBaca[];
  diajukanAt: Date;
  /** The end of the Lokasi's next working day after submission; null while its Jam Operasional is belum diisi. */
  konfirmasiDueAt: Date | null;
  dikonfirmasiPada: Date | null;
  /** When the hold on the plots ends, the instant the Tagihan is due; null until confirmed. */
  tahanSampai: Date | null;
  tagihanId: string | null;
  buktiPemesananId: string | null;
  aktifPada: Date | null;
  masaPembatalanBerakhirPada: Date | null;
  /** Why it was declined or cancelled, worded; null while none. */
  alasan: string | null;
}

/** One Terencana order as an Antrean row reads it: the few facts a row label and its deadline need. */
export interface OrderTerencanaAntrean {
  id: string;
  nomor: string;
  lokasi: { id: string; name: string };
  pemesan: { name: string; phoneNumber: string };
  unit: UnitTerencanaBaca[];
  /** The deadline the row is due by; null while the Lokasi's Jam Operasional is belum diisi. */
  konfirmasiDueAt: Date | null;
  diajukanAt: Date;
}

type Row = typeof pemesananTerencana.$inferSelect;

/** The units of the given orders in one query, as the staff and the family read them. */
async function unitsOf(deps: Pick<PemesananDeps, "db">, rows: readonly Row[]): Promise<Map<string, UnitTerencanaBaca[]>> {
  const perOrder = await unitsOfOrders(deps.db, rows.map((row) => row.id));
  return new Map(
    [...perOrder].map(([id, units]) => [
      id,
      units.map((unit) => ({
        jenis: unit.petakId ? ("petak" as const) : ("kavling" as const),
        nomor: nomorUnit(unit),
        jenisMakamName: unit.jenisMakamName,
        hakPakaiId: unit.hakPakaiId,
      })),
    ]),
  );
}

async function toAntrean(deps: Pick<PemesananDeps, "db">, rows: readonly Row[]): Promise<OrderTerencanaAntrean[]> {
  const units = await unitsOf(deps, rows);
  return rows.map((row) => ({
    id: row.id,
    nomor: row.nomor,
    lokasi: { id: row.lokasiId, name: row.lokasiName },
    pemesan: { name: row.pemesanName, phoneNumber: row.phoneNumber },
    unit: units.get(row.id) ?? [],
    konfirmasiDueAt: row.konfirmasiDueAt,
    diajukanAt: row.diajukanAt,
  }));
}

/**
 * Every Terencana order of one Lokasi Mitra that still waits for its confirmation,
 * oldest first: the Antrean Lokasi's "Konfirmasi Terencana" rows. No actor: the
 * caller passes the Lokasi an Admin Lokasi is scoped to (the queue module's read).
 * The row closes itself: an order that is confirmed, declined or withdrawn is no
 * longer `diajukan`, and a late row is still this row, only past its deadline.
 */
export async function antreanKonfirmasiTerencana(deps: Pick<PemesananDeps, "db">, lokasiId: string): Promise<OrderTerencanaAntrean[]> {
  const rows = await deps.db
    .select()
    .from(pemesananTerencana)
    .where(and(eq(pemesananTerencana.lokasiId, lokasiId), eq(pemesananTerencana.status, "diajukan")))
    .orderBy(pemesananTerencana.diajukanAt, pemesananTerencana.nomor);
  return toAntrean(deps, rows);
}

/**
 * Every Terencana order still waiting for its confirmation past the end of its
 * Lokasi's next working day: Admin Platform's Tier 3 "Konfirmasi Terencana terlambat"
 * rows (spec, Work Queues; ticket 37). Nothing else happens to the order — there is
 * no automatic cancel — and the row closes itself the moment the order is confirmed,
 * declined or withdrawn. No actor: the Antrean is Admin Platform's.
 */
export async function konfirmasiTerencanaLewatTenggat(deps: Pick<PemesananDeps, "db">, now: Date): Promise<OrderTerencanaAntrean[]> {
  const rows = await deps.db
    .select()
    .from(pemesananTerencana)
    .where(and(eq(pemesananTerencana.status, "diajukan"), isNotNull(pemesananTerencana.konfirmasiDueAt), lt(pemesananTerencana.konfirmasiDueAt, now)))
    .orderBy(pemesananTerencana.konfirmasiDueAt, pemesananTerencana.nomor);
  return toAntrean(deps, rows);
}

/**
 * One Terencana order as the Lokasi Mitra's own staff read it; null for an order that
 * is not theirs (an Admin Lokasi sees its own Lokasi's orders only, Admin Platform any).
 */
export async function terencanaUntukStaf(deps: Pick<PemesananDeps, "db">, by: Actor, nomor: string): Promise<OrderTerencanaStaf | null> {
  const [row] = await deps.db.select().from(pemesananTerencana).where(eq(pemesananTerencana.nomor, nomor));
  if (!row) return null;
  if (!authorize(by, "pemesanan.lihat_staf", lokasiMitraResource(row.lokasiId)).allowed) return null;
  const units = await unitsOf(deps, [row]);
  return {
    id: row.id,
    nomor: row.nomor,
    status: row.status,
    lokasi: { id: row.lokasiId, name: row.lokasiName },
    pemesan: { name: row.pemesanName, phoneNumber: row.phoneNumber, email: row.email },
    pemegangHak: row.pemegangHak,
    calonPenghuni: row.calonPenghuni,
    syarat: row.syarat,
    unit: units.get(row.id) ?? [],
    diajukanAt: row.diajukanAt,
    konfirmasiDueAt: row.konfirmasiDueAt,
    dikonfirmasiPada: row.dikonfirmasiPada,
    tahanSampai: row.tahanSampai,
    tagihanId: row.tagihanId,
    buktiPemesananId: row.buktiPemesananId,
    aktifPada: row.aktifPada,
    masaPembatalanBerakhirPada: row.masaPembatalanBerakhirPada,
    alasan: alasanTerencana(row),
  };
}

/** The reason a Terencana order ended, worded for whoever reads it: a decline's off the closed list, a cancellation's off the module's own. */
export function alasanTerencana(row: Pick<Row, "alasanTolak" | "alasan">): string | null {
  return alasanOrder(row.alasanTolak, alasanBatalTerencana(row.alasan) ?? row.alasan);
}
