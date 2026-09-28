import type { BlokView, DenahView, KavlingView } from "./tampilan";

/**
 * The Kavling Keluarga named by this Nomor Kavling, searching every Blok;
 * null when nothing matches (a stale link, or a Denah that no longer knows
 * it). The one place that resolves a Nomor Kavling to its `KavlingView`, so
 * page.tsx's "Data & kirim" screen and this file's own `ringkasanPilihan`
 * never each grow their own copy of the same search.
 */
export function kavlingByNomor(denah: DenahView, nomor: string): KavlingView | null {
  for (const blok of denah.blok) {
    const found = blok.kavling.find((satu) => satu.nomor === nomor);
    if (found) return found;
  }
  return null;
}

/** The Blok a Kavling Keluarga (by id) belongs to; null if none matches. */
export function blokOfKavling(denah: DenahView, kavlingId: string): BlokView | null {
  return denah.blok.find((blok) => blok.kavling.some((satu) => satu.id === kavlingId)) ?? null;
}

/**
 * The chosen Petak Makam grouped by their Blok, in the Denah's own Blok
 * order; a Blok with no match here is left out entirely.
 */
export function petakByBlok(denah: DenahView, petak: readonly string[]): { blok: BlokView; nomor: string[] }[] {
  return denah.blok
    .map((blok) => ({ blok, nomor: petak.filter((nomor) => blok.cells.some((cell) => cell.nomor === nomor && !cell.kavling)) }))
    .filter((entry) => entry.nomor.length > 0);
}

/**
 * What is chosen so far, as one line: "2 Petak · Blok A: A-09, A-10", or
 * "Kavling Keluarga KK-A1 · Blok A (4 petak)" (the public prototype's own
 * wording). Shown on the Denah's selection summary and the sticky total bar.
 *
 * Pure and import-free of any domain module, so `denah-picker.tsx` and
 * `data-kirim.tsx` (both `"use client"`) can call it without dragging a
 * domain module's database graph into the browser: `tampilan.ts`'s types
 * cross here only as `import type` (erased), and this file reaches nothing
 * else. `tampilan.ts` itself does import a domain value (`lokasiFacilities`,
 * for `lokasiView`, called only from the server page) — every file on a
 * client import graph takes it as a type only.
 */
export function ringkasanPilihan(denah: DenahView, petak: readonly string[], kavling: KavlingView | null): string {
  if (kavling) {
    const blok = blokOfKavling(denah, kavling.id);
    return `Kavling Keluarga ${kavling.nomor}${blok ? ` · ${blok.name}` : ""} (${kavling.rows * kavling.cols} petak)`;
  }
  if (petak.length === 0) return "Belum ada petak dipilih";
  const perBlok = petakByBlok(denah, petak).map((entry) => `${entry.blok.name}: ${entry.nomor.join(", ")}`);
  return `${petak.length} Petak · ${perBlok.join(" · ")}`;
}
