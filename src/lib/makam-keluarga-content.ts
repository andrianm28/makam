/**
 * The Makam keluarga hub's own words and addresses (spec, Public site and
 * routing decisions: "The Makam keluarga hub owns the Lokasi Mitra / TPU
 * branch for tumpang, Perpanjang, Layanan and Pengurusan IPTM. The Perpanjang
 * Makam and Layanan Makam tiles open it with that action preselected").
 *
 * Content, not domain data: no price, count, deadline or opening hour is written
 * here, so nothing in it can go stale. What a family is told about a grave is
 * read through the Inventory module's lookup on the page that shows it.
 *
 * The four actions are the hub's **branches**. Each one's flow is built by a
 * later ticket (tumpang 35, Perpanjang 40/41, Layanan 50/53/54, Pengurusan IPTM
 * 47/48), so a card carries no `href` while its flow is not there, says "Segera
 * hadir." and offers the CS instead — never a dead link and never a date
 * (docs/design-system.md, voice and tone). The Layanan branch's flow is here
 * (50), so its card and the graves below it link to the checkout.
 */

// A type only, so it is erased: this module's values stay safe on a client
// component's import graph, where a domain module's own code would not be.
import type { MakamDitemukan, MakamSaya } from "@/domain/inventory";

/** A Hak Pakai status as a family is told: the word, and what it means for them. */
export interface StatusHakPakaiTerbaca {
  key: "aktif" | "kedaluwarsa" | "berakhir" | "dibatalkan";
  label: string;
  /** What the status means and what happens next (docs/design-system.md: explain every status). */
  arti: string;
}

export const STATUS_HAK_PAKAI: Record<StatusHakPakaiTerbaca["key"], StatusHakPakaiTerbaca> = {
  aktif: { key: "aktif", label: "Aktif", arti: "Hak Pakai masih berlaku di Lokasi Mitra ini." },
  kedaluwarsa: {
    key: "kedaluwarsa",
    label: "Masa Berlaku Habis",
    arti: "Masa Hak Pakai sudah habis, jadi perpanjangan perlu diminta ke Lokasi Mitra.",
  },
  berakhir: { key: "berakhir", label: "Berakhir", arti: "Hak Pakai sudah berakhir; hubungi pengelola Lokasi Mitra untuk urusannya." },
  dibatalkan: { key: "dibatalkan", label: "Dibatalkan", arti: "Hak Pakai dibatalkan, sehingga petak ini sudah dikembalikan ke Lokasi Mitra." },
};

/** The hub's own address, and the two tiles that open it with an action preselected. */
export const HUB_PATH = "/makam-keluarga";

export type AksiMakamKeluarga = "tumpang" | "perpanjang" | "layanan" | "pengurusan";

/** The Layanan branch's own address: the order's checkout, reached with the grave the lookup named. */
export const LAYANAN_PATH = "/layanan";

/** Every branch the hub owns, in the order it shows them. */
export const AKSI_MAKAM_KELUARGA: readonly AksiMakamKeluarga[] = ["tumpang", "perpanjang", "layanan", "pengurusan"];

export interface KartuAksi {
  aksi: AksiMakamKeluarga;
  /** What the tile on the Beranda and the hub's card are both called. */
  label: string;
  /** One line on what it is for, in the family's words. */
  ringkas: string;
  /** Absent while the flow itself is not built: the card says so and offers the CS instead. */
  href?: string;
  /**
   * What the card says instead of "Segera hadir" when its flow is built but starts from a grave, so
   * the card itself has no address: the step to take on the result of the lookup.
   */
  langkah?: string;
}

/** What a service that is in a later release says about itself. */
export const SEGERA_HADIR = "Segera hadir.";

export const kartuAksi: readonly KartuAksi[] = [
  {
    aksi: "tumpang",
    label: "Makamkan di sini",
    ringkas: "Menguburkan Almarhum lain di Hak Pakai yang sudah ada, tanpa membeli petak baru.",
  },
  {
    aksi: "perpanjang",
    label: "Perpanjang Makam",
    ringkas: "Memperpanjang Hak Pakai Petak Makam atau Kavling Keluarga beserta masa tenggangnya.",
    langkah: "Cari makamnya di atas, lalu pilih Perpanjang Makam pada hasil pencarian.",
  },
  {
    aksi: "layanan",
    label: "Layanan Makam",
    ringkas: "Perawatan makam dari daftar layanan: bunga, nisan, pembersihan dan pemotongan rumput.",
    href: LAYANAN_PATH,
  },
  {
    aksi: "pengurusan",
    label: "Pengurusan IPTM",
    ringkas: "Mengurus Izin Penggunaan Tanah Makam di TPU DKI untuk petak yang sudah dimakamkan di sana.",
  },
];

/** The Beranda's Perpanjang Makam and Layanan Makam tiles open the hub with that action preselected. */
export const tileKeHub: Record<"perpanjang" | "layanan", string> = {
  perpanjang: `${HUB_PATH}?aksi=perpanjang`,
  layanan: `${HUB_PATH}?aksi=layanan`,
};

/** The TPU branch's way out: the guide that exists, and the TPU half of the directory. */
export const TPU_GUIDE_PATH = "/pengurusan-tpu";
export const TPU_DAFTAR_PATH = "/lokasi?jenis=tpu";

/**
 * The Layanan branch with one grave named, as a found grave links to it. A Petak
 * Makam is addressed by its id here (not its number): the number is what the family
 * reads, and the page re-reads the grave's own state from the Inventory module, so a
 * stale address cannot order for a plot that has moved on.
 */
export function layananPath(params: { lokasiId: string; petakId: string }): string {
  return `${LAYANAN_PATH}?lokasi=${encodeURIComponent(params.lokasiId)}&petak=${encodeURIComponent(params.petakId)}`;
}

/** Which of the three ways a family names the grave they are looking for. */
export const BENTUK_CARI = ["nomor_makam", "nomor_kavling", "nama"] as const;
export type BentukCari = (typeof BENTUK_CARI)[number];

/** What the form's three choices are called. */
export const labelBentukCari: Record<BentukCari, string> = {
  nomor_makam: "Nomor Makam",
  nomor_kavling: "Nomor Kavling",
  nama: "Nama Almarhum",
};

/** One of the hub's own values, or null for anything else: an unrecognised query is no choice, never an error. */
function dari<T extends string>(daftar: readonly T[], value: string | string[] | undefined): T | null {
  const ditanya = Array.isArray(value) ? value[0] : value;
  return daftar.find((kandidat) => kandidat === ditanya) ?? null;
}

/** An action the hub was opened with, or null when it was opened with none (or with one it does not own). */
export function aksiDari(value: string | string[] | undefined): AksiMakamKeluarga | null {
  return dari(AKSI_MAKAM_KELUARGA, value);
}

/** Which of the three forms a family is on, or null when the page was opened with none. */
export function bentukCariDari(value: string | string[] | undefined): BentukCari | null {
  return dari(BENTUK_CARI, value);
}

/** The card of one action, for the hub to render; it throws for an action it does not own. */
export function kartuUntuk(aksi: AksiMakamKeluarga): KartuAksi {
  const kartu = kartuAksi.find((satu) => satu.aksi === aksi);
  if (!kartu) throw new Error(`The hub owns no action "${aksi}"`);
  return kartu;
}

/**
 * A hub address that keeps the branch open: the preselected action survives, so
 * a family that arrived from the Perpanjang Makam tile and then used the lookup
 * lands on the grave with Perpanjang still the action in front of them. A
 * shortcut out of the Akun's Makam tab is the same address with the unit named.
 */
export function hubPath(params: { aksi?: AksiMakamKeluarga | null; lokasiId?: string | null; cari?: BentukCari | null; nomor?: string | null }): string {
  const search = new URLSearchParams();
  if (params.aksi) search.set("aksi", params.aksi);
  if (params.lokasiId && params.cari) {
    search.set("lokasi", params.lokasiId);
    search.set("cari", params.cari);
    if (params.nomor) search.set("nomor", params.nomor);
  }
  const query = search.toString();
  return query === "" ? HUB_PATH : `${HUB_PATH}?${query}`;
}

/** One grave of a signed-in Akun's Makam tab, as the tab lists it. */
export interface BarisMakamSaya {
  lokasiId: string;
  namaLokasi: string;
  /** The unit's own number: a Kavling Keluarga's, or the Petak's. */
  nomor: string;
  almarhum: string[];
  /** The hub address that opens this grave, with the branch still chosen. */
  alamat: string;
}

/**
 * One grave of the Akun's own as a shortcut into the hub — one rule, two surfaces:
 * the hub's own tab and Akun Saya's card both show it, and if they ever disagreed about
 * which number names the unit, one of the two links would open nothing.
 *
 * A Kavling Keluarga is named by its Nomor Kavling and looked up as one; a Petak of its own
 * by its Nomor Makam. `namaLokasi` is the caller's public Lokasi list: a Lokasi Mitra that
 * is not listed has no name here, and the row says "Lokasi Mitra" rather than guess one.
 */
export function barisMakamSaya(
  satu: MakamDitemukan,
  namaLokasi: ReadonlyMap<string, string>,
  aksiTerpilih: AksiMakamKeluarga | null = null,
): BarisMakamSaya {
  const cari: BentukCari = satu.kavlingId === null ? "nomor_makam" : "nomor_kavling";
  const nomor = satu.nomorKavling ?? satu.petak[0]?.nomorMakam ?? "";
  const pengelola = lokasiBerhenti.get(satu.lokasiId);
  return {
    lokasiId: satu.lokasiId,
    namaLokasi: namaLokasi.get(satu.lokasiId) ?? "Lokasi Mitra",
    nomor,
    almarhum: satu.petak.flatMap((petak) => petak.almarhum),
    alamat: hubPath({ aksi: aksiTerpilih, lokasiId: satu.lokasiId, cari, nomor }),
  };
}

/** One document on the Akun Saya Makam tab's own card: what it is, and where it opens (an unguessable link). */
export interface DokumenMakamSaya {
  nomor: string;
  href: string;
}

/** One burial the Makam tab's card shows, oldest first (the same order `MakamSaya.pemakaman` carries it in). */
export interface PemakamanMakamSaya {
  almarhumName: string;
  /** A whole date, "YYYY-MM-DD". */
  date: string;
}

/** One grave of a signed-in Akun's own Makam tab (ticket 27), full detail rather than a shortcut. */
export interface KartuMakamSaya {
  hakPakaiId: string;
  lokasiId: string;
  namaLokasi: string;
  /** The unit's own number: a Kavling Keluarga's, or the Petak's. */
  nomor: string;
  petak: { nomorMakam: string }[];
  status: StatusHakPakaiTerbaca;
  tanggalBerakhir: string | null;
  pemakaman: PemakamanMakamSaya[];
  dokumen: DokumenMakamSaya[];
  /** The hub address that opens this grave, for a later ticket's actions (tumpang, Perpanjang, Layanan, Pengurusan IPTM). */
  alamat: string;
  /** True once the Lokasi's Berhenti has taken effect: the record stays, with no Perpanjang, Layanan or other action (ticket 59). */
  hanyaBaca: boolean;
  /** Read-only cards only: who runs the Lokasi Mitra, for the family to reach it about the record (ticket 59). */
  pengelola: { name: string; address: string } | null;
}

/** What the Lokasi Mitra holds of its pengelola. */
export interface PengelolaLokasi {
  pengelolaName: string;
  address: string;
}

/**
 * One `MakamSaya` (the Inventory module's own read for this tab) as the Makam
 * tab's card reads it: the Lokasi named, the status in words, and its documents
 * as addresses rather than raw links (the caller reads those separately, since
 * they are Pemesanan's own row, not Inventory's — AGENTS.md: only the owning
 * module reads its own tables).
 */
export function kartuMakamSaya(
  satu: MakamSaya,
  namaLokasi: ReadonlyMap<string, string>,
  dokumen: readonly DokumenMakamSaya[],
  /** Lokasi whose Berhenti has taken effect (the Lokasi module says so, `izinPesanan(.., "lanjutan")`), with their pengelola. */
  lokasiBerhenti: ReadonlyMap<string, PengelolaLokasi> = new Map(),
): KartuMakamSaya {
  const cari: BentukCari = satu.kavlingId === null ? "nomor_makam" : "nomor_kavling";
  const nomor = satu.nomorKavling ?? satu.petak[0]?.nomorMakam ?? "";
  const pengelola = lokasiBerhenti.get(satu.lokasiId);
  return {
    hakPakaiId: satu.hakPakaiId,
    lokasiId: satu.lokasiId,
    namaLokasi: namaLokasi.get(satu.lokasiId) ?? "Lokasi Mitra",
    nomor,
    petak: satu.petak.map((petak) => ({ nomorMakam: petak.nomorMakam })),
    status: STATUS_HAK_PAKAI[satu.status],
    tanggalBerakhir: satu.tanggalBerakhir,
    pemakaman: satu.pemakaman.map((satuPemakaman) => ({ almarhumName: satuPemakaman.almarhumName, date: satuPemakaman.date })),
    dokumen: [...dokumen],
    alamat: hubPath({ lokasiId: satu.lokasiId, cari, nomor }),
    hanyaBaca: pengelola !== undefined,
    pengelola: pengelola ? { name: pengelola.pengelolaName, address: pengelola.address } : null,
  };
}
