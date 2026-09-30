/**
 * Reading Pencairan (ticket 32's AC 6, 7, 8): the Antrean's Tier 3 row's own
 * query, the Admin Lokasi's per-order view, and a Mitra Jasa's own.
 *
 * Every read here is a projection of this module's own tables, and every one
 * leaves a row it cannot understand alone rather than throwing on it: the
 * upgrade seed (ticket 71) fills every table with rows it invented, and a query
 * that threw on one of them would take the Antrean and both views down with it.
 */
import { and, asc, desc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { authorize, lokasiMitraResource, type Actor } from "@/domain/identity";
import { sumRupiah, type Rupiah } from "@/lib/rupiah";
import { jumlahOf, toBarisItem, URUTAN_ITEM_JATUH_TEMPO, type BarisItemPencairan, type ItemRow } from "./baca";
import { penerimaKey } from "./penerima";
import { potonganOfLokasi, type BarisPotonganUmum } from "./potongan";
import { buktiPencairan, buktiPencairanItem, pencairanItem, type PencairanItemStatus } from "./schema";
import { buktiById, type BuktiPencairan } from "./transfer";

/** One recipient's open transfer: what the Antrean's Tier 3 row is a row of. */
export interface BarisJatuhTempo {
  /** The recipient's key, stable across releases: also half of the row's Ambil and Catatan Internal key. */
  recipientKey: string;
  recipient: { kind: "lokasi_mitra" | "mitra_jasa"; nama: string; lokasiId: string | null };
  /** How many items are waiting for this recipient. */
  itemCount: number;
  /** What they are owed, whole rupiah. */
  amount: Rupiah;
  /** 2 Hari Kerja after the earliest due item: the transfer's deadline. */
  jatuhTempoAt: Date;
}

/**
 * Every recipient with a transfer waiting, for the Antrean's Tier 3 "Pencairan"
 * row: one row per recipient, the way the work itself is (a transfer is per
 * recipient), with the earliest of its deadlines as the row's own.
 *
 * An item held out with a reason is **not** open work: Admin Platform has
 * already decided to hold it back, and a row would ask them to transfer
 * something they chose not to. Held items stay out and are shown in the run with
 * their reason instead, which is where the decision belongs.
 */
export async function pencairanJatuhTempo(db: Database): Promise<BarisJatuhTempo[]> {
  const items = (await db
    .select()
    .from(pencairanItem)
    .where(eq(pencairanItem.status, "jatuh_tempo"))
    .orderBy(...URUTAN_ITEM_JATUH_TEMPO)).filter((item) => item.tahanAlasan === null && item.jatuhTempoAt !== null);
  const rows = new Map<string, BarisJatuhTempo>();
  for (const item of items) {
    const key = keyOf(item);
    const jumlah = jumlahOf(item);
    const ada = rows.get(key);
    if (ada) {
      ada.itemCount += 1;
      const total = sumRupiah([ada.amount, jumlah]);
      if (total.ok) ada.amount = total.amount;
      if (item.jatuhTempoAt && item.jatuhTempoAt < ada.jatuhTempoAt) ada.jatuhTempoAt = item.jatuhTempoAt;
      continue;
    }
    rows.set(key, {
      recipientKey: key,
      recipient: { kind: item.penerimaKind, nama: item.penerimaNama, lokasiId: item.lokasiId },
      itemCount: 1,
      amount: jumlah,
      jatuhTempoAt: item.jatuhTempoAt as Date,
    });
  }
  return [...rows.values()].sort((a, b) => a.jatuhTempoAt.getTime() - b.jatuhTempoAt.getTime());
}

function keyOf(item: Pick<ItemRow, "penerimaKind" | "lokasiId" | "penerimaAkunId">): string {
  return penerimaKey({ kind: item.penerimaKind, lokasiId: item.lokasiId, akunId: item.penerimaAkunId });
}

/** The three states an order's Pencairan is in (spec, story 135: Belum jatuh tempo / Jatuh tempo / Dicairkan). */
export type StatusPencairanPesanan = "belum_jatuh_tempo" | "jatuh_tempo" | "dicairkan";

/** A Bukti Pencairan as a list names it, without its lines. */
export interface RingkasBukti {
  nomorBukti: string;
  link: string;
  ditransferPada: string;
  amount: Rupiah;
}

/** One order's Pencairan as its Lokasi Mitra's own Admin Lokasi sees it. */
export interface PencairanPerPesanan {
  nomorPemesanan: string;
  status: StatusPencairanPesanan;
  items: BarisItemPencairan[];
  /** Whole rupiah: what the order is owed, or what it was paid. */
  amount: Rupiah;
  /** The Bukti Pencairan that settled it, when it has been transferred. */
  bukti: RingkasBukti | null;
}

export interface PencairanLokasiResult {
  /** Every order of this Lokasi Mitra that has a Pencairan item, newest first. */
  pesanan: PencairanPerPesanan[];
  /** Every Bukti Pencairan this Lokasi Mitra received, newest transfer first, with its Potongan lines. */
  bukti: BuktiPencairan[];
  /** What this Lokasi Mitra still owes, whatever its state (AC 4). */
  potongan: BarisPotonganUmum[];
}

export type PencairanLokasi =
  | { ok: true; lokasi: PencairanLokasiResult }
  | { ok: false; reason: "tidak_berwenang" };

/**
 * One Lokasi Mitra's Pencairan (AC 8): per order whether it is Belum jatuh
 * tempo, Jatuh tempo or Dicairkan, and every Bukti Pencairan with the Potongan
 * lines it netted. **Nothing from any other Lokasi Mitra**: the check is against
 * the actor's own `lokasiIds`, so a foreign `lokasiId` is refused the same as an
 * unknown one and no other Lokasi's money is ever in the answer.
 */
export async function pencairanLokasi(db: Database, by: Actor, lokasiId: string): Promise<PencairanLokasi> {
  if (!authorize(by, "pencairan.lihat", lokasiMitraResource(lokasiId)).allowed) return { ok: false, reason: "tidak_berwenang" };
  const items = await db
    .select()
    .from(pencairanItem)
    .where(eq(pencairanItem.lokasiId, lokasiId))
    .orderBy(desc(pencairanItem.dibuatPada), asc(pencairanItem.tagihanPosisi), asc(pencairanItem.id));

  // The Bukti first, so each order can be shown the Bukti that settled it.
  const buktiIds = (
    await db
      .select({ id: buktiPencairan.id })
      .from(buktiPencairan)
      .where(and(eq(buktiPencairan.lokasiId, lokasiId), eq(buktiPencairan.penerimaKind, "lokasi_mitra")))
      .orderBy(desc(buktiPencairan.ditransferPada), desc(buktiPencairan.dibuatPada), asc(buktiPencairan.id))
  ).map((row) => row.id);
  const semuaBukti: BuktiPencairan[] = [];
  const buktiDariItem = new Map<string, RingkasBukti>();
  for (const id of buktiIds) {
    const bukti = await buktiById(db, id);
    if (!bukti) continue;
    semuaBukti.push(bukti);
    const ringkas: RingkasBukti = {
      nomorBukti: bukti.nomorBukti,
      link: bukti.link,
      ditransferPada: bukti.ditransferPada,
      amount: bukti.amount,
    };
    for (const line of bukti.items) {
      if (line.nomorPemesanan && !buktiDariItem.has(line.nomorPemesanan)) buktiDariItem.set(line.nomorPemesanan, ringkas);
    }
  }

  const pesanan = new Map<string, BarisItemPencairan[]>();
  for (const item of items) {
    const nomor = item.nomorPemesanan;
    // An item nothing is owed for any more (a refunded order, a share that took
    // it all) is not part of any order's state: it was never paid and never will be.
    if (!nomor || item.status === "dibatalkan") continue;
    const milik = pesanan.get(nomor) ?? [];
    milik.push(toBarisItem(item));
    pesanan.set(nomor, milik);
  }
  const daftarPesanan: PencairanPerPesanan[] = [];
  for (const [nomorPemesanan, baris] of pesanan) {
    const total = sumRupiah(baris.map((item) => item.amount));
    daftarPesanan.push({
      nomorPemesanan,
      status: statusOfItems(items.filter((item) => item.nomorPemesanan === nomorPemesanan && item.status !== "dibatalkan")),
      items: baris,
      amount: total.ok ? total.amount : (0 as Rupiah),
      bukti: buktiDariItem.get(nomorPemesanan) ?? null,
    });
  }

  return {
    ok: true,
    lokasi: {
      pesanan: daftarPesanan,
      bukti: semuaBukti,
      potongan: await potonganOfLokasi(db, lokasiId),
    },
  };
}

/**
 * The state one order's Pencairan is in: Dicairkan once every one of its items
 * has been transferred, Jatuh tempo while any of them waits to be, and Belum
 * jatuh tempo while all of them are still waiting for their own trigger.
 */
function statusOfItems(items: readonly ItemRow[]): StatusPencairanPesanan {
  const statuses = items.map((item) => item.status as PencairanItemStatus);
  if (statuses.length === 0) return "belum_jatuh_tempo";
  if (statuses.every((status) => status === "dicairkan")) return "dicairkan";
  if (statuses.some((status) => status === "jatuh_tempo")) return "jatuh_tempo";
  return "belum_jatuh_tempo";
}

/** What a Mitra Jasa is shown of its own job (spec, story 181: job, Layanan, date and rate only). */
export interface PekerjaanMitraJasa {
  itemId: string;
  /** The job's own reference. */
  pekerjaan: string;
  layanan: string | null;
  /** The target date (WIB "YYYY-MM-DD"). */
  tanggal: string | null;
  /** The Mitra Jasa rate, whole rupiah. */
  tarif: Rupiah;
  status: PencairanItemStatus;
  /** When it became due, or null while it has not. */
  dueAt: Date | null;
  /** 2 Hari Kerja after it became due. */
  jatuhTempoAt: Date | null;
  /** The Bukti Pencairan that paid it, when it has been. */
  bukti: RingkasBukti | null;
}

export type PencairanMitraJasa = { ok: true; pekerjaan: PekerjaanMitraJasa[] } | { ok: false; reason: "tidak_berwenang" };

/**
 * A Mitra Jasa's own Pencairan and Bukti Pencairan list (AC 7, story 181). Only
 * the four things about a job — the job, the Layanan, the date and the rate —
 * and only its own: another Mitra Jasa's account is never in the query, and an
 * order number, a Lokasi or a family is not on the item to begin with.
 */
export async function pencairanMitraJasa(db: Database, by: Actor): Promise<PencairanMitraJasa> {
  if (!authorize(by, "pencairan.punya_saya", { kind: "akun", accountId: by.accountId }).allowed) {
    return { ok: false, reason: "tidak_berwenang" };
  }
  const items = await db
    .select()
    .from(pencairanItem)
    .where(eq(pencairanItem.penerimaAkunId, by.accountId))
    .orderBy(asc(pencairanItem.dibuatPada), asc(pencairanItem.id));
  const itemsTerbayar = await db
    .select({
      itemId: buktiPencairanItem.itemId,
      nomorBukti: buktiPencairan.nomor,
      link: buktiPencairan.link,
      ditransferPada: buktiPencairan.ditransferPada,
    })
    .from(buktiPencairanItem)
    .innerJoin(buktiPencairan, eq(buktiPencairan.id, buktiPencairanItem.buktiId))
    .where(eq(buktiPencairan.penerimaAkunId, by.accountId));
  const buktiPerItem = new Map(itemsTerbayar.map((row) => [row.itemId, row]));
  return {
    ok: true,
    pekerjaan: items.map((item) => {
      const bukti = buktiPerItem.get(item.id);
      return {
        itemId: item.id,
        pekerjaan: item.pekerjaanLabel ?? item.label,
        layanan: item.layananNama,
        tanggal: item.tanggalLayanan,
        tarif: jumlahOf(item),
        status: item.status as PencairanItemStatus,
        dueAt: item.dueAt,
        jatuhTempoAt: item.jatuhTempoAt,
        bukti: bukti
          ? { nomorBukti: bukti.nomorBukti, link: bukti.link, ditransferPada: bukti.ditransferPada, amount: jumlahOf(item) }
          : null,
      };
    }),
  };
}
