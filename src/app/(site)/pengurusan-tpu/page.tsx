import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage, ContentPageFooter, ContentParagraphs } from "@/components/site/content-page";

export const metadata: Metadata = {
  title: "Pengurusan di TPU DKI — Makam.co.id",
  description: "Panduan pengurusan pemakaman di Tempat Pemakaman Umum DKI Jakarta.",
  // The guide this page will carry is written for a later release, so it is not
  // in the index yet; the page exists so the address never answers with a bare
  // 404, and says plainly what is and is not here.
  robots: { index: false, follow: true },
};

/**
 * Pengurusan di TPU DKI (spec, Content pages). The guide itself — the DIY
 * sequence, the two fees and the DKI Layanan price list — belongs to the release
 * that brings TPU, and this page does not guess at any of it: it says the guide
 * is not published yet, states the one thing a family needs to know now (the
 * permit is free, and filing it yourself is allowed), and points at the CS.
 */
export default function PengurusanTpuPage() {
  return (
    <ContentPage
      title="Pengurusan di TPU DKI"
      lead="Panduan lengkap tentang pemakaman di Tempat Pemakaman Umum DKI Jakarta belum dipublikasikan di sini."
    >
      <ContentParagraphs
        paragraphs={[
          "Halaman ini akan memuat urutan pengurusan, berkas yang perlu disiapkan, dan ketentuan biaya setelah pemakaman selesai di TPU.",
          "Satu hal yang bisa diketahui sekarang: izin penggunaan tanah makam di TPU diterbitkan pemerintah daerah dan tidak dipungut biaya kepada keluarga. Keluarga juga boleh mengurus berkas itu sendiri tanpa perantara.",
          "Kalau keluarga sedang menunggu pemakaman di TPU dan perlu bertanya sekarang, CS kami bisa dihubungi lewat WhatsApp lewat halaman Hubungi Kami.",
        ]}
      />
      <p className="text-body-lg">
        <Link href="/cara-kami-bekerja" className="font-medium text-brand underline underline-offset-4">
          Cara Kami Bekerja
        </Link>{" "}
        menjelaskan lebih jauh tentang berapa yang kami kenakan dan untuk apa.
      </p>
      <ContentPageFooter current="Pengurusan di TPU DKI" />
    </ContentPage>
  );
}
