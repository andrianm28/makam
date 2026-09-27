/**
 * The Beranda's own copy: the hero, the tile row and the trust strip (spec,
 * Public site and routing decisions > Home). The copy is content, not domain data: nothing here is a price, a count
 * or a deadline, so no value is read from the database and none can go stale.
 * Everything a number would say is read on the page that owns it.
 *
 * The tile row is honest about the release: Perpanjang Makam, Layanan Makam,
 * Urus di TPU DKI and Wakaf Tanah arrive in later releases, so a tile names what
 * the service is, says "Segera hadir." and offers the CS — never a link to a
 * page that is not there, and never a date (docs/design-system.md, voice and
 * tone).
 */
import type { LucideIcon } from "lucide-react";
import { Flower2Icon, HandCoinsIcon, LandmarkIcon, RefreshCcwIcon } from "lucide-react";

/** What a tile says about a service that is in a later release. */
const SEGERA_HADIR = "Segera hadir.";

export interface HomepageTile {
  label: string;
  /** Absent while the service is not in this release: the tile offers the CS instead. */
  href?: string;
  /** One line on what the service is, in the family's words. */
  summary: string;
  /** What the tile says about its own availability. */
  description: string;
  icon: LucideIcon;
}

/**
 * The hero (spec, Home): the brand master message, the tagline, then the urgent
 * entry as the one button and the planned one as a quiet text link beside it —
 * a family in a hurry reads the button first, a family planning ahead finds its
 * own way without the page pushing it.
 */
export interface HomepageHero {
  /** The brand master message, in Lora. */
  headline: string;
  tagline: string;
  /** Saat Duka: the button. */
  urgent: { label: string; caption: string; href: string };
  /** Terencana: the text link, never a second button. */
  planned: { label: string; href: string; prefetch?: boolean };
  /** Alt text for the hero photograph, in Bahasa Indonesia. */
  photoAlt: string;
}

export const homepageHero: HomepageHero = {
  headline: "Urus Pemakaman dengan Tenang, dalam Satu Platform.",
  tagline: "Menemani Keluarga, Menjaga Kenangan.",
  urgent: {
    label: "Pesan makam sekarang",
    caption: "untuk keluarga yang baru saja kehilangan",
    href: "/pesan-makam/saat-duka",
  },
  planned: {
    label: "Siapkan makam untuk nanti",
    href: "/pesan-makam/terencana",
    // The Terencana wizard arrives in this same release (ticket 36). Until it does,
    // the router's prefetch of a route that is not there never settles, so the
    // page holds a request open on every view. Drop this when 36 lands.
    prefetch: false,
  },
  photoAlt: "Keluarga tiga generasi duduk bersama di taman pada sore hari yang hangat.",
};

export const homepageTiles: HomepageTile[] = [
  {
    label: "Perpanjang Makam",
    summary: "Memperpanjang Hak Pakai Petak Makam atau Kavling Keluarga di Lokasi Mitra, beserta masa tenggangnya.",
    description: SEGERA_HADIR,
    icon: RefreshCcwIcon,
  },
  {
    label: "Layanan Makam",
    summary: "Perawatan makam dari daftar layanan: bunga, nisan, pembersihan dan pemotongan rumput.",
    description: SEGERA_HADIR,
    icon: Flower2Icon,
  },
  {
    label: "Urus di TPU DKI",
    summary: "Panduan pengurusan pemakaman di Tempat Pemakaman Umum DKI Jakarta, termasuk berkas izinnya.",
    description: SEGERA_HADIR,
    icon: LandmarkIcon,
  },
  {
    label: "Wakaf Tanah",
    summary: "Wakaf tanah untuk makam, diurus bersama nazhir. Makam.co.id tidak pernah menjadi pemilik tanah.",
    description: SEGERA_HADIR,
    icon: HandCoinsIcon,
  },
];

export interface HomepageTrustColumn {
  /** The brand's north star, one word per column (docs/design-system.md). */
  label: string;
  /** The one concrete line that backs the word up. */
  line: string;
  /** Where the claim is explained in full. */
  href: string;
}

/**
 * Dibantu · Jelas · Aman. Each line is something the platform really does in this
 * release, and the Dibantu line says nothing about TPU paperwork, which only
 * arrives in a later release (spec, release plan).
 */
export const homepageTrust: HomepageTrustColumn[] = [
  {
    label: "Dibantu",
    line: "Administrasi pemakaman dikerjakan bersama keluarga, satu langkah pada satu waktu, sampai bukti pemesanan keluar.",
    href: "/cara-kami-bekerja",
  },
  {
    label: "Jelas",
    line: "Harga di halaman sama dengan Tagihan, dan Biaya Layanan Platform selalu tertulis terpisah.",
    href: "/cara-kami-bekerja",
  },
  {
    label: "Aman",
    line: "Setiap Lokasi Mitra dikunjungi langsung sebelum ditampilkan, dan berkas keluarga disimpan terpisah.",
    href: "/cara-kami-bekerja",
  },
];
