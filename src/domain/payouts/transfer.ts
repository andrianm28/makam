/**
 * Issuing a Bukti Pencairan (spec, Billing > Payouts: "Admin Platform transfers
 * by hand, uploads the proof and enters the date, which issues one Bukti
 * Pencairan"; ticket 32's AC 5).
 *
 * This is the one place money leaves the Operator, so it is the one place that
 * has to be safe when two people do the same thing at the same time. Three
 * things stand between it and a double payment, and all three are in the
 * database rather than in the UI:
 *
 * 1. **A row lock on every item, in a fixed order.** Two concurrent runs that
 *    pick the same item queue on that item's lock; the second one wakes up to
 *    find it `dicairkan` and refuses. Ordering the lock by id means two
 *    transfers that share several items cannot deadlock each other.
 * 2. **A one-way status.** `dicairkan` is terminal: nothing moves an item out
 *    of it again, so an item that has been paid can never be paid twice.
 * 3. **A unique index on `bukti_pencairan_item.item_id`.** Even a bug above
 *    this line cannot write a second Bukti line for one item — the database
 *    refuses it. The same is true of a Potongan, which `bukti_pencairan_potongan`
 *    keeps unique.
 *
 * Everything is one transaction, so a Bukti Pencairan with half its items, or
 * with a net that does not add up, does not exist: the number is taken inside
 * it (from Billing's own `BKP/YYYY/NNNNNN` series, `within` this transaction),
 * the items and the Potongan are marked in it, and a rolled-back issue gives the
 * number back.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Database } from "@/db/client";
import { refusable } from "@/db/unit-of-work";
import type { AuditLog } from "@/domain/audit";
import {
  currentHeader,
  documentLinkSchema,
  newDocumentLink,
  noHeader,
  type Billing,
  type DocumentHeader,
} from "@/domain/billing";
import { pencairanResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { OperatorSettings } from "@/domain/operator-settings";
import { documentExtension } from "@/lib/files/document-type";
import type { ReportError } from "@/lib/observability/report-error";
import { sumRupiah, type Rupiah } from "@/lib/rupiah";
import { wibDateOf } from "@/lib/time/jakarta";
import type { Clock } from "@/ports/clock";
import type { FileStore } from "@/ports/file-store";
import { recipientOf, type ItemRow } from "./baca";
import { penerimaText, type Penerima } from "./penerima";
import { buktiPencairan, buktiPencairanItem, buktiPencairanPotongan, pencairanItem, potongan } from "./schema";

/** The largest transfer proof accepted, 10 MB (the Server Action body limit is 11 MB). */
export const BUKTI_TRANSFER_MAX_BYTES = 10 * 1024 * 1024;

/** What the recipient is told about its transfer, sent after it is issued. */
export interface BuktiPencairanTerbit {
  recipient: Penerima;
  nomorBukti: string;
  /** The Bukti Pencairan page's absolute URL. */
  url: string;
  /** The date entered for the transfer (WIB "YYYY-MM-DD"). */
  ditransferPada: string;
  /** Whole rupiah transferred. */
  amount: Rupiah;
}

/** Sends the Bukti Pencairan's link to its recipient; Payouts owns the decision, the caller owns the channel. */
export type KirimBuktiPencairan = (bukti: BuktiPencairanTerbit) => Promise<void>;

export interface TransferDeps {
  db: Database;
  clock: Clock;
  audit: AuditLog;
  files: FileStore;
  operatorSettings: Pick<OperatorSettings, "current">;
  /** The document series and the Tagihan, inside the issuing transaction (`within`). */
  billing: Pick<Billing, "within">;
  /** The Bukti Pencairan page's absolute URL, which the recipient is sent and the PDF rendered from. */
  buktiUrl: (link: string) => string;
  kirimBukti: KirimBuktiPencairan;
  reportError?: ReportError;
}

export interface TerbitkanBuktiInput {
  /** The items this transfer covers, all of one recipient's. */
  itemIds: string[];
  /** The Potongan it nets; a Mitra Jasa's transfer may name none. */
  potonganIds?: string[];
  /** The transfer's date as Admin Platform entered it (WIB "YYYY-MM-DD"), never in the future. */
  ditransferPada: string;
  /** The uploaded proof of the transfer (a bank screenshot or slip). */
  bukti: { body: Uint8Array; contentType: string };
}

export type TerbitkanBuktiResult =
  | { ok: true; bukti: BuktiPencairan }
  | WriteRefusal
  | typeof noHeader
  | { ok: false; reason: "tidak_ditemukan" }
  /** Nothing to transfer: no item, or a malformed id. */
  | { ok: false; reason: "item_tidak_valid" }
  /** One of the items is not due, is held out, or has already been transferred by someone else. */
  | { ok: false; reason: "item_tidak_tersedia" }
  /** The items are not all one recipient's, so no single transfer can cover them. */
  | { ok: false; reason: "item_beda_penerima" }
  /** A Potongan is not `berjalan`, belongs to another Lokasi Mitra, or was taken by another transfer. */
  | { ok: false; reason: "potongan_tidak_tersedia" }
  /** A Potongan was named for a Mitra Jasa, which the spec never allows. */
  | { ok: false; reason: "potongan_ke_mitra_jasa_tidak_boleh" }
  /** The items come to Rp 0 after the adjustment: there is no transfer to make. */
  | { ok: false; reason: "tidak_ada_yang_ditransfer" }
  /**
   * The Potongan come to more than the items. The owner's decision (recorded in
   * the ticket's Comments): this is refused, and Admin Platform settles such a
   * debt on the offline path instead, so no negative transfer is ever made.
   */
  | { ok: false; reason: "netto_negatif" }
  | { ok: false; reason: "tanggal_tidak_valid" }
  | { ok: false; reason: "berkas_tidak_didukung" }
  /** The items together would pass Rp 100.000.000.000, the largest amount anywhere in makam.co.id. */
  | { ok: false; reason: "jumlah_terlalu_besar" };

/** A Bukti Pencairan as the Admin Lokasi view and the issue itself read it. */
export interface BuktiPencairan {
  id: string;
  /** `BKP/2026/000123`, from Billing's one document series. */
  nomorBukti: string;
  /** The unguessable part of the Bukti Pencairan page's link. */
  link: string;
  recipient: Penerima;
  /** Whole rupiah: what left the bank. */
  amount: Rupiah;
  /** The transfer's date as it was entered (WIB "YYYY-MM-DD"). */
  ditransferPada: string;
  dibuatPada: Date;
  /** How many items and how many Potongan it covers, as the document's heading reads. */
  itemCount: number;
  potonganCount: number;
  items: { label: string; amount: Rupiah; nomorPemesanan: string | null }[];
  potongan: { amount: Rupiah; alasan: string }[];
  header: DocumentHeader;
}

/**
 * What an unguessable link shows. The two variants are the point of AC 7: a
 * Mitra Jasa's Bukti Pencairan carries **only** the job, the Layanan, the date
 * and the rate, so the type itself cannot leak an order number, a Lokasi or a
 * family — not by a filter that could be forgotten, but by having no field for it.
 */
export type DokumenBuktiPencairan =
  | {
      type: "bukti_pencairan";
      nomorBukti: string;
      link: string;
      recipient: { lokasiId: string; nama: string };
      amount: Rupiah;
      ditransferPada: string;
      header: DocumentHeader;
      items: { label: string; amount: Rupiah; nomorPemesanan: string | null }[];
      /** The Potongan the transfer netted, so the Lokasi can reconcile the amount. */
      potongan: { amount: Rupiah; alasan: string }[];
    }
  | {
      type: "bukti_pencairan_mitra_jasa";
      nomorBukti: string;
      link: string;
      recipient: { nama: string };
      amount: Rupiah;
      ditransferPada: string;
      header: DocumentHeader;
      pekerjaan: { pekerjaan: string; layanan: string | null; tanggal: string | null; tarif: Rupiah }[];
    };

/**
 * Issues the one Bukti Pencairan of a transfer: the number from Billing's `BKP`
 * series, the items and Potongan it covers, the date and the proof. See the
 * file header for the three guards against paying twice.
 */
export async function terbitkanBuktiPencairan(
  deps: TransferDeps,
  by: Actor,
  input: TerbitkanBuktiInput,
): Promise<TerbitkanBuktiResult> {
  const refusal = writeRefusal(by, "pencairan.kelola", pencairanResource());
  if (refusal) return refusal;
  const header = await currentHeader(deps.operatorSettings);
  if (!header) return noHeader;

  const now = deps.clock.now();
  const tanggal = tanggalTransfer(input.ditransferPada, now);
  if (!tanggal) return { ok: false, reason: "tanggal_tidak_valid" };
  const extension = documentExtension(input.bukti, ["application/pdf", "image/jpeg", "image/png"]);
  if (!extension || input.bukti.body.byteLength === 0 || input.bukti.body.byteLength > BUKTI_TRANSFER_MAX_BYTES) {
    return { ok: false, reason: "berkas_tidak_didukung" };
  }
  const itemIds = uniq(input.itemIds);
  const potonganIds = uniq(input.potonganIds ?? []);
  if (itemIds.length === 0 || !itemIds.every((id) => z.uuid().safeParse(id).success)) return { ok: false, reason: "item_tidak_valid" };
  if (!potonganIds.every((id) => z.uuid().safeParse(id).success)) return { ok: false, reason: "potongan_tidak_tersedia" };

  // The file goes to the private FileStore first, exactly as an agreement scan
  // does: a Bukti Pencairan without its proof is not a Bukti Pencairan, and a
  // refused transfer leaves no file behind.
  const key = `pencairan/${randomUUID()}.${extension}`;
  try {
    await deps.files.put({ key, body: input.bukti.body, contentType: input.bukti.contentType });
  } catch {
    return { ok: false, reason: "berkas_tidak_didukung" };
  }

  const hasil = await refusable<TerbitkanBuktiResult>(deps.db, async (tx) => issueIn(deps, tx, by, { itemIds, potonganIds, tanggal, key, header }, now));
  if (!hasil.ok) {
    await deps.files.delete(key).catch(() => undefined);
    return hasil;
  }

  // The recipient hears about its money after the Bukti exists, never inside the
  // transaction: a failed message must not undo a transfer that really happened.
  const terima: BuktiPencairanTerbit = {
    recipient: hasil.bukti.recipient,
    nomorBukti: hasil.bukti.nomorBukti,
    url: deps.buktiUrl(hasil.bukti.link),
    ditransferPada: tanggal,
    amount: hasil.bukti.amount,
  };
  try {
    await deps.kirimBukti(terima);
  } catch (error) {
    deps.reportError?.(error instanceof Error ? error : new Error(String(error)), {
      tags: { module: "payouts", event: "bukti_pencairan_gagal_dikirim", nomorBukti: hasil.bukti.nomorBukti },
    });
  }
  return hasil;
}

interface IssueIn {
  itemIds: string[];
  potonganIds: string[];
  tanggal: string;
  key: string;
  header: DocumentHeader;
}

async function issueIn(
  deps: TransferDeps,
  tx: Database,
  by: Actor,
  input: IssueIn,
  now: Date,
): Promise<TerbitkanBuktiResult> {
  // 1. Lock every item, in id order, so two concurrent transfers of the same
  //    items queue instead of colliding.
  const items = await tx
    .select()
    .from(pencairanItem)
    .where(inArray(pencairanItem.id, input.itemIds))
    .orderBy(asc(pencairanItem.id))
    .for("update");
  if (items.length === 0) return { ok: false, reason: "tidak_ditemukan" };
  if (items.length !== input.itemIds.length) return { ok: false, reason: "tidak_ditemukan" };
  for (const item of items) {
    // One-way: a `dicairkan` item is never paid again, and a held-out one is not
    // paid at all until Admin Platform puts it back.
    if (item.status !== "jatuh_tempo" || item.tahanAlasan !== null) return { ok: false, reason: "item_tidak_tersedia" };
  }
  const recipient = satuPenerima(items);
  if (!recipient) return { ok: false, reason: "item_beda_penerima" };

  // 2. The net, before anything is written.
  const jumlah = sumRupiah(items.map((item) => (item.jumlahDisesuaikan ?? item.amount) as Rupiah));
  if (!jumlah.ok) return { ok: false, reason: "jumlah_terlalu_besar" };
  if (jumlah.amount === 0) return { ok: false, reason: "tidak_ada_yang_ditransfer" };

  // 3. The Potongan it nets: the same Lokasi Mitra's, `berjalan`, oldest first.
  const rows = await tx
    .select()
    .from(potongan)
    .where(inArray(potongan.id, input.potonganIds))
    .orderBy(asc(potongan.id))
    .for("update");
  if (input.potonganIds.length > 0 && recipient.kind === "mitra_jasa") {
    return { ok: false, reason: "potongan_ke_mitra_jasa_tidak_boleh" };
  }
  if (rows.length !== input.potonganIds.length) return { ok: false, reason: "potongan_tidak_tersedia" };
  const urut = [...rows].sort((a, b) => a.dibuatPada.getTime() - b.dibuatPada.getTime());
  for (const row of urut) {
    if (recipient.kind !== "lokasi_mitra" || row.lokasiId !== recipient.lokasiId) {
      return { ok: false, reason: "potongan_tidak_tersedia" };
    }
    if (row.status !== "berjalan") return { ok: false, reason: "potongan_tidak_tersedia" };
    if (row.amount - row.terpotongSebesar <= 0) return { ok: false, reason: "potongan_tidak_tersedia" };
  }
  // What the named Potongan still owe between them: a debt larger than the whole
  // transfer is never netted into it, because the owner's decision is that such a
  // debt is settled on the offline path — no transfer of a negative amount is made.
  const owed = sumRupiah(urut.map((row) => (row.amount - row.terpotongSebesar) as Rupiah));
  if (!owed.ok) return { ok: false, reason: "jumlah_terlalu_besar" };
  if (owed.amount > jumlah.amount) return { ok: false, reason: "netto_negatif" };
  const terpotong: { row: (typeof rows)[number]; dipotong: Rupiah }[] = [];
  let sisa = jumlah.amount;
  for (const row of urut) {
    const dipotong = Math.min((row.amount - row.terpotongSebesar) as Rupiah, sisa) as Rupiah;
    terpotong.push({ row, dipotong });
    sisa = (sisa - dipotong) as Rupiah;
  }
  // The Potongan swallow the transfer exactly: nothing is left to send, and an
  // amount of Rp 0 is not a transfer.
  if (sisa === 0) return { ok: false, reason: "tidak_ada_yang_ditransfer" };
  const netto = sisa as Rupiah;

  // 4. The Bukti Pencairan, in this transaction, numbered from Billing's series.
  const nomor = await deps.billing.within(tx).nextDocumentNumber("BKP");
  const link = newDocumentLink();
  const [bukti] = await tx
    .insert(buktiPencairan)
    .values({
      nomor,
      link,
      penerimaKind: recipient.kind,
      lokasiId: recipient.lokasiId,
      penerimaNama: recipient.nama,
      penerimaAkunId: recipient.kind === "mitra_jasa" ? recipient.akunId : null,
      amount: netto,
      itemCount: items.length,
      potonganCount: terpotong.length,
      ditransferPada: input.tanggal,
      buktiTransferKey: input.key,
      header: input.header,
      dibuatPada: now,
    })
    .returning({ id: buktiPencairan.id });
  await tx.insert(buktiPencairanItem).values(
    items.map((item) => ({
      buktiId: bukti.id,
      itemId: item.id,
      label: item.label,
      amount: (item.jumlahDisesuaikan ?? item.amount) as Rupiah,
      nomorPemesanan: item.nomorPemesanan,
    })),
  );
  if (terpotong.length > 0) {
    await tx.insert(buktiPencairanPotongan).values(
      terpotong.map(({ row, dipotong }) => ({ buktiId: bukti.id, potonganId: row.id, amount: dipotong, alasan: row.alasan })),
    );
    for (const { row, dipotong } of terpotong) {
      const jumlahDitotong = (row.terpotongSebesar + dipotong) as Rupiah;
      const habis = jumlahDitotong >= row.amount;
      await tx
        .update(potongan)
        .set(
          habis
            ? { status: "terpotong", terpotongSebesar: jumlahDitotong, tercatatPada: now, dicatatOleh: by.accountId }
            : { terpotongSebesar: jumlahDitotong },
        )
        .where(eq(potongan.id, row.id));
    }
  }

  // 5. The items are settled. The status is one-way and the lock is held, so
  //    this can only ever move them from `jatuh_tempo` to `dicairkan`.
  await tx
    .update(pencairanItem)
    .set({ status: "dicairkan", dicairkanPada: now, tahanAlasan: null, tahanPada: null, tahanOleh: null })
    .where(and(inArray(pencairanItem.id, input.itemIds), eq(pencairanItem.status, "jatuh_tempo")));

  await deps.audit.staffWrite(tx, async (auditTx, record) => {
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "pencairan.terbitkan_bukti",
      entity: { kind: "bukti_pencairan", id: bukti.id },
      lokasiId: recipient.kind === "lokasi_mitra" ? recipient.lokasiId : null,
      before: null,
      after: {
        nomor,
        penerima: penerimaText(recipient),
        amount: netto,
        items: items.length,
        potongan: terpotong.length,
        ditransferPada: input.tanggal,
      },
      reason: null,
    });
    return { ok: true } as const;
  });

  // Read inside this transaction: the Bukti exists only once this commits, so a
  // read on the outer connection would find nothing yet.
  const dibaca = await buktiById(tx, bukti.id);
  if (!dibaca) throw new Error("the Bukti Pencairan just issued was not found");
  return { ok: true, bukti: dibaca };
}

/** Every item of one transfer belongs to one recipient, or the transfer is refused. */
function satuPenerima(items: readonly ItemRow[]): Penerima | null {
  const first = recipientOf(items[0]);
  const same = items.every((item) => {
    const other = recipientOf(item);
    if (other.kind !== first.kind) return false;
    return first.kind === "lokasi_mitra" && other.kind === "lokasi_mitra"
      ? other.lokasiId === first.lokasiId
      : other.kind === "mitra_jasa" && first.kind === "mitra_jasa" && other.akunId === first.akunId;
  });
  return same ? first : null;
}

/** The transfer's date: a real WIB date, today included, never in the future. */
function tanggalTransfer(value: string, now: Date): string | null {
  const parsed = z.iso.date().safeParse(value);
  if (!parsed.success) return null;
  const hariIni = wibDateOf(now);
  return parsed.data <= hariIni ? parsed.data : null;
}

const uniq = (values: readonly string[]): string[] => [...new Set(values)];

/** The Bukti Pencairan of an id, as the Admin Lokasi view and the issue itself read it. */
export async function buktiById(db: Database, buktiId: string): Promise<BuktiPencairan | null> {
  const [row] = await db.select().from(buktiPencairan).where(eq(buktiPencairan.id, buktiId));
  if (!row) return null;
  const items = await db
    .select({
      label: buktiPencairanItem.label,
      amount: buktiPencairanItem.amount,
      nomorPemesanan: buktiPencairanItem.nomorPemesanan,
    })
    .from(buktiPencairanItem)
    // The order the lines were issued in, which is the order the Bukti repeats them.
    .innerJoin(pencairanItem, eq(pencairanItem.id, buktiPencairanItem.itemId))
    .where(eq(buktiPencairanItem.buktiId, row.id))
    .orderBy(asc(pencairanItem.tagihanPosisi), asc(buktiPencairanItem.label));
  const potonganRows = await db.select().from(buktiPencairanPotongan).where(eq(buktiPencairanPotongan.buktiId, row.id));
  return {
    id: row.id,
    nomorBukti: row.nomor,
    link: row.link,
    recipient: row.penerimaKind === "mitra_jasa"
      ? { kind: "mitra_jasa", akunId: row.penerimaAkunId ?? "", nama: row.penerimaNama, lokasiId: row.lokasiId }
      : { kind: "lokasi_mitra", lokasiId: row.lokasiId ?? "", nama: row.penerimaNama },
    amount: row.amount,
    ditransferPada: row.ditransferPada,
    dibuatPada: row.dibuatPada,
    itemCount: row.itemCount,
    potonganCount: row.potonganCount,
    items,
    potongan: potonganRows.map((entry) => ({ amount: entry.amount, alasan: entry.alasan })),
    header: row.header as DocumentHeader,
  };
}

/** The document behind an unguessable link, with the Mitra Jasa version limited to what a Mitra Jasa may see (AC 7). */
export async function buktiPencairanByLink(db: Database, link: string): Promise<DokumenBuktiPencairan | null> {
  if (!documentLinkSchema.safeParse(link).success) return null;
  const [row] = await db.select().from(buktiPencairan).where(eq(buktiPencairan.link, link));
  if (!row) return null;
  const items = await db
    .select({
      label: buktiPencairanItem.label,
      amount: buktiPencairanItem.amount,
      nomorPemesanan: buktiPencairanItem.nomorPemesanan,
      pekerjaanLabel: pencairanItem.pekerjaanLabel,
      layananNama: pencairanItem.layananNama,
      tanggalLayanan: pencairanItem.tanggalLayanan,
    })
    .from(buktiPencairanItem)
    .innerJoin(pencairanItem, eq(pencairanItem.id, buktiPencairanItem.itemId))
    .where(eq(buktiPencairanItem.buktiId, row.id))
    .orderBy(asc(buktiPencairanItem.label));
  const potonganRows = await db.select().from(buktiPencairanPotongan).where(eq(buktiPencairanPotongan.buktiId, row.id));
  const header = row.header as DocumentHeader;
  if (row.penerimaKind === "mitra_jasa") {
    // A Mitra Jasa's Bukti Pencairan shows the job, the Layanan, the date and
    // the rate, and nothing else: no order number, no Lokasi, no family.
    return {
      type: "bukti_pencairan_mitra_jasa",
      nomorBukti: row.nomor,
      link: row.link,
      recipient: { nama: row.penerimaNama },
      amount: row.amount,
      ditransferPada: row.ditransferPada,
      header,
      pekerjaan: items.map((item) => ({
        pekerjaan: item.pekerjaanLabel ?? item.label,
        layanan: item.layananNama,
        tanggal: item.tanggalLayanan,
        tarif: item.amount,
      })),
    };
  }
  return {
    type: "bukti_pencairan",
    nomorBukti: row.nomor,
    link: row.link,
    recipient: { lokasiId: row.lokasiId ?? "", nama: row.penerimaNama },
    amount: row.amount,
    ditransferPada: row.ditransferPada,
    header,
    items: items.map((item) => ({ label: item.label, amount: item.amount, nomorPemesanan: item.nomorPemesanan })),
    potongan: potonganRows.map((entry) => ({ amount: entry.amount, alasan: entry.alasan })),
  };
}
