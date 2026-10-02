/**
 * Small rules the filing steps share (kept apart so the files that use them need not import each other): day
 * arithmetic on an instant and the named sets of statuses a step is open at.
 */
import type { pengurusanTpu, PengurusanTpuStatus } from "./schema";

type Order = typeof pengurusanTpu.$inferSelect;

/** `hari` 24-hour days after `dari`: a window counted on the calendar, not on working time. */
export const hariKemudian = (dari: Date, hari: number) => new Date(dari.getTime() + hari * 24 * 60 * 60 * 1000);

/** Where the Pemesan may still upload a filing document: before the check, and after a fixable PTSP rejection. */
export const STATUS_MENERIMA_UNGGAHAN: readonly PengurusanTpuStatus[] = ["dimakamkan", "perlu_perbaikan"];

/** Where the Pemesan may cancel: until the IPTM is filed. */
export const STATUS_BOLEH_DIBATALKAN: readonly PengurusanTpuStatus[] = ["diajukan", "dikonfirmasi", "dimakamkan", "dokumen_lengkap", "menunggu_pembayaran"];

/** From these on the Operator has arranged the burial with the TPU, so a refund keeps its Biaya Pengurusan. */
export const STATUS_SUDAH_DIMAKAMKAN: readonly PengurusanTpuStatus[] = ["dimakamkan", "dokumen_lengkap", "menunggu_pembayaran"];

/** A Perpanjangan TPU may be requested from this many months before the IPTM expires (spec, Pengurusan; story 80). */
export const BULAN_PERPANJANGAN_TPU_DIBUKA = 3;
/** The masa tenggang of a DKI TPU's IPTM, in months after it expires; past it the TPU is asked first (story 81). */
export const BULAN_MASA_TENGGANG_TPU = 3;

/**
 * Where the Pemesan may upload a filing document of this order. A Perpanjangan TPU takes them from the moment it is placed
 * (Diajukan), a filing-only order from Dimakamkan; either again after a fixable rejection (Perlu Perbaikan).
 */
export function menerimaUnggahan(order: Pick<Order, "kind" | "status">): boolean {
  return STATUS_MENERIMA_UNGGAHAN.includes(order.status) || (order.kind === "perpanjangan_tpu" && order.status === "diajukan");
}

/**
 * Whether the documents of this order are the ones Admin Platform checks before any Tagihan: a filing-only order at
 * Dimakamkan, a Perpanjangan TPU at Diajukan or, after a correction asked for before payment, at Perlu Perbaikan with no Tagihan yet.
 */
export function menungguPemeriksaan(order: Pick<Order, "kind" | "status" | "tagihanId">): boolean {
  if (order.kind === "saat_duka_tpu") return order.status === "dimakamkan";
  if (order.kind === "pengurusan_iptm") return order.status === "dimakamkan";
  return order.status === "diajukan" || (order.status === "perlu_perbaikan" && order.tagihanId === null);
}
