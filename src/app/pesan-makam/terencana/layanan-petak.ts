import { itemDariPilihan, type OpsiLayananView, type PilihanPerLayanan } from "@/lib/layanan-pilihan";
import type { DraftTerencana } from "./draft";

/**
 * What a family picked among the Layanan offered for an empty Petak Makam on the Terencana "Data & kirim" screen
 * (spec, Layanan > Order: Terencana empty-plot), as the order takes it and as the screen adds it to the total.
 * One function for both, so a Layanan the order does not carry is never one the total counts. Display and shaping
 * only: which Layanan are allowed, their dates and their prices are the Layanan module's own, which prices them
 * again when the Lokasi Mitra confirms the order.
 *
 * Every Layanan a family picks has the date it picks for it: the screen has no date of its own to fall back on,
 * because the work is done on the day the family chose. So a pick with no date yet is neither sent without its
 * date nor left out of the order in silence: it is named, and Kirim is refused until the family picks its date
 * or puts it back to "Tidak dipesan" (Perpanjangan's "Tambah Layanan" refuses an undated pick the same way).
 */

/** One Layanan for the empty Petak Makam as the order takes it: a variant on the date the family picked. */
export type ItemLayananTerencana = DraftTerencana["layanan"][number];

export interface LayananPetakKosong {
  /** What reaches the order: each Layanan picked, on the date picked for it, in the order of the catalog. */
  item: ItemLayananTerencana[];
  /** What `item` adds to the Tagihan (the variants' own prices; the one Biaya Layanan Platform is the Tagihan's). The total shown counts this and nothing else. */
  subtotal: number;
  /** The Layanan picked that still have no date, by name. */
  tanpaTanggal: string[];
  /** The words that refuse Kirim while a Layanan picked has no date, naming it; null when every one has its date. */
  ditolak: string | null;
}

export function layananPetakKosong(opsi: readonly OpsiLayananView[], pilihan: PilihanPerLayanan): LayananPetakKosong {
  const item: ItemLayananTerencana[] = [];
  const tanpaTanggal: string[] = [];
  let subtotal = 0;
  for (const grup of opsi) {
    // One Layanan at a time keeps the shaping (the text, "Tidak dipesan") where it already is: `itemDariPilihan`.
    const [satu] = itemDariPilihan([grup], pilihan, "petak_kosong");
    if (!satu) continue;
    if (!satu.targetDate) {
      tanpaTanggal.push(grup.name);
      continue;
    }
    item.push({ layananVariantId: satu.layananVariantId, targetDate: satu.targetDate, teks: satu.teks });
    subtotal += grup.varian.find((varian) => varian.id === satu.layananVariantId)?.harga ?? 0;
  }
  return { item, subtotal, tanpaTanggal, ditolak: tanpaTanggal.length > 0 ? pesanTanpaTanggal(tanpaTanggal) : null };
}

/** The refusal, in the words the screen already uses ("Tanggal pengerjaan", "Tidak dipesan"): what is missing, what it costs the family, what to do. */
function pesanTanpaTanggal(nama: readonly string[]): string {
  const daftar = nama.length > 1 ? `${nama.slice(0, -1).join(", ")} dan ${nama[nama.length - 1]}` : nama[0];
  return `Pilih tanggal pengerjaan untuk ${daftar}, atau ubah pilihannya menjadi Tidak dipesan. Sampai itu dilakukan, layanannya belum dihitung di total dan pesanan belum bisa dikirim.`;
}
