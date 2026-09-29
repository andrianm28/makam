/**
 * Perpanjangan of a Hak Pakai at a Lokasi Mitra (spec, domain module 7; ticket
 * 40 builds the direct path: a code to the email recorded on the Hak Pakai).
 *
 * Owns table: perpanjangan.
 *
 * A Perpanjangan is open from 3 months before the end date to the end of the
 * Masa Tenggang. The family chooses 1..K terms, gets a pay-first Tagihan
 * addressed to the Pemegang Hak (due 3x24 h after issue, payable by anyone,
 * granting the payer nothing), and the payment extends the Hak Pakai by terms x
 * its own term from the end date on record, issues the Bukti Perpanjangan and
 * makes the Pencairan due (`./efek.ts`).
 *
 * Built for the tickets that follow: the manual paths (ticket 41: KTP, heir,
 * claim) end in the same `ajukanPerpanjangan` once an Admin Lokasi has approved
 * a request, so they add their own entry beside it (approval-backed, valid 30
 * days) and reuse `statusPerpanjangan`, `tawaranPerpanjangan` and the payment
 * effect unchanged. The Hak Pakai's expiry reminders and Kedaluwarsa transition
 * (ticket 42) read `perpanjanganUntukHakPakai` to stop reminding once one is
 * ordered. Neither is built here.
 *
 * Reaches its neighbours only through their public functions: the Hak Pakai from
 * Inventory, the price from Tariffs, the Tagihan and the Bukti from Billing, the
 * overdue-Tagihan block from Pemesanan, the code from Identity, the messages
 * from Notifications.
 */
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { PerpanjanganDeps } from "./deps";
import {
  ajukanPerpanjangan,
  ajukanPerpanjanganSchema,
  statusPerpanjangan,
  tawaranPerpanjangan,
  type AjukanPerpanjanganInput,
  type AjukanResult,
  type JalurBukti,
  type OpsiMasa,
  type Pemohon,
  type StatusPerpanjangan,
  type TagihanTerbuka,
  type TawaranResult,
} from "./ajukan";
import { kirimKode, verifikasiKode, type KirimKodeResult, type VerifikasiKodeResult } from "./kode";
import { perpanjangan } from "./schema";

export { efekPerpanjangan, type EfekPerpanjanganDeps } from "./efek";
export { bolehDiperpanjang, samarkanEmail, tambahBulan, BULAN_SEBELUM_BERAKHIR, type CatatanPerpanjangan, type FaktaHakPakai } from "./aturan";
export { ajukanPerpanjanganSchema };
export type { AjukanPerpanjanganInput, AjukanResult, JalurBukti, KirimKodeResult, OpsiMasa, Pemohon, StatusPerpanjangan, TagihanTerbuka, TawaranResult, VerifikasiKodeResult };
export type { PerpanjanganDeps } from "./deps";

/** One Perpanjangan as its readers see it. */
export interface PerpanjanganTercatat {
  id: string;
  hakPakaiId: string;
  terms: number;
  nomorTagihan: string;
  /**
   * Lunas once paid and applied; Menunggu Pembayaran while its Tagihan can still be paid; Dibatalkan
   * once that Tagihan lapsed; Perlu Ditinjau when the money arrived but could not be applied (the Hak
   * Pakai had ended or its Masa Tenggang was over), which Admin Platform applies by hand or refunds.
   */
  status: "menunggu_pembayaran" | "lunas" | "dibatalkan" | "perlu_ditinjau";
  dibuatPada: Date;
  dibayarPada: Date | null;
  /** The end dates it moved between; null until paid. */
  endDateLama: string | null;
  endDateBaru: string | null;
  buktiId: string | null;
}

export interface Perpanjangan {
  /** Whether a Perpanjangan is open for this Hak Pakai today, or the note that replaces the button. `dengan` is the signed-in Akun, whose recorded email skips the code. */
  status(hakPakaiId: string, dengan?: Pemohon | null): Promise<StatusPerpanjangan>;
  /** Every choice of 1..K terms with its all-in price, or why none is offered. */
  tawaran(hakPakaiId: string): Promise<TawaranResult>;
  /** Sends a Kode Masuk to the email recorded on the Hak Pakai (never revealed, only masked). */
  kirimKode(input: { hakPakaiId: string; ip: string }): Promise<KirimKodeResult>;
  /** Checks that code; a correct one logs the holder in (identity's own session), as Kirim's code step does. */
  verifikasiKode(input: { hakPakaiId: string; code: string }): Promise<VerifikasiKodeResult>;
  /** Orders a Perpanjangan: the pay-first Tagihan addressed to the Pemegang Hak, announced by email. The asker must hold the recorded Email Terverifikasi. */
  ajukan(input: AjukanPerpanjanganInput): Promise<AjukanResult>;
  /** One Perpanjangan by its id, or null. */
  perpanjanganOf(id: string): Promise<PerpanjanganTercatat | null>;
  /** Every Perpanjangan of a Hak Pakai, newest first: what ticket 42's reminders read to stop once one is ordered. */
  perpanjanganUntukHakPakai(hakPakaiId: string): Promise<PerpanjanganTercatat[]>;
}

export function createPerpanjangan(deps: PerpanjanganDeps): Perpanjangan {
  async function tercatat(row: typeof perpanjangan.$inferSelect): Promise<PerpanjanganTercatat> {
    let status: PerpanjanganTercatat["status"] = "lunas";
    if (!row.dibayarPada) {
      const tagihan = await deps.billing.tagihan(row.tagihanId);
      if (!tagihan || tagihan.status === "dibatalkan") status = "dibatalkan";
      else status = tagihan.status === "lunas" || tagihan.status === "dikembalikan_penuh" || tagihan.status === "dikembalikan_sebagian" ? "perlu_ditinjau" : "menunggu_pembayaran";
    }
    return {
      id: row.id,
      hakPakaiId: row.hakPakaiId,
      terms: row.terms,
      nomorTagihan: row.nomorTagihan,
      status,
      dibuatPada: row.dibuatPada,
      dibayarPada: row.dibayarPada,
      endDateLama: row.endDateLama,
      endDateBaru: row.endDateBaru,
      buktiId: row.buktiId,
    };
  }
  return {
    status: (hakPakaiId, dengan) => statusPerpanjangan(deps, hakPakaiId, dengan),
    tawaran: (hakPakaiId) => tawaranPerpanjangan(deps, hakPakaiId),
    kirimKode: (input) => kirimKode(deps, input),
    verifikasiKode: (input) => verifikasiKode(deps, input),
    ajukan: (input) => ajukanPerpanjangan(deps, input),
    perpanjanganOf: async (id) => {
      if (!z.uuid().safeParse(id).success) return null;
      const [row] = await deps.db.select().from(perpanjangan).where(eq(perpanjangan.id, id));
      return row ? tercatat(row) : null;
    },
    perpanjanganUntukHakPakai: async (hakPakaiId) => {
      const rows = await deps.db.select().from(perpanjangan).where(eq(perpanjangan.hakPakaiId, hakPakaiId)).orderBy(desc(perpanjangan.dibuatPada));
      return Promise.all(rows.map(tercatat));
    },
  };
}
