/**
 * Pilih Tipe Kavling (owner, 2026-11-02: "sembunyikan pilih petak ganti dengan pilih tipe kavling seperti pada
 * graha sentosa"). The Terencana wizard no longer shows the Denah: the family picks a tipe kavling — a Jenis
 * Makam, with its own size and capacity in its description, its Masa Hak Pakai and its all-in price — and the
 * order takes the next pickable unit of that tipe on the Denah. The unit is the same Petak Makam or Kavling
 * Keluarga a Denah pick would have been, so everything after this step (the hold, the Admin Lokasi's
 * konfirmasi, the Tagihan) is unchanged.
 */
import type { PublicDenah } from "@/domain/inventory";
import type { Tenure } from "@/domain/tariffs";
import type { PemesananDeps } from "./deps";
import type { PilihanTerencana } from "./terencana";

/** One tipe kavling as the wizard's card shows it. */
export interface TipeKavling {
  jenisMakamId: string;
  name: string;
  /** The Jenis Makam's own description: its size and capacity, as the Lokasi Mitra wrote it. */
  description: string;
  tenure: Tenure;
  /** Harga Hak Pakai + Biaya Layanan Platform of one unit, all-in, at this instant. */
  hargaAllIn: number;
  /** How many units of this tipe a Pemesan may pick right now. */
  tersedia: number;
  /** The unit the order takes when this tipe is chosen, by the number the URL carries; null when none is left. */
  berikut: PilihanTerencana | null;
}

export interface TipeKavlingTerencana {
  lokasi: { id: string; name: string; city: string };
  tipe: TipeKavling[];
}

/**
 * Every tipe kavling a Lokasi Mitra that takes Terencana orders sells, in its price order, each with how many
 * units are left and the one the order would take. Null for a Lokasi Mitra that takes no Terencana order.
 */
export async function tipeKavlingTerencana(deps: PemesananDeps, lokasiId: string): Promise<TipeKavlingTerencana | null> {
  const profile = await deps.lokasi.publicLokasiMitra(lokasiId);
  const denah = await deps.inventory.publicDenah(lokasiId);
  if (!profile?.terencanaAktif || !denah) return null;
  const pricing = await deps.tariffs.lokasiPricing(lokasiId, deps.clock.now());
  const tipe = pricing.jenisMakam.map((card): TipeKavling => {
    const units = unitBisaDipilih(denah, card.jenisMakam.id);
    return {
      jenisMakamId: card.jenisMakam.id,
      name: card.jenisMakam.name,
      description: card.jenisMakam.description,
      tenure: card.tenure,
      hargaAllIn: card.hakPakai.total,
      tersedia: units.length,
      berikut: units[0] ?? null,
    };
  });
  return {
    lokasi: { id: profile.id, name: profile.name, city: profile.city },
    tipe: tipe.sort((a, b) => a.hargaAllIn - b.hargaAllIn),
  };
}

/** The pickable units of one Jenis Makam, in Denah order (Blok, then row, then column): Petak Makam outside a Kavling, and whole Kavling Keluarga. */
function unitBisaDipilih(denah: PublicDenah, jenisMakamId: string): PilihanTerencana[] {
  return denah.bloks.flatMap((blok) => [
    ...[...blok.cells]
      .sort((a, b) => a.row - b.row || a.col - b.col)
      .filter((cell) => cell.kind === "petak" && cell.nomorMakam && !cell.kavlingId && cell.jenisMakamId === jenisMakamId && cell.status === "bisa_dipilih")
      .map((cell): PilihanTerencana => ({ petak: [cell.nomorMakam!], kavling: null })),
    ...[...blok.kavling]
      .sort((a, b) => a.nomorKavling.localeCompare(b.nomorKavling, "id", { numeric: true }))
      .filter((kavling) => kavling.jenisMakamId === jenisMakamId && kavling.status === "bisa_dipilih")
      .map((kavling): PilihanTerencana => ({ petak: [], kavling: kavling.nomorKavling })),
  ]);
}
