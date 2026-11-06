/**
 * The public site's own navigation (spec, Public site and routing decisions):
 * the top bar and the mobile drawer list the same items, in the same order, and
 * the footer lists the content pages. One module, so the two can never drift.
 *
 * An item whose page has not been built yet carries no href and says
 * "Segera hadir." — never a dead link, never a date (docs/design-system.md, voice
 * and tone: no uncertain claims).
 */

import { kedukaanTampil, hrefKedukaan, tampilKedukaan } from "@/lib/kedukaan-konten";
import type { Rilis } from "@/lib/rilis-peta";

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
 * The three groups before the account item (rapat Ira, 6 Nov 2026, on ADR 0010's four): Jasa
 * Pemakaman, Layanan Kedukaan and Proteksi Kedukaan, which takes the wakaf programme's place.
 * Daftar Lokasi left the menu: browsing a Lokasi Mitra goes through Pesan Sekarang.
 */
export const publicMenuLabels = ["Jasa Pemakaman", "Layanan Kedukaan", "Proteksi Kedukaan"] as const;

const jasaPemakaman: PublicMenuItem = {
  label: "Jasa Pemakaman",
  href: "/pesan-makam/saat-duka",
  description: "Pesan makam sekarang, atau rencanakan lebih awal bersama tim kami.",
  // Makam Keluarga is hidden for now (rapat Ira, 6 Nov 2026): its history and certificates in Akun come later.
  children: [
    { label: "Pesan Sekarang", href: "/pesan-makam/saat-duka", description: "Pesan makam saat keluarga berduka." },
    { label: "Konsultasi Rencana Pemakaman", href: "/konsultasi-rencana-pemakaman", description: "Bicara dengan tim kami sebelum memilih makam." },
  ],
};

const layananKedukaan: PublicMenuItem = {
  label: "Layanan Kedukaan",
  href: "/layanan-kedukaan",
  description: "Rumah duka mitra; cargo, repatriasi dan bunga duka cita segera hadir.",
  children: kedukaanTampil().map((konten) =>
    konten.jenis !== "konsultasi" && tampilKedukaan[konten.jenis] === "segera"
      ? { label: konten.judul, description: SEGERA }
      : { label: konten.judul, href: hrefKedukaan(konten.jenis), description: konten.ringkas },
  ),
};

/** Proteksi Kedukaan (rapat Ira, 6 Nov 2026): a collective funeral-protection plan with an insurer, in place of the wakaf programme; not built yet. */
const proteksiKedukaan: PublicMenuItem = { label: "Proteksi Kedukaan", description: SEGERA };

/** The top bar's and the drawer's items in order, ending in Masuk or Akun Saya. */
export function publicMenu(options: { signedIn: boolean; /** The release the environment has opened (ADR 0006); kept for the callers, the menu no longer depends on it. */ rilis?: Rilis }): PublicMenuItem[] {
  const account: PublicMenuItem = options.signedIn
    ? { label: "Akun Saya", href: "/akun", description: "Email, nomor telepon dan pesanan Anda." }
    : { label: "Masuk", href: "/masuk", description: "Masuk dengan Kode Masuk, tanpa daftar." };
  return [jasaPemakaman, layananKedukaan, proteksiKedukaan, account];
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
  { href: "/kebijakan-privasi", label: "Kebijakan Privasi" },
];
