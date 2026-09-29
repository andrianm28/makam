import "server-only";
import { z } from "zod";
import type { HasilCariMakam, MakamDitemukan, PermintaanCariMakam } from "@/domain/inventory";
import { formatTanggalJam } from "@/lib/time/jakarta";
import {
  barisMakamSaya,
  bentukCariDari,
  kartuAksi,
  aksiDari,
  STATUS_HAK_PAKAI,
  type AksiMakamKeluarga,
  type BarisMakamSaya,
  type BentukCari,
  type KartuAksi,
  type StatusHakPakaiTerbaca,
} from "@/lib/makam-keluarga-content";
import { serverRuntime } from "@/server/runtime";

/**
 * The Makam keluarga hub's own read: what the page shows, composed from the
 * Lokasi module's public list and the Inventory module's lookup. The page renders
 * this and nothing else, so the payload a family is answered with is exactly
 * what the page has in hand — there is no second read here that could carry more
 * than the four data classes the lookup is allowed to return (ticket 34).
 */

export interface PilihanLokasi {
  id: string;
  name: string;
  city: string;
}

export interface PetakTerbaca {
  petakId: string;
  nomorMakam: string;
  almarhum: string[];
  status: StatusHakPakaiTerbaca;
  /** The end date as "YYYY-MM-DD", or null when none is on record. */
  tanggalBerakhir: string | null;
}

export interface MakamTerbaca {
  lokasiId: string;
  namaLokasi: string;
  kavlingId: string | null;
  nomorKavling: string | null;
  petak: PetakTerbaca[];
}

/** What the page has to say about the lookup it was asked for. */
export type StatusCariHub = "belum" | "perlu_lengkap" | "ditemukan" | "tidak_ditemukan" | "terlalu_sering";

export interface TampilanHub {
  /** The branch the hub was opened with, or null: the tile's action, kept across the lookup. */
  aksiTerpilih: AksiMakamKeluarga | null;
  /** Every branch the hub owns, the chosen one first. */
  kartuAksi: KartuAksi[];
  /** The Lokasi Mitra to look in; the form's own choice. */
  pilihanLokasi: PilihanLokasi[];
  /** What the family typed, so the form comes back filled rather than empty. */
  form: { lokasiId: string; cari: BentukCari | null; nomor: string; nama: string; tahun: string };
  status: StatusCariHub;
  /** The one sentence the page says about the lookup; the same words for every miss. */
  pesan: string | null;
  /** When the per-IP limit frees up, when it refused. */
  retryAt: Date | null;
  ditemukan: MakamTerbaca[];
  /**
   * The signed-in Akun's own graves, as shortcuts into the hub. The row is
   * `barisMakamSaya`, which Akun Saya renders too: one rule, two surfaces.
   */
  tabSaya: BarisMakamSaya[];
}

/** The same sentence for every miss, so the answer never says which question was closer. */
const TIDAK_DITEMUKAN =
  "Belum kami temukan dari data ini. Periksa kembali nomor atau nama yang diketik, atau tanya CS agar kami bantu mencarinya di Lokasi Mitra.";

/** The query as the page's own boundary, read once (AGENTS.md: Zod at every boundary). */
const paramsSchema = z.object({
  aksi: z.string().optional(),
  lokasi: z.string().optional(),
  cari: z.string().optional(),
  nomor: z.string().optional(),
  nama: z.string().optional(),
  tahun: z.string().optional(),
});

/** A year of death as the four digits it is; anything else is a form that is not filled in yet. */
const TAHUN = /^\d{4}$/;

export async function tampilanHub(params: unknown, PENGGUNA: { ip: string; email?: string | null }): Promise<TampilanHub> {
  const parsed = paramsSchema.safeParse(params);
  const query = parsed.success ? parsed.data : {};
  const { lokasi, inventory } = serverRuntime();
  const cards = await lokasi.publicLokasiMitraList();
  const namaLokasi = new Map(cards.map((card) => [card.id, card.name]));
  const pilihanLokasi: PilihanLokasi[] = cards.map((card) => ({ id: card.id, name: card.name, city: card.city }));

  const aksiTerpilih = aksiDari(query.aksi);
  const cari = bentukCariDari(query.cari);
  const form = { lokasiId: query.lokasi ?? "", cari, nomor: query.nomor ?? "", nama: query.nama ?? "", tahun: query.tahun ?? "" };
  const permintaan = permintaanDari(form);

  const hasil: HasilCariMakam = permintaan
    ? await inventory.cariMakam({ ip: PENGGUNA.ip, ...permintaan })
    : { ok: true, ditemukan: [] };
  const status: StatusCariHub = !permintaan ? (cari || form.lokasiId ? "perlu_lengkap" : "belum") : !hasil.ok ? "terlalu_sering" : hasil.ditemukan.length > 0 ? "ditemukan" : "tidak_ditemukan";

  const ditemukan = hasil.ok ? hasil.ditemukan.map((satu) => terbaca(satu, namaLokasi)) : [];
  // The one sentence the page says about the lookup. A refusal is worded from the
  // refusal itself, so it can only ever carry a time — never what was being asked.
  let pesan: string | null = null;
  if (status === "perlu_lengkap") pesan = "Lengkapi dulu Lokasi Mitra dan apa yang ingin dicari, lalu tekan Cari.";
  else if (!hasil.ok) pesan = `Terlalu banyak percobaan dari perangkat ini. Coba lagi setelah ${formatTanggalJam(hasil.retryAt)}.`;
  else if (status === "tidak_ditemukan") pesan = TIDAK_DITEMUKAN;

  const tabSaya = PENGGUNA.email
    ? (await inventory.makamPemegangHak({ email: PENGGUNA.email })).map((satu) => barisMakamSaya(satu, namaLokasi, aksiTerpilih))
    : [];

  return {
    aksiTerpilih,
    kartuAksi: urutkanKartu(aksiTerpilih),
    pilihanLokasi,
    form,
    status,
    pesan,
    retryAt: hasil.ok ? null : hasil.retryAt,
    ditemukan,
    tabSaya,
  };
}

/** The lookup a filled-in form asks for, or null while it is not filled in. */
function permintaanDari(form: TampilanHub["form"]): PermintaanCariMakam | null {
  if (form.lokasiId === "" || form.cari === null) return null;
  if (form.cari === "nama") {
    if (form.nama.trim() === "" || !TAHUN.test(form.tahun)) return null;
    return { bentuk: "nama", lokasiId: form.lokasiId, nama: form.nama, tahun: Number(form.tahun) };
  }
  if (form.nomor.trim() === "") return null;
  return { bentuk: form.cari, lokasiId: form.lokasiId, nomor: form.nomor };
}

/** A lookup result as the page reads it: the Lokasi named, the statuses in words, and nothing else. */
function terbaca(satu: MakamDitemukan, namaLokasi: ReadonlyMap<string, string>): MakamTerbaca {
  return {
    lokasiId: satu.lokasiId,
    namaLokasi: namaLokasi.get(satu.lokasiId) ?? "Lokasi Mitra",
    kavlingId: satu.kavlingId,
    nomorKavling: satu.nomorKavling,
    petak: satu.petak.map((petak) => ({
      petakId: petak.petakId,
      nomorMakam: petak.nomorMakam,
      almarhum: petak.almarhum,
      status: STATUS_HAK_PAKAI[petak.statusHakPakai],
      tanggalBerakhir: petak.tanggalBerakhir,
    })),
  };
}

/** The branch the family chose first, so a tile's action is the card they land on. */
function urutkanKartu(aksiTerpilih: AksiMakamKeluarga | null): KartuAksi[] {
  if (!aksiTerpilih) return [...kartuAksi];
  return [...kartuAksi].sort((a, b) => (a.aksi === aksiTerpilih ? -1 : b.aksi === aksiTerpilih ? 1 : 0));
}
