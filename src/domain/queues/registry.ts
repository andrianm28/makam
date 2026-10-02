import type { AntreanRowType, Tier1RowType } from "./row-types";
import { layananTerlambatRowType } from "./tier2-layanan-terlambat-row";
import {
  pekerjaanTpuDitolakRowType,
  pekerjaanTpuPenugasanUlangRowType,
  pekerjaanTpuTanpaMitraRowType,
  pekerjaanTpuTidakDiresponsRowType,
} from "./tier1-pekerjaan-tpu-row";
import { pembayaranPerluDitinjauRowType } from "./tier2-pembayaran-perlu-ditinjau-row";
import { teleponPemesanRowType } from "./telepon-pemesan-row";
import { lokasiRevisitRowType, publishGateCheckRowType } from "./tier4-lokasi-rows";
import { otherTugasLapanganRowType } from "./tier4-tugas-lapangan-row";
import { konfirmasiLokasiTerlambatRowType } from "./tier1-konfirmasi-lokasi-terlambat-row";
import { saatDukaDitolakRowType } from "./tier1-saat-duka-ditolak-row";
import { konfirmasiTpuSaatDukaRowType } from "./tier1-konfirmasi-tpu-saat-duka-row";
import { ambilSuratPengantarRowType } from "./tier2-ambil-surat-pengantar-row";
import { setorRetribusiRowType } from "./tier3-setor-retribusi-row";
import { mitraJasaOnboardingRowType, skorMitraJasaReviewRowType } from "./tier4-mitra-jasa-row";
import { tpuFlagStaleRowType } from "./tier4-tpu-row";
import { pencairanRowType } from "./tier3-pencairan-row";
import { pengembalianRowType } from "./tier3-pengembalian-row";
import { tagihanLewatJatuhTempoRowType } from "./tier3-tagihan-lewat-jatuh-tempo-row";
import { konfirmasiTerencanaTerlambatRowType } from "./tier3-konfirmasi-terencana-terlambat-row";
import { pembatalanRefundRowType } from "./tier3-pembatalan-refund-row";
import { pengajuanWakafRowType } from "./tier3-pengajuan-wakaf-row";
import { keluhanRowType } from "./tier1-keluhan-row";

/**
 * Every row type the Antrean shows (spec, Work Queues): adding one means
 * adding it here, never changing the aggregator (`./antrean.ts`) or the UI.
 * The rest of Tier 2 and 3 arrive with ticket 28 and their own; built here:
 * the framework's three Tier 4 types (including the TPU flag stale row of
 * ticket 43), Tier 2's Pembayaran Perlu Ditinjau (spec-missing; ticket 19's
 * review) and Telepon Pemesan (ticket 20), Tier 1's Konfirmasi Lokasi
 * terlambat (ticket 23), Saat Duka ditolak (ticket 24), and Tier 3's Pencairan
 * (ticket 32 — the first Tier 3 row type, and the foundation the rest of Tier 3
 * builds on); plus ticket 45's three: Tier 1's Konfirmasi TPU Saat Duka, Tier
 * 2's Ambil surat pengantar and Tier 3's Setor Retribusi.
 * ticket 43 and the two Mitra Jasa rows of ticket 55), Tier 2's Pembayaran Perlu
 * Ditinjau (spec-missing; ticket 19's review) and Telepon Pemesan (ticket 20), and
 * Tier 1's Konfirmasi Lokasi terlambat (ticket 23).
 * Tier 2's Layanan Terlambat (ticket 50), and Tier 1's Keluhan (ticket 51).
 * Ticket 56's four: Tier 1's TPU jobs due today without a Mitra Jasa, and Tier 2's
 * Tidak direspons, Ditolak and reassignment rows.
 */
/**
 * The Tier 1 row types, the only ones that alert (ticket 28): a new Tier 1 type
 * is added here and nowhere else, and a test holds this list to the registry's own
 * Tier 1 types below.
 */
export const tier1RowTypes: Tier1RowType[] = [
  konfirmasiLokasiTerlambatRowType,
  saatDukaDitolakRowType,
  konfirmasiTpuSaatDukaRowType,
  keluhanRowType,
  pekerjaanTpuTanpaMitraRowType,
];

export const antreanRowTypes: AntreanRowType[] = [
  ...tier1RowTypes,
  ambilSuratPengantarRowType,
  setorRetribusiRowType,
  pembayaranPerluDitinjauRowType,
  pencairanRowType,
  pengembalianRowType,
  konfirmasiTerencanaTerlambatRowType,
  pembatalanRefundRowType,
  pengajuanWakafRowType,
  tagihanLewatJatuhTempoRowType,
  teleponPemesanRowType,
  layananTerlambatRowType,
  pekerjaanTpuTidakDiresponsRowType,
  pekerjaanTpuDitolakRowType,
  pekerjaanTpuPenugasanUlangRowType,
  lokasiRevisitRowType,
  publishGateCheckRowType,
  otherTugasLapanganRowType,
  tpuFlagStaleRowType,
  mitraJasaOnboardingRowType,
  skorMitraJasaReviewRowType,
];
