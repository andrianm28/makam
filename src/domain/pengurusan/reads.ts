/**
 * Reading one Pengurusan order back, as its own Pemesan reads it (spec, story
 * 28's order page, and the screen a night submission lands on: the computed
 * confirmation time, both document sets and the Pemegang Hak named for the IPTM).
 * Since the confirmation (ticket 45) the same read carries what the family is
 * told to expect: the agreed burial, both contacts, the price lines and the
 * Tagihan.
 *
 * The read is the Pemesan's own, checked here as well as in the guard: a
 * `pemesanAccountId` that is not that Akun's is no order of theirs, and an
 * order placed for a family by CS with no Akun attached is nobody's to read.
 *
 * The Tagihan's own total and due date are Billing's facts and are read through
 * its public function, never restated here: the figure the family reads on this
 * page is the figure the Tagihan carries, because it is that Tagihan.
 */
import { desc, eq } from "drizzle-orm";
import type { PengurusanDeps } from "./deps";
import { pengurusanTpu, type HargaBaris, type KontakTpu, type PengurusanTpuStatus } from "./schema";
import type { DokumenPemakamanDanPengajuan, JenisPenguburan, Kelayakan, KuburanTpu, PemegangHak } from "./skema-pengurusan";

/** One Saat Duka TPU order, as its own Pemesan reads it. */
export interface PengurusanOrder {
  /** The order's own id: what the Antrean row and the Ambil claim are keyed on, and what a family page looks its own order up by. */
  id: string;
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
   * order always carries one, and it is counted again when another TPU is
   * offered and accepted.
   */
  konfirmasiDueAt: Date | null;
  /**
   * The pay-after Tagihan issued at the confirmation, with Billing's own total
   * and due date; null while none is issued, since nothing is billed at
   * submission.
   */
  tagihan: { id: string; nomor: string; total: number; dueAt: Date; link: string } | null;
  /** The burial agreed with the TPU; null until the confirmation. */
  pemakamanAt: Date | null;
  /** The TPU's own office contact, as recorded at the confirmation. */
  kontakTpu: KontakTpu | null;
  /** The Admin Platform who took the order, the person the family may call. */
  adminPlatform: { name: string; phoneNumber: string | null } | null;
  /** The price lines the Tagihan carried, as the confirmation quoted them. */
  harga: HargaBaris[] | null;
  /** The one line Admin Platform added for this family; null while none. */
  catatanKonfirmasi: string | null;
  /** The TPU offered instead, while the family has not answered; null when none is open. */
  tawaran: { tpu: { id: string; name: string; address: string }; alasan: string } | null;
  /** Why the order was cancelled, or a filing rejected; null while none. */
  alasan: string | null;
  diajukanAt: Date;
}

type Row = typeof pengurusanTpu.$inferSelect;

/**
 * One order of that Akun, by its Nomor Pemesanan, or null. Only a Saat Duka TPU
 * order is read here: the Perpanjangan TPU and Pengurusan IPTM kinds arrive with
 * their tickets.
 */
export async function orderOf(
  deps: Pick<PengurusanDeps, "db" | "billing">,
  pemesan: { accountId: string },
  nomor: string,
): Promise<PengurusanOrder | null> {
  const [row] = await deps.db.select().from(pengurusanTpu).where(eq(pengurusanTpu.nomor, nomor));
  if (!row || row.pemesanAccountId !== pemesan.accountId) return null;
  const tagihan = row.tagihanId ? await deps.billing.tagihan(row.tagihanId) : null;
  return toOrder(row, tagihan);
}

/**
 * Every Pengurusan order of that Akun, newest first (Akun Saya's Pesanan tab,
 * ticket 27, spec story 100): the Saat Duka TPU orders it placed, alongside
 * that Akun's Pemesanan Makam orders — one Nomor Pemesanan series, one list.
 */
export async function pesananSaya(deps: Pick<PengurusanDeps, "db" | "billing">, pemesan: { accountId: string }): Promise<PengurusanOrder[]> {
  const rows = await deps.db
    .select()
    .from(pengurusanTpu)
    .where(eq(pengurusanTpu.pemesanAccountId, pemesan.accountId))
    .orderBy(desc(pengurusanTpu.diajukanAt));
  return Promise.all(
    rows.map(async (row) => toOrder(row, row.tagihanId ? await deps.billing.tagihan(row.tagihanId) : null)),
  );
}

/** The same order as Admin Platform reads it before confirming it (the Tier 1 row's page). */
export async function orderForStaff(
  deps: Pick<PengurusanDeps, "db" | "billing">,
  nomor: string,
): Promise<PengurusanOrder | null> {
  const [row] = await deps.db.select().from(pengurusanTpu).where(eq(pengurusanTpu.nomor, nomor));
  if (!row) return null;
  const tagihan = row.tagihanId ? await deps.billing.tagihan(row.tagihanId) : null;
  return toOrder(row, tagihan);
}

function toOrder(row: Row, tagihan: { total: number; dueAt: Date; link: string } | null): PengurusanOrder {
  return {
    id: row.id,
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
    tagihan: row.tagihanId && row.tagihanNomor && tagihan
      ? { id: row.tagihanId, nomor: row.tagihanNomor, total: tagihan.total, dueAt: tagihan.dueAt, link: tagihan.link }
      : null,
    pemakamanAt: row.pemakamanAt,
    kontakTpu: row.kontakTpu,
    adminPlatform: row.adminPlatformName
      ? { name: row.adminPlatformName, phoneNumber: row.adminPlatformPhoneNumber }
      : null,
    harga: row.harga,
    catatanKonfirmasi: row.catatanKonfirmasi,
    tawaran:
      row.status === "diajukan" && row.tpuDitawarkanId && row.tpuDitawarkanName
        ? {
            tpu: { id: row.tpuDitawarkanId, name: row.tpuDitawarkanName, address: row.tpuDitawarkanAddress ?? "" },
            alasan: row.alasanTpuDitawarkan ?? "",
          }
        : null,
    alasan: row.alasan,
    diajukanAt: row.diajukanAt,
  };
}
