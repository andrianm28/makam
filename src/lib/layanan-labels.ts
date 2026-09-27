import type { Bukti, Frekuensi, JenisLayanan, ProofRequirement } from "@/domain/layanan";
import type { QuotedLine } from "@/domain/tariffs";
import { quoteLineLabel } from "./quote-line-label";

/**
 * How the Layanan catalog's own words are named on screen (CONTEXT.md): what kind
 * of Layanan an entry is, the proof it requires, one part of a Layanan price, and
 * a Paket Layanan's frequency. The wording lives here, once, outside the domain.
 */

/** What kind of Layanan a catalog entry is (spec, decision ticket 09: the v1 list). */
export const jenisLayananLabels: Record<JenisLayanan, string> = {
  bunga: "Bunga",
  nisan: "Batu Nisan",
  pembersihan: "Pembersihan Makam",
  perawatan: "Perawatan Rumput & Taman",
  laporan: "Laporan Foto/Video",
};

/** The proof level a kind of Layanan carries, as it is stored and shown. */
export const buktiLabels: Record<Bukti, string> = {
  foto_sesudah: "Foto setelah",
  foto_sebelum_dan_sesudah: "Foto sebelum dan sesudah",
  foto_dan_video: "Foto dan video",
};

/** What a job's proof must contain, in the words a fulfiller and a Pemesan read. */
export function proofLabels(proof: ProofRequirement): string {
  const wajib = ["Foto setelah"];
  if (proof.fotoSebelum) wajib.push("Foto sebelum");
  if (proof.video) wajib.push("Video");
  return wajib.join(", ");
}

/**
 * One part of a Layanan price: the Layanan variant it belongs to, named from the
 * catalog that owns the name, or any other line named by `quoteLineLabel` (the
 * one wording for the Tariffs module's own lines).
 */
export function hargaLayananPartLabel(line: QuotedLine, varian?: { namaLayanan: string; name: string }): string {
  if (line.kind !== "layanan_lokasi" && line.kind !== "layanan_dki") return quoteLineLabel(line);
  return varian ? `Layanan – ${varian.namaLayanan} (${varian.name})` : "Layanan";
}

/** One part of a Layanan price: its name, its amount, and when each changes. */
export interface HargaLayananPart {
  label: string;
  amount: number;
  inForceSince: string;
  scheduledChange: { effectiveOn: string; amount: number } | null;
}

/** How often a Paket Layanan repeats. */
export const frekuensiLabels: Record<Frekuensi, string> = {
  sekali: "Sekali",
  bulanan: "Bulanan",
  tiga_bulanan: "3-bulanan",
  tahunan: "Tahunan",
};
