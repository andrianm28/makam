import type { AntreanRowType } from "./row-types";
import { pembayaranPerluDitinjauRowType } from "./tier2-pembayaran-perlu-ditinjau-row";
import { teleponPemesanRowType } from "./telepon-pemesan-row";
import { lokasiRevisitRowType, publishGateCheckRowType } from "./tier4-lokasi-rows";
import { otherTugasLapanganRowType } from "./tier4-tugas-lapangan-row";
import { tpuFlagStaleRowType } from "./tier4-tpu-row";

/**
 * Every row type the Antrean shows (spec, Work Queues): adding one means
 * adding it here, never changing the aggregator (`./antrean.ts`) or the UI.
 * The rest of Tier 1 and 2 arrive with tickets 20 and 28; Tier 3 with its own
 * tickets. Built here: the framework's first three, Tier 4, types, Tier 2's
 * Pembayaran Perlu Ditinjau (spec-missing; ticket 19's review) and Tier 4's
 * TPU flag stale row (ticket 43).
 */
export const antreanRowTypes: AntreanRowType[] = [
  pembayaranPerluDitinjauRowType,
  teleponPemesanRowType,
  lokasiRevisitRowType,
  publishGateCheckRowType,
  otherTugasLapanganRowType,
  tpuFlagStaleRowType,
];
