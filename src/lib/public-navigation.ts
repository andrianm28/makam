/**
 * The public site's own navigation (spec, Public site and routing decisions):
 * the top bar and the mobile drawer list the same items, in the same order, and
 * the footer lists the content pages. One module, so the two can never drift.
 *
 * An item whose page has not been built yet carries no href and says
 * "Segera hadir." — never a dead link, never a date (docs/design-system.md, voice
 * and tone: no uncertain claims). The Makam Keluarga hub is built, so its item
 * opens the hub.
 */

import { HUB_PATH } from "@/lib/makam-keluarga-content";
import { terbukaDi, type Rilis } from "@/lib/rilis-peta";

export interface PublicMenuItem {
  /** What the item is called in the top bar, the drawer and the footer's sitemap. */
  label: string;
  /** Where the item goes; absent while its page is not built yet. */
  href?: string;
  /** One line on what the page is for, or "Segera hadir." while it is not built. */
  description: string;
  /** The pages a group opens onto (Jasa Pemakaman, Layanan Kedukaan): a dropdown in the top bar, a nested list in the drawer. */
  children?: PublicMenuItem[];
}

const SEGERA = "Segera hadir.";

/**
 * The four groups the owner set (dri, 2026-11-02; ADR 0010), in this order, before the account item:
 * Jasa Pemakaman, Layanan Kedukaan, the wakaf programme and Daftar Lokasi.
 */
export const publicMenuLabels = ["Jasa Pemakaman", "Layanan Kedukaan", "Wakaf Tanah Pemakaman", "Daftar Lokasi"] as const;

const jasaPemakaman: PublicMenuItem = {
  label: "Jasa Pemakaman",
  href: "/pesan-makam/saat-duka",
  description: "Pesan makam sekarang, rencanakan lebih awal, atau urus makam keluarga.",
  children: [
    { label: "Pesan Sekarang", href: "/pesan-makam/saat-duka", description: "Pesan makam saat keluarga berduka." },
    { label: "Konsultasi Rencana Pemakaman", href: "/konsultasi-rencana-pemakaman", description: "Bicara dengan tim kami sebelum memilih makam." },
    { label: "Makam Keluarga", href: HUB_PATH, description: "Perpanjang, rawat atau urus berkas makam keluarga." },
  ],
};

const layananKedukaan: PublicMenuItem = {
  label: "Layanan Kedukaan",
  href: "/layanan-kedukaan",
  description: "Rumah duka, mobil jenazah, cargo dan repatriasi, peti, dan bunga duka cita.",
  children: [
    { label: "Rumah Duka", href: "/layanan-kedukaan/rumah-duka", description: "Tempat persemayaman dan menerima pelayat." },
    { label: "Mobil Jenazah", href: "/layanan-kedukaan/mobil-jenazah", description: "Penjemputan dan pengantaran jenazah." },
    { label: "Jasa Cargo Jenazah", href: "/layanan-kedukaan/cargo-jenazah", description: "Pengiriman jenazah antarkota." },
    { label: "Jasa Repatriasi Jenazah", href: "/layanan-kedukaan/repatriasi-jenazah", description: "Pemulangan jenazah dari luar negeri." },
    { label: "Peti Jenazah", href: "/layanan-kedukaan/peti-jenazah", description: "Peti sesuai kebutuhan dan tradisi." },
    { label: "Bunga Duka Cita", href: "/layanan-kedukaan/bunga-duka-cita", description: "Karangan dan rangkaian bunga duka cita." },
  ],
};

const daftarLokasi: PublicMenuItem = { label: "Daftar Lokasi", href: "/lokasi", description: "Lokasi Mitra yang sudah Terverifikasi, per kota dan fasilitas." };

/** The top bar's and the drawer's items in order, ending in Masuk or Akun Saya. */
export function publicMenu(options: { signedIn: boolean; /** The release the environment has opened (ADR 0006); the wakaf programme links once it is open. */ rilis?: Rilis }): PublicMenuItem[] {
  const account: PublicMenuItem = options.signedIn
    ? { label: "Akun Saya", href: "/akun", description: "Email, nomor telepon dan pesanan Anda." }
    : { label: "Masuk", href: "/masuk", description: "Masuk dengan Kode Masuk, tanpa daftar." };
  const wakaf: PublicMenuItem = terbukaDi("wakaf", options.rilis ?? 1)
    ? { label: "Wakaf Tanah Pemakaman", href: "/wakaf-tanah", description: "Program wakaf tanah untuk pemakaman; kami hubungkan dengan Nazhir." }
    : { label: "Wakaf Tanah Pemakaman", description: SEGERA };
  return [jasaPemakaman, layananKedukaan, wakaf, daftarLokasi, account];
}

/** The account entry (Masuk or Akun Saya), which the top bar shows as its own button. */
export function isAccountItem(item: PublicMenuItem): boolean {
  return item.href === "/masuk" || item.href === "/akun";
}

/** The content pages, in the order the footer lists them. */
export interface ContentPageLink {
  href: string;
  label: string;
}

export const contentPageLinks: ContentPageLink[] = [
  { href: "/tentang-kami", label: "Tentang Kami" },
  { href: "/cara-kami-bekerja", label: "Cara Kami Bekerja" },
  { href: "/faq", label: "FAQ" },
  { href: "/hubungi-kami", label: "Hubungi Kami" },
  { href: "/lokasi", label: "Daftar Lokasi" },
  { href: "/kebijakan-privasi", label: "Kebijakan Privasi" },
];
