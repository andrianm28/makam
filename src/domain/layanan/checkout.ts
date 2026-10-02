/**
 * Layanan at a booking checkout (spec, Layanan > Order; Billing > due rules; stories 23, 48; ticket 53).
 *
 * Three checkouts add Layanan to a Tagihan another module issues, and this module owns what each
 * may offer and when each job is due:
 *
 * - **Saat Duka (hari-H).** Only "bisa hari-H" items, for the burial day. They are billed pay-after on the
 *   Saat Duka Tagihan and take its due date; their jobs are Dijadwalkan when the order is confirmed, not
 *   when the family pays.
 * - **Terencana (empty plot).** Only "makes sense on an empty plot" items, only when a single plot is
 *   picked. Pay-first on the Terencana Tagihan, whose due date is the earliest of the hold expiry and the
 *   Layanan's own rule (Billing's `tagihanDue`).
 * - **Perpanjangan ("Tambah Layanan").** Any Layanan the Lokasi offers. The Tagihan keeps the Perpanjangan's
 *   3×24 h due date, so each item's target date must be at least its lead time after that due date: adding
 *   Layanan never shortens or endangers the Perpanjangan (exception to the earliest-due rule, 2026-09-25).
 *
 * The other module prices these items **in its own quote**, so the Tagihan carries one Biaya Layanan
 * Platform; this module checks and shapes the items (`siapkanCheckout`), turns the quote's lines into
 * Tagihan lines (`gabungkanBaris`) and writes the order and its jobs (`tulisCheckout`) on the
 * transaction the other module hands it, so they commit with the Tagihan or not at all.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { NewTagihanLine } from "@/domain/billing";
import type { QuoteLine, QuotedLine } from "@/domain/tariffs";
import { hargaLayananPartLabel } from "@/lib/layanan-labels";
import { addWibDateDays, wibDateOf } from "@/lib/time/jakarta";
import type { LayananDeps } from "./deps";
import { offeringsUntukOrder, penawaranUntukPesanan, type LayananUntukPesanan, type VarianUntukOrder } from "./harga";
import { itemCheckoutListSchema } from "./pesanan-schema";
import { targetPalingDini, tulisPesananLayanan, type ItemPesananLayanan, type KepalaPesananLayanan } from "./pesanan";
import { pekerjaanLayanan, pesananLayanan, pesananLayananItem } from "./schema";

/** Which booking checkout the Layanan are added to. */
export type ModeCheckout = "hari_h" | "petak_kosong" | "perpanjangan";

const bolehDiMode = (mode: ModeCheckout, varian: Pick<VarianUntukOrder, "bisaHariH" | "adaDiPetakKosong">): boolean =>
  mode === "hari_h" ? varian.bisaHariH : mode === "petak_kosong" ? varian.adaDiPetakKosong : true;

/**
 * The Layanan a Lokasi Mitra offers at this checkout, with each variant's own price alone (the one Biaya
 * Layanan Platform belongs to the Tagihan, so it is not in a variant's price).
 */
export async function penawaranCheckout(deps: LayananDeps, lokasiId: string, mode: ModeCheckout, at: Date): Promise<LayananUntukPesanan[]> {
  const semua = await penawaranUntukPesanan(deps, lokasiId, at);
  return semua.filter((grup) => bolehDiMode(mode, grup.layanan));
}

/** One item that has been checked against the offer, the date rules and the text it asks for. */
export interface ItemCheckout {
  varian: VarianUntukOrder;
  targetDate: string;
  teks: string | null;
}

export type SiapkanCheckoutResult =
  | { ok: true; item: ItemCheckout[]; quoteLines: QuoteLine[] }
  | {
      ok: false;
      reason:
        | "input_tidak_valid"
        /** Not offered at this Lokasi, not offered at this checkout, or with no price in force. */
        | "layanan_tidak_tersedia"
        /** A target date inside the Layanan's lead time (counted from today, or from the Perpanjangan's due date). */
        | "lead_time_melewati"
        | "teks_kosong"
        /** A date-picking checkout got an item with no date. */
        | "target_kosong";
    };

export interface SiapkanCheckoutInput {
  lokasiId: string;
  mode: ModeCheckout;
  items: unknown;
  at: Date;
  /** The burial day, the target of every hari-H item (required for `hari_h`). */
  hariPemakaman?: string;
  /** The Perpanjangan Tagihan's due date, which each item's lead time is counted from (required for `perpanjangan`). */
  batasBayar?: Date;
}

/**
 * Checks the items a family added at a checkout and returns them with the quote lines to price them by. Run at
 * submission (so the family is refused early) and again where the Tagihan is issued (so it is priced and dated
 * at the day it is issued, never at the day it was asked).
 */
export async function siapkanCheckout(deps: LayananDeps, input: SiapkanCheckoutInput): Promise<SiapkanCheckoutResult> {
  const parsed = itemCheckoutListSchema.safeParse(input.items);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  if (parsed.data.length === 0) return { ok: true, item: [], quoteLines: [] };

  const tersedia = await offeringsUntukOrder(deps, input.lokasiId, input.at);
  const item: ItemCheckout[] = [];
  for (const satu of parsed.data) {
    const varian = tersedia.find((kandidat) => kandidat.id === satu.layananVariantId);
    if (!varian || !bolehDiMode(input.mode, varian)) return { ok: false, reason: "layanan_tidak_tersedia" };
    const mauTeks = (varian.teksLabel ?? "") !== "";
    const teks = satu.teks?.trim() || null;
    if (mauTeks && teks === null) return { ok: false, reason: "teks_kosong" };

    let targetDate: string;
    if (input.mode === "hari_h") {
      if (!input.hariPemakaman) return { ok: false, reason: "target_kosong" };
      targetDate = input.hariPemakaman;
    } else {
      if (!satu.targetDate) return { ok: false, reason: "target_kosong" };
      targetDate = satu.targetDate;
      const paling = input.mode === "perpanjangan"
        ? addWibDateDays(wibDateOf(input.batasBayar ?? input.at), varian.leadTimeDays)
        : targetPalingDini(varian.leadTimeDays, input.at);
      if (targetDate < paling) return { ok: false, reason: "lead_time_melewati" };
    }
    item.push({ varian, targetDate, teks: mauTeks ? teks : null });
  }
  return {
    ok: true,
    item,
    quoteLines: item.map((satu) => ({ kind: "layanan_lokasi" as const, lokasiId: input.lokasiId, layananVariantId: satu.varian.id })),
  };
}

export type GabungkanBarisResult =
  | { ok: true; lines: NewTagihanLine[]; perBaris: { label: string; amount: number }[]; posisiAwal: number }
  | { ok: false; reason: "baris_tidak_bisa_ditagih" | "harga_tidak_tersedia" };

/**
 * The Tagihan lines of a quote that holds the other module's own lines and these Layanan: each Layanan line
 * becomes a `layanan` line carrying its target date and lead time (what `tagihanDue` counts from), every other
 * line is shaped by `lainnya`, which refuses (null) a kind its checkout cannot issue — a refusal, never a
 * silent omission, so a Tagihan can never be missing a line. `posisiAwal` is where the first Layanan line
 * sits, which is what each job's Pencairan is read by.
 */
export function gabungkanBaris(
  quoted: { lines: readonly QuotedLine[] },
  item: readonly ItemCheckout[],
  lokasi: { id: string; name: string },
  lainnya: (line: QuotedLine) => NewTagihanLine | null,
): GabungkanBarisResult {
  const lines: NewTagihanLine[] = [];
  const perBaris: { label: string; amount: number }[] = [];
  let posisiAwal = -1;
  for (const line of quoted.lines) {
    if (line.kind === "layanan_lokasi") {
      const satu = item[perBaris.length];
      if (!satu) return { ok: false, reason: "harga_tidak_tersedia" };
      if (posisiAwal < 0) posisiAwal = lines.length;
      const label = hargaLayananPartLabel(line, satu.varian);
      lines.push({
        kind: "layanan",
        label,
        amount: line.amount,
        provider: { kind: "lokasi_mitra", lokasiId: lokasi.id, name: lokasi.name },
        targetDate: satu.targetDate,
        leadTimeDays: satu.varian.leadTimeDays,
      });
      perBaris.push({ label, amount: line.amount });
      continue;
    }
    const biasa = lainnya(line);
    if (!biasa) return { ok: false, reason: "baris_tidak_bisa_ditagih" };
    lines.push(biasa);
  }
  if (perBaris.length !== item.length) return { ok: false, reason: "harga_tidak_tersedia" };
  return { ok: true, lines, perBaris, posisiAwal: posisiAwal < 0 ? lines.length : posisiAwal };
}

/** What the owning module hands over once its Tagihan exists: the grave, the family, the Tagihan and the lines. */
export interface TulisCheckoutInput extends Omit<KepalaPesananLayanan, "statusPekerjaan"> {
  /** `hari_h` jobs are Dijadwalkan now (their Tagihan is pay-after); the others wait for the payment. */
  mode: ModeCheckout;
  item: readonly ItemCheckout[];
  perBaris: readonly { label: string; amount: number }[];
}

/**
 * Writes the order and its jobs on `within` (the owner's transaction), under the owner's Nomor Pemesanan, so a
 * payment of that Tagihan finds them and the Lokasi's Pekerjaan Layanan page, the proof, the Keluhan and the
 * Pencairan all work for them as for any other order. Returns how many jobs it wrote.
 */
export async function tulisCheckout(deps: LayananDeps, input: TulisCheckoutInput, within?: Database): Promise<number> {
  if (input.item.length === 0) return 0;
  const { mode, item, perBaris, ...kepala } = input;
  const isi: ItemPesananLayanan[] = item.map((satu, posisi) => ({
    varian: { id: satu.varian.id, layananId: satu.varian.layananId, leadTimeDays: satu.varian.leadTimeDays },
    label: perBaris[posisi].label,
    amount: perBaris[posisi].amount,
    targetDate: satu.targetDate,
    teks: satu.teks,
  }));
  await tulisPesananLayanan(within ?? deps.db, { ...kepala, statusPekerjaan: mode === "hari_h" ? "dijadwalkan" : "menunggu_pembayaran" }, isi);
  return item.length;
}

/**
 * Cancels the jobs of an order's Layanan when the order is cancelled: every job that has not started
 * (Menunggu Pembayaran, Dijadwalkan) becomes Dibatalkan; one already Sedang Dikerjakan (or past it) keeps going
 * and its price is **kept**, so it is not refunded. Returns the whole rupiah kept, for the cancellation to
 * hold back from the refund. Idempotent, and a Nomor Pemesanan with no Layanan answers 0.
 */
export async function batalkanLayananCheckout(
  deps: LayananDeps,
  nomor: string,
  alasan: string,
  within?: Database,
): Promise<{ dibatalkan: number; ditahan: number }> {
  const db = within ?? deps.db;
  const [order] = await db.select({ id: pesananLayanan.id }).from(pesananLayanan).where(eq(pesananLayanan.nomor, nomor));
  if (!order) return { dibatalkan: 0, ditahan: 0 };
  const now = deps.clock.now();
  const batal = await db
    .update(pekerjaanLayanan)
    .set({ status: "dibatalkan", dibatalkanAt: now, alasanPembatalan: alasan })
    .where(and(eq(pekerjaanLayanan.pesananId, order.id), inArray(pekerjaanLayanan.status, ["menunggu_pembayaran", "dijadwalkan"])))
    .returning({ id: pekerjaanLayanan.id });
  const berjalan = await db
    .select({ amount: pesananLayananItem.amount })
    .from(pekerjaanLayanan)
    .innerJoin(pesananLayananItem, eq(pesananLayananItem.id, pekerjaanLayanan.pesananItemId))
    .where(and(eq(pekerjaanLayanan.pesananId, order.id), inArray(pekerjaanLayanan.status, ["sedang_dikerjakan", "terlambat", "selesai", "keluhan"])));
  return { dibatalkan: batal.length, ditahan: berjalan.reduce((jumlah, baris) => jumlah + Number(baris.amount), 0) };
}
