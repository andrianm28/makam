import { lokasiRevisitRowType, publishGateCheckRowType } from "./tier4-lokasi-rows";
import type { AntreanRowType } from "./row-types";
import { otherTugasLapanganRowType } from "./tier4-tugas-lapangan-row";

/**
 * Every row type the Antrean shows (spec, Work Queues): adding one means
 * adding it here, never changing the aggregator (`./antrean.ts`) or the UI.
 * Tier 1 and 2 types arrive with tickets 20 and 28; Tier 3 with its own
 * tickets. Only the framework's first three, Tier 4, types are built here.
 */
export const antreanRowTypes: AntreanRowType[] = [lokasiRevisitRowType, publishGateCheckRowType, otherTugasLapanganRowType];
