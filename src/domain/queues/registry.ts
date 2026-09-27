import type { AntreanRowType } from "./row-types";
import { pembayaranPerluDitinjauRowType } from "./tier2-pembayaran-perlu-ditinjau-row";
import { teleponPemesanRowType } from "./telepon-pemesan-row";
import { lokasiRevisitRowType, publishGateCheckRowType } from "./tier4-lokasi-rows";
import { otherTugasLapanganRowType } from "./tier4-tugas-lapangan-row";
import { konfirmasiLokasiTerlambatRowType } from "./tier1-konfirmasi-lokasi-terlambat-row";
import { mitraJasaOnboardingRowType, skorMitraJasaReviewRowType } from "./tier4-mitra-jasa-row";
import { tpuFlagStaleRowType } from "./tier4-tpu-row";

/**
 * Every row type the Antrean shows (spec, Work Queues): adding one means
 * adding it here, never changing the aggregator (`./antrean.ts`) or the UI.
 * The rest of Tier 2 and 3 arrive with ticket 28 and their own; built here:
 * the framework's three Tier 4 types (including the TPU flag stale row of
 * ticket 43 and the two Mitra Jasa rows of ticket 55), Tier 2's Pembayaran Perlu
 * Ditinjau (spec-missing; ticket 19's review) and Telepon Pemesan (ticket 20), and
 * Tier 1's Konfirmasi Lokasi terlambat (ticket 23).
 */
export const antreanRowTypes: AntreanRowType[] = [
  konfirmasiLokasiTerlambatRowType,
  pembayaranPerluDitinjauRowType,
  teleponPemesanRowType,
  lokasiRevisitRowType,
  publishGateCheckRowType,
  otherTugasLapanganRowType,
  tpuFlagStaleRowType,
  mitraJasaOnboardingRowType,
  skorMitraJasaReviewRowType,
];
