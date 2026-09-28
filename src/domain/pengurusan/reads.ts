/**
 * Reading one Pengurusan order back, as its own Pemesan reads it (spec, story
 * 28's order page, and the screen a night submission lands on: the computed
 * confirmation time, both document sets and the Pemegang Hak named for the IPTM).
 *
 * The read is the Pemesan's own, checked here as well as in the guard: a
 * `pemesanAccountId` that is not that Akun's is no order of theirs, and an
 * order placed for a family by CS with no Akun attached is nobody's to read.
 */
import { eq } from "drizzle-orm";
import type { PengurusanDeps } from "./deps";
import { pengurusanTpu, type PengurusanTpuStatus } from "./schema";
import type { DokumenPemakamanDanPengajuan, JenisPenguburan, Kelayakan, KuburanTpu, PemegangHak } from "./skema-pengurusan";

/** One Saat Duka TPU order, as its own Pemesan reads it. */
export interface PengurusanOrder {
  nomor: string;
  kind: "saat_duka_tpu";
  status: PengurusanTpuStatus;
  tpu: { id: string; name: string; address: string };
  pemesan: { name: string; email: string | null; phoneNumber: string | null };
  almarhum: { name: string; tanggalWafat: string };
  jenisPenguburan: JenisPenguburan;
  /** The two eligibility answers the family gave; they decided the document set. */
  kelayakan: Kelayakan;
  /** The grave a Tumpang is made in; null for a Baru. */
  kuburan: KuburanTpu | null;
  /** The Pemegang Hak for the IPTM, as named at submission. */
  pemegangHak: PemegangHak;
  /** The two document sets this order carries, as it was placed. */
  dokumen: DokumenPemakamanDanPengajuan;
  /**
   * The instant the TPU window promised a confirmation by: two service hours
   * inside 06:00–18:00 WIB. Null for a kind that has no confirmation to promise
   * (a filing-only Pengurusan starts at Dimakamkan, ticket 47); a Saat Duka TPU
   * order always carries one.
   */
  konfirmasiDueAt: Date | null;
  /** The Tagihan issued at the confirmation; null until then. Nothing is billed at submission. */
  tagihanId: string | null;
  /** Why the order was cancelled, or a filing rejected; null while none. */
  alasan: string | null;
  diajukanAt: Date;
}

/**
 * One order of that Akun, by its Nomor Pemesanan, or null. Only a Saat Duka TPU
 * order is read here: the Perpanjangan TPU and Pengurusan IPTM kinds arrive with
 * their tickets.
 */
export async function orderOf(deps: Pick<PengurusanDeps, "db">, pemesan: { accountId: string }, nomor: string): Promise<PengurusanOrder | null> {
  const [row] = await deps.db.select().from(pengurusanTpu).where(eq(pengurusanTpu.nomor, nomor));
  if (!row || row.pemesanAccountId !== pemesan.accountId) return null;
  return {
    nomor: row.nomor,
    kind: "saat_duka_tpu",
    status: row.status,
    tpu: { id: row.tpuId, name: row.tpuName, address: row.tpuAddress },
    pemesan: { name: row.pemesanName, email: row.email, phoneNumber: row.phoneNumber },
    almarhum: { name: row.almarhumName, tanggalWafat: row.tanggalWafat },
    jenisPenguburan: row.jenisPenguburan,
    kelayakan: row.kelayakan,
    kuburan: row.kuburan,
    pemegangHak: row.pemegangHak,
    dokumen: { pemakaman: row.dokumenPemakaman, pengajuan: row.dokumenPengajuan },
    konfirmasiDueAt: row.konfirmasiDueAt,
    tagihanId: row.tagihanId,
    alasan: row.alasan,
    diajukanAt: row.diajukanAt,
  };
}
