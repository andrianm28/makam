/**
 * The orders a Lokasi Mitra still has running (ticket 59): a Pemesanan Terencana that is Diajukan, Dikonfirmasi or
 * Aktif, and a Saat Duka order that is Diajukan or Dikonfirmasi. When the Lokasi goes Berhenti the families named
 * here are told, and the Aktif Terencana ones have their held Hak Pakai Pencairan released.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import type { PemesananDeps } from "./deps";
import { pemesananMakam, pemesananTerencana } from "./schema";

export interface PesananBerjalan {
  nomor: string;
  kind: "terencana" | "saat_duka";
  status: string;
  /** Where the family's messages go; null for an order CS placed with no email. */
  email: string | null;
}

/** The Nomor Pemesanan of the Pemesanan Terencana a Lokasi has paid and Aktif: the ones whose held Pencairan a Berhenti releases. */
export async function nomorTerencanaAktifDiLokasi(deps: Pick<PemesananDeps, "db">, lokasiId: string): Promise<string[]> {
  const rows = await deps.db
    .select({ nomor: pemesananTerencana.nomor })
    .from(pemesananTerencana)
    .where(and(eq(pemesananTerencana.lokasiId, lokasiId), eq(pemesananTerencana.status, "aktif")))
    .orderBy(asc(pemesananTerencana.nomor));
  return rows.map((row) => row.nomor);
}

export async function pesananBerjalanDiLokasi(deps: Pick<PemesananDeps, "db">, lokasiId: string): Promise<PesananBerjalan[]> {
  const terencana = await deps.db
    .select({ nomor: pemesananTerencana.nomor, status: pemesananTerencana.status, email: pemesananTerencana.email })
    .from(pemesananTerencana)
    .where(and(eq(pemesananTerencana.lokasiId, lokasiId), inArray(pemesananTerencana.status, ["diajukan", "dikonfirmasi", "aktif"])))
    .orderBy(asc(pemesananTerencana.nomor));
  const saatDuka = await deps.db
    .select({ nomor: pemesananMakam.nomor, status: pemesananMakam.status, email: pemesananMakam.email })
    .from(pemesananMakam)
    .where(and(eq(pemesananMakam.lokasiId, lokasiId), eq(pemesananMakam.kind, "saat_duka"), inArray(pemesananMakam.status, ["diajukan", "dikonfirmasi"])))
    .orderBy(asc(pemesananMakam.nomor));
  return [...terencana.map((row) => ({ ...row, kind: "terencana" as const })), ...saatDuka.map((row) => ({ ...row, kind: "saat_duka" as const }))];
}
