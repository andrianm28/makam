/**
 * Reading one Pemesanan Makam for its family (spec, Pemesanan): the order page
 * behind a Nomor Pemesanan, with the status track it runs through, so a family
 * can follow the order itself.
 */
import { and, eq } from "drizzle-orm";
import { pemesananMakam, type PemegangHak, type PemesananKind, type PemesananStatus } from "./schema";
import type { PemesananDeps } from "./deps";

/** The statuses each kind of Pemesanan Makam runs through, in order (spec, Pemesanan (Lokasi Mitra)). */
const tracks: Record<PemesananKind, readonly PemesananStatus[]> = {
  saat_duka: ["diajukan", "dikonfirmasi", "dimakamkan", "selesai"],
  terencana: ["diajukan", "dikonfirmasi", "selesai"],
  tumpang: ["diajukan", "dikonfirmasi", "dimakamkan", "selesai"],
};

/** One Pemesanan Makam as its own Pemesan reads it. */
export interface PemesananOrder {
  nomor: string;
  kind: PemesananKind;
  status: PemesananStatus;
  /** The statuses this kind runs through, in order, for the timeline. */
  track: readonly PemesananStatus[];
  /** The Lokasi Mitra as it was named at submission, with its id for its page. */
  lokasi: { id: string; name: string };
  /** The Jenis Makam as it was named at submission; null for a TPU order, which has no plot. */
  jenisMakam: { id: string; name: string } | null;
  pemesan: { name: string; email: string | null; phoneNumber: string | null };
  almarhum: { name: string; tanggalWafat: string };
  rencanaPemakamanAt: Date | null;
  keinginanPenempatan: string | null;
  pemegangHak: PemegangHak;
  /** The instant the Lokasi's Jam Operasional promised a confirmation by; null while it had none. */
  konfirmasiDueAt: Date | null;
  /** The Tagihan issued when the Lokasi confirmed; null until then. Nothing is billed at submission. */
  tagihanId: string | null;
  /** Why the Lokasi declined, or the family / CS cancelled; null while none. */
  alasan: string | null;
  diajukanAt: Date;
}

/**
 * One Pemesanan Makam of that Akun, by its Nomor Pemesanan, or null when no
 * such order is theirs: the module reads only its own rows, never another's.
 * No actor: the caller has already established who is asking (the guard's
 * `pemesanan.lihat` on the Akun's own orders).
 */
export async function orderOf(
  deps: Pick<PemesananDeps, "db">,
  pemesan: { accountId: string },
  nomor: string,
): Promise<PemesananOrder | null> {
  const [row] = await deps.db
    .select()
    .from(pemesananMakam)
    .where(and(eq(pemesananMakam.nomor, nomor), eq(pemesananMakam.pemesanAccountId, pemesan.accountId)));
  if (!row) return null;
  return {
    nomor: row.nomor,
    kind: row.kind,
    status: row.status,
    track: tracks[row.kind],
    lokasi: { id: row.lokasiId, name: row.lokasiName },
    jenisMakam: row.jenisMakamId && row.jenisMakamName ? { id: row.jenisMakamId, name: row.jenisMakamName } : null,
    pemesan: { name: row.pemesanName, email: row.email, phoneNumber: row.phoneNumber },
    almarhum: { name: row.almarhumName, tanggalWafat: row.tanggalWafat },
    rencanaPemakamanAt: row.rencanaPemakamanAt,
    keinginanPenempatan: row.keinginanPenempatan,
    pemegangHak: row.pemegangHak,
    konfirmasiDueAt: row.konfirmasiDueAt,
    tagihanId: row.tagihanId,
    alasan: row.alasan,
    diajukanAt: row.diajukanAt,
  };
}
