/**
 * The Beranda's own copy: the hero, the tile row and the trust strip (spec,
 * Public site and routing decisions > Home). The copy is content, not domain data: nothing here is a price, a count
 * or a deadline, so no value is read from the database and none can go stale.
 * Everything a number would say is read on the page that owns it.
 *
 * The tile row is honest about the release. Perpanjang Makam and Layanan Makam
 * open the Makam keluarga hub with that action preselected (spec, Public site and
 * routing decisions), which is where each of them is arranged; Urus di TPU DKI and
 * Wakaf Tanah arrive in later releases, so their tiles name what the service is,
 * say "Segera hadir." and offer the CS — never a link to a page that is not there,
 * and never a date (docs/design-system.md, voice and tone).
 */
import type { LucideIcon } from "lucide-react";
import { BadgeCheckIcon, HandHeartIcon, ReceiptTextIcon } from "lucide-react";
import { tileKeHub } from "@/lib/makam-keluarga-content";

export interface HomepageTile {
  label: string;
  /** Absent while the service is not in this release: the tile says "Segera hadir" and offers the CS instead. */
  href?: string;
  /** One line on what the service is, in the family's words. */
  summary: string;
  /** The tile's photograph (docs/brand/stock-photos.md) and its alt text, in Bahasa Indonesia. */
  image: string;
  imageAlt: string;
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
  /** What a family is told before it starts: nothing is paid on sending. */
  reassurance: string;
  /** The hero photograph and its alt text, in Bahasa Indonesia. */
  photo: string;
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
  },
  reassurance: "Tidak ada yang dibayar saat mengirim pesanan, dan dokumen bisa menyusul.",
  photo: "/content/beranda-hero-keluarga.jpg",
  photoAlt: "Tiga bersaudara berdiri berdampingan dengan tenang di taman yang berkabut.",
};

/** The tile row's heading and line (public-site prototype). */
export const homepageTilesIntro = {
  heading: "Untuk makam keluarga",
  line: "Setelah pemakaman, kami tetap menemani: merawat, memperpanjang dan mengurus.",
};

export const homepageTiles: HomepageTile[] = [
  {
    label: "Perpanjang Makam",
    // The tile opens the Makam keluarga hub with Perpanjang already chosen (spec, Public site
    // and routing decisions): the hub owns the branch.
    href: tileKeHub.perpanjang,
    summary: "Perpanjang masa Hak Pakai makam keluarga sebelum berakhir.",
    image: "/content/beranda-tile-perpanjang.jpg",
    imageAlt: "Area makam yang teduh dengan rumput terawat dan pohon besar.",
  },
  {
    label: "Layanan Makam",
    href: tileKeHub.layanan,
    summary: "Bunga, nisan, pembersihan dan perawatan makam, dengan foto bukti.",
    image: "/content/beranda-tile-layanan.jpg",
    imageAlt: "Rangkaian bunga putih di atas makam.",
  },
  {
    label: "Urus di TPU DKI",
    summary: "Panduan gratis mengurus sendiri, atau kami bantu urus izinnya.",
    image: "/content/beranda-tile-tpu.jpg",
    imageAlt: "Pemakaman umum di Jakarta yang hijau dengan gedung di kejauhan.",
  },
  {
    label: "Wakaf Tanah",
    summary: "Ajukan wakaf tanah untuk pemakaman; kami hubungkan dengan Nazhir.",
    image: "/content/beranda-tile-wakaf.jpg",
    imageAlt: "Hamparan sawah hijau dengan rumah di kejauhan.",
  },
];

export interface HomepageTrustColumn {
  /** The brand's north star, one word per column (docs/design-system.md). */
  label: string;
  /** The one concrete line that backs the word up. */
  line: string;
  icon: LucideIcon;
}

/**
 * Dibantu · Jelas · Aman. Each line is something the platform really does in this
 * release, and the Dibantu line says nothing about TPU paperwork, which only
 * arrives in a later release (spec, release plan). Cara Kami Bekerja explains
 * all three, linked once under the strip.
 */
export const homepageTrust: HomepageTrustColumn[] = [
  {
    label: "Dibantu",
    line: "Bantuan administrasi pemakaman, dari memilih makam sampai dokumen, oleh tim yang bisa Anda hubungi.",
    icon: HandHeartIcon,
  },
  {
    label: "Jelas",
    line: "Harga di halaman lokasi sama dengan harga di Tagihan. Biaya Layanan Platform selalu tertulis terpisah.",
    icon: ReceiptTextIcon,
  },
  {
    label: "Aman",
    line: "Setiap Lokasi Mitra dikunjungi dan diperiksa petugas kami, dan dokumen keluarga disimpan secara privat.",
    icon: BadgeCheckIcon,
  },
];

export const homepageTrustHeading = "Dibantu, jelas, aman";
export const homepageTrustLink = { label: "Cara Kami Bekerja", href: "/cara-kami-bekerja" };

/** The CS band near the foot of the Beranda. */
export const homepageCsBand = {
  heading: "Butuh bantuan memilih langkah?",
  line: "Tim kami siap mendampingi lewat WhatsApp",
};
