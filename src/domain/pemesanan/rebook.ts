/**
 * The rebook link of a declined order (spec, Public site: "**After a Tolak**, the
 * Pilih makam list opens with a banner, the rejecting Lokasi removed and the
 * family's data prefilled"; story 32; ticket 24's AC 3).
 *
 * Everything the link needs, read from the order that was declined: what the
 * banner says, the Lokasi Mitra that must not be offered again, the city to look
 * in, and the family's own data for "Data & kirim". It is a read of **that
 * family's own order** — the same rule as the order page (`orderOf`), because
 * the prefilled fields are a phone number, an email and a dead relative's name,
 * and a URL anybody can forward must not carry them: null for another Akun's
 * number, exactly as the order page is nothing found.
 *
 * A TPU order is a Pengurusan order of another module (ticket 44) and has no
 * plot to be rebooked away from, so it has no rebook here; what this ticket can
 * promise is that the list it opens is the ordinary `pilihanSaatDuka` read, so the
 * TPU section ticket 44 adds to that list arrives on the rebook link with it.
 */
import { and, eq } from "drizzle-orm";
import { alasanOrder } from "./alasan-tolak";
import type { PemesananDeps } from "./deps";
import { pemesananMakam, type PemegangHak } from "./schema";

/** What the rebook screen is given, all of it read off the declined order. */
export interface RebookPesanan {
  nomor: string;
  /** The banner: the Lokasi Mitra that could not serve the order, and why, in its own words. */
  banner: { lokasi: { id: string; name: string }; alasan: string };
  /** The city the list comes back with: the rejecting Lokasi Mitra's own, where the family was looking. */
  kota: string | null;
  /**
   * The Lokasi Mitra that turned this family away, and which is therefore not in
   * the list it is sent back to. The exclusion is a fact of the query, not of a
   * screen: `pilihanSaatDuka` is asked for a list without it.
   */
  kecualiLokasiId: string;
  /** What "Data & kirim" opens filled in, exactly as the first order recorded it. */
  isi: {
    pemesanName: string;
    email: string | null;
    phoneNumber: string | null;
    almarhumName: string;
    tanggalWafat: string;
    /** The planned burial, as an instant; null when the first order had no plan. */
    rencanaPemakamanAt: Date | null;
    pemegangHak: PemegangHak;
  };
}

/**
 * The rebook of one declined order, for the Pemesan that placed it, or null: no
 * such order, another Akun's, or an order that is not Ditolak (a cancellation is
 * not something to be sent back from, and an order still waiting has not been
 * refused).
 *
 * The reason in the banner is the closed list's own wording, as everywhere else a
 * Tolak is shown — this screen may not word a decline in its own words.
 */
export async function rebookPesanan(
  deps: Pick<PemesananDeps, "db" | "lokasi">,
  nomor: string,
  pemesan: { accountId: string },
): Promise<RebookPesanan | null> {
  const [row] = await deps.db
    .select()
    .from(pemesananMakam)
    .where(and(eq(pemesananMakam.nomor, nomor), eq(pemesananMakam.pemesanAccountId, pemesan.accountId)));
  if (!row || row.status !== "ditolak") return null;
  // A Ditolak order always carries a reason off the closed list; one that does not
  // is a hole in the data, and a hole is no reason to send a family back from.
  const alasan = alasanOrder(row.alasanTolak, null);
  if (!alasan) return null;
  // The city is the declining Lokasi Mitra's own; a family that finds no other
  // Lokasi there is no worse off than one shown a list of a city they never chose.
  const lokasi = await deps.lokasi.publicLokasiMitraTampil(row.lokasiId);
  return {
    nomor: row.nomor,
    banner: { lokasi: { id: row.lokasiId, name: row.lokasiName }, alasan },
    kota: lokasi?.city ?? null,
    kecualiLokasiId: row.lokasiId,
    isi: {
      pemesanName: row.pemesanName,
      email: row.email,
      phoneNumber: row.phoneNumber,
      almarhumName: row.almarhumName,
      tanggalWafat: row.tanggalWafat,
      rencanaPemakamanAt: row.rencanaPemakamanAt,
      pemegangHak: row.pemegangHak,
    },
  };
}
