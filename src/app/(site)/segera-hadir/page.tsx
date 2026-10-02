import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/site/content-page";

export const metadata: Metadata = {
  title: "Segera hadir — Makam.co.id",
  robots: { index: false },
};

/**
 * What a family sees at the URL of a feature this environment has not opened yet
 * (src/proxy.ts rewrites to it, so an old link still lands somewhere kind).
 */
export default function SegeraHadirPage() {
  return (
    <ContentPage title="Segera hadir" lead="Layanan ini belum dibuka. Kami akan membukanya segera.">
      <p className="text-body-lg">
        Kalau Anda butuh bantuan sekarang, <Link href="/hubungi-kami" className="font-medium text-brand underline underline-offset-4">hubungi CS kami</Link>.
        Pesan makam, perpanjangan dan layanan perawatan di Lokasi Mitra sudah bisa dipakai dari{" "}
        <Link href="/" className="font-medium text-brand underline underline-offset-4">beranda</Link>.
      </p>
    </ContentPage>
  );
}
