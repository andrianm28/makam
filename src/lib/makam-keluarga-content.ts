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
 * (docs/design-system.md, voice and tone).
 */

/** The hub's own address, and the two tiles that open it with an action preselected. */
export const HUB_PATH = "/makam-keluarga";

export type AksiMakamKeluarga = "tumpang" | "perpanjang" | "layanan" | "pengurusan";

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
  },
  {
    aksi: "layanan",
    label: "Layanan Makam",
    ringkas: "Perawatan makam dari daftar layanan: bunga, nisan, pembersihan dan pemotongan rumput.",
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
