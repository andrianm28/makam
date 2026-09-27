/**
 * Reading one Pemesanan Makam for its family (spec, Pemesanan): the order page
 * behind a Nomor Pemesanan, with the status track it runs through, so a family
 * can follow the order itself.
 */
import { and, eq } from "drizzle-orm";
import { pemesananBerkas, pemesananMakam, type PemegangHak, type PemesananKind, type PemesananStatus } from "./schema";
import type { PemesananDeps } from "./deps";
import type { DokumenOrder } from "./reads-staf";

/** The statuses each kind of Pemesanan Makam runs through, in order (spec, Pemesanan (Lokasi Mitra)). */
const tracks: Record<PemesananKind, readonly PemesananStatus[]> = {
  saat_duka: ["diajukan", "dikonfirmasi", "dimakamkan", "selesai"],
  terencana: ["diajukan", "dikonfirmasi", "selesai"],
  tumpang: ["diajukan", "dikonfirmasi", "dimakamkan", "selesai"],
};

/** The statuses that end a Pemesanan Makam where it stands, short of the steps it never took. */
const endings: readonly PemesananStatus[] = ["ditolak", "dibatalkan"];

/** One step of the order page's timeline, and whether the order has reached it. */
export interface LangkahOrder {
  status: PemesananStatus;
  tercapai: boolean;
}

/**
 * The steps a Pemesanan Makam of that kind shows at that status, oldest first,
 * with the ones behind the current one reached. A Ditolak or Dibatalkan order
 * shows the steps it did take and the ending, never the ones it never reached,
 * so a rejected order never reads as one that reached Dimakamkan.
 */
export function timelineOrder(kind: PemesananKind, status: PemesananStatus): LangkahOrder[] {
  const track = tracks[kind];
  const langkah = endings.includes(status) && !track.includes(status) ? [track[0], status] : [...track];
  const sampai = langkah.indexOf(status);
  return langkah.map((satu, index) => ({ status: satu, tercapai: sampai >= 0 && index <= sampai }));
}

/** One Pemesanan Makam as its own Pemesan reads it. */
export interface PemesananOrder {
  nomor: string;
  kind: PemesananKind;
  status: PemesananStatus;
  /** The steps this order's timeline shows, with the ones behind its status reached. */
  langkah: readonly LangkahOrder[];
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
  /**
   * What the Lokasi's confirmation assigned: the Petak Makam and the burial the
   * two agreed. Null until the order is Dikonfirmasi (spec, story 29).
   */
  pemakaman: { petakNomor: string; at: Date } | null;
  /** The day the burial was actually recorded, once it was; what the Hak Pakai's term counts from (ticket 25). */
  pemakamanTanggal: string | null;
  /** The Tagihan issued when the Lokasi confirmed; null until then. Nothing is billed at submission. */
  tagihanId: string | null;
  /**
   * The Bukti Pemesanan issued when that Tagihan went Lunas: what proves the
   * right, by its number and its page's link. Null until the payment settles.
   */
  buktiPemesanan: { id: string; nomor: string; link: string } | null;
  /** The Lokasi Mitra's document checklist with what has arrived and what is ticked (spec, stories 29, 120). */
  dokumen: DokumenOrder[];
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
  deps: Pick<PemesananDeps, "db" | "lokasi" | "billing">,
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
    langkah: timelineOrder(row.kind, row.status),
    lokasi: { id: row.lokasiId, name: row.lokasiName },
    jenisMakam: row.jenisMakamId && row.jenisMakamName ? { id: row.jenisMakamId, name: row.jenisMakamName } : null,
    pemesan: { name: row.pemesanName, email: row.email, phoneNumber: row.phoneNumber },
    almarhum: { name: row.almarhumName, tanggalWafat: row.tanggalWafat },
    rencanaPemakamanAt: row.rencanaPemakamanAt,
    keinginanPenempatan: row.keinginanPenempatan,
    pemegangHak: row.pemegangHak,
    konfirmasiDueAt: row.konfirmasiDueAt,
    pemakaman: row.petakNomor && row.pemakamanAt ? { petakNomor: row.petakNomor, at: row.pemakamanAt } : null,
    pemakamanTanggal: row.pemakamanTanggal,
    tagihanId: row.tagihanId,
    buktiPemesanan: row.buktiPemesananId ? await buktiMilik(deps, row.buktiPemesananId) : null,
    dokumen: await dokumenMilik(deps, row.id, row.lokasiId),
    alasan: row.alasan,
    diajukanAt: row.diajukanAt,
  };
}

/** The order's Bukti Pemesanan, read back through Billing's own public read (the document is Billing's row). */
async function buktiMilik(
  deps: Pick<PemesananDeps, "billing">,
  buktiPemesananId: string,
): Promise<{ id: string; nomor: string; link: string } | null> {
  const bukti = await deps.billing.buktiPemesananById(buktiPemesananId);
  return bukti && { id: bukti.id, nomor: bukti.nomor, link: bukti.link };
}

/** The order's own documents, with the Lokasi Mitra's checklist items it has none of yet. */async function dokumenMilik(deps: Pick<PemesananDeps, "db" | "lokasi">, pemesananId: string, lokasiId: string): Promise<DokumenOrder[]> {
  const [rows, checklist] = await Promise.all([
    deps.db.select().from(pemesananBerkas).where(eq(pemesananBerkas.pemesananId, pemesananId)),
    deps.lokasi.documentChecklistOf(lokasiId),
  ]);
  const punya = new Map(rows.map((row) => [row.nama, row]));
  return checklist.map((nama) => {
    const row = punya.get(nama);
    return {
      nama,
      diunggah: row?.diunggahPada ? { at: row.diunggahPada, oleh: row.diunggahOleh ?? "" } : null,
      dicentang: row?.dicentangPada ? { at: row.dicentangPada, oleh: row.dicentangOleh ?? "" } : null,
    };
  });
}
