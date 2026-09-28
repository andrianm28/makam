import type { DenahView, KavlingView } from "./tampilan";

/**
 * What is chosen so far, as one line: "2 Petak · Blok A: A-09, A-10", or
 * "Kavling Keluarga KK-A1 · Blok A (4 petak)" (the public prototype's own
 * wording). Shown on the Denah's selection summary and the sticky total bar.
 *
 * Pure and import-free of any domain module, so `denah-picker.tsx` and
 * `data-kirim.tsx` (both `"use client"`) can call it without dragging a
 * domain module's database graph into the browser: only `import type` values
 * cross that line (`tampilan.ts` itself does import a domain constant, but
 * every other file takes it as a type only).
 */
export function ringkasanPilihan(denah: DenahView, petak: readonly string[], kavling: KavlingView | null): string {
  if (kavling) {
    const blok = denah.blok.find((satu) => satu.kavling.some((k) => k.id === kavling.id));
    return `Kavling Keluarga ${kavling.nomor}${blok ? ` · ${blok.name}` : ""} (${kavling.rows * kavling.cols} petak)`;
  }
  if (petak.length === 0) return "Belum ada petak dipilih";
  const perBlok = denah.blok
    .map((blok) => ({ blok, list: petak.filter((nomor) => blok.cells.some((cell) => cell.nomor === nomor && !cell.kavling)) }))
    .filter((satu) => satu.list.length > 0)
    .map((satu) => `${satu.blok.name}: ${satu.list.join(", ")}`);
  return `${petak.length} Petak · ${perBlok.join(" · ")}`;
}
