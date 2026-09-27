/**
 * The public site's own navigation (spec, Public site and routing decisions):
 * the top bar and the mobile drawer list the same items, in the same order, and
 * the footer lists the content pages. One module, so the two can never drift.
 *
 * An item whose page has not been built yet carries no href and says
 * "Segera hadir." — never a dead link, never a date (docs/design-system.md, voice
 * and tone: no uncertain claims).
 */

export interface PublicMenuItem {
  /** What the item is called in the top bar, the drawer and the footer's sitemap. */
  label: string;
  /** Where the item goes; absent while its page is not built yet. */
  href?: string;
  /** One line on what the page is for, or "Segera hadir." while it is not built. */
  description: string;
}

const SEGERA = "Segera hadir.";

/** The items the top bar and the drawer both list, before the account item. */
export const publicMenuLabels = [
  "Pesan Makam",
  "Makam Keluarga",
  "Layanan",
  "Wakaf Tanah",
  "Daftar Lokasi",
] as const;

const items: PublicMenuItem[] = [
  {
    label: "Pesan Makam",
    href: "/pesan-makam/saat-duka",
    description: "Pesan makam saat keluarga berduka, atau siapkan untuk nanti.",
  },
  { label: "Makam Keluarga", description: SEGERA },
  { label: "Layanan", description: SEGERA },
  { label: "Wakaf Tanah", description: SEGERA },
  { label: "Daftar Lokasi", href: "/lokasi", description: "Lokasi Mitra yang sudah Terverifikasi, per kota dan fasilitas." },
];

/** The top bar's and the drawer's items in order, ending in Masuk or Akun Saya. */
export function publicMenu(options: { signedIn: boolean }): PublicMenuItem[] {
  const account: PublicMenuItem = options.signedIn
    ? { label: "Akun Saya", href: "/akun", description: "Email, nomor telepon dan pesanan Anda." }
    : { label: "Masuk", href: "/masuk", description: "Masuk dengan Kode Masuk, tanpa daftar." };
  return [...items, account];
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
];
