/**
 * Small rules the filing steps share (kept apart so the files that use them need not import each other): day
 * arithmetic on an instant and the named sets of statuses a step is open at.
 */
import type { PengurusanTpuStatus } from "./schema";

/** `hari` 24-hour days after `dari`: a window counted on the calendar, not on working time. */
export const hariKemudian = (dari: Date, hari: number) => new Date(dari.getTime() + hari * 24 * 60 * 60 * 1000);

/** Where the Pemesan may still upload a filing document: before the check, and after a fixable PTSP rejection. */
export const STATUS_MENERIMA_UNGGAHAN: readonly PengurusanTpuStatus[] = ["dimakamkan", "perlu_perbaikan"];

/** Where the Pemesan may cancel: until the IPTM is filed. */
export const STATUS_BOLEH_DIBATALKAN: readonly PengurusanTpuStatus[] = ["diajukan", "dikonfirmasi", "dimakamkan", "dokumen_lengkap", "menunggu_pembayaran"];

/** From these on the Operator has arranged the burial with the TPU, so a refund keeps its Biaya Pengurusan. */
export const STATUS_SUDAH_DIMAKAMKAN: readonly PengurusanTpuStatus[] = ["dimakamkan", "dokumen_lengkap", "menunggu_pembayaran"];
