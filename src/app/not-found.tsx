import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/makam/brand-logo";

export const metadata: Metadata = {
  title: "Halaman tidak ditemukan — Makam.co.id",
  robots: { index: false, follow: true },
};

/**
 * The 404 of the whole site, for an address that matches no page at all. It is
 * static on purpose — a page that cannot be found must not need a database to
 * say so — so it points at the pages that can be found rather than quoting a
 * number nobody has entered yet.
 */
export default function HalamanTidakDitemukan() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-start gap-6 px-(--page-gutter) py-20">
      <Link href="/" aria-label="Makam.co.id, beranda" className="rounded-sm">
        <BrandLogo />
      </Link>
      <h1 className="font-serif text-title-1 font-semibold tracking-tight">Halaman tidak ditemukan</h1>
      <p className="text-body-lg text-muted-foreground">
        Alamat yang Anda buka tidak ada di makam.co.id. Mungkin ada salah ketik, atau halamannya sudah dipindahkan.
      </p>
      <nav aria-label="Halaman lain" className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Link href="/" className="text-body-lg font-medium text-brand underline underline-offset-4">
          Beranda
        </Link>
        <Link href="/lokasi" className="text-body-lg font-medium text-brand underline underline-offset-4">
          Daftar Lokasi
        </Link>
        <Link href="/hubungi-kami" className="text-body-lg font-medium text-brand underline underline-offset-4">
          Hubungi Kami
        </Link>
      </nav>
    </main>
  );
}
