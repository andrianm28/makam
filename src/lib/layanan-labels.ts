import type { Bukti, Frekuensi, ProofRequirement } from "@/domain/layanan";

/**
 * How the Layanan catalog's own words are named on screen (CONTEXT.md): the
 * proof a Pekerjaan Layanan must show, a Paket Layanan's frequency, and the
 * catalog's flags. The wording lives here, once, outside the domain.
 */

/** The proof level a catalog entry carries. */
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

/** How often a Paket Layanan repeats. */
export const frekuensiLabels: Record<Frekuensi, string> = {
  sekali: "Sekali",
  bulanan: "Bulanan",
  tiga_bulanan: "3-bulanan",
  tahunan: "Tahunan",
};

/** How a Paket Layanan is named in a sentence. */
export function frekuensiLabel(frekuensi: Frekuensi): string {
  return frekuensi === "sekali" ? "sekali" : `setiap ${frekuensiLabels[frekuensi].toLowerCase()}`;
}
