import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/site/content-page";
import { IkonKedukaanBulat } from "@/components/site/ikon-kedukaan";
import { hrefKedukaan, kedukaanTampil, tampilKedukaan } from "@/lib/kedukaan-konten";

export const metadata: Metadata = {
  title: "Layanan Kedukaan — Makam.co.id",
  description: "Rumah duka mitra Makam.co.id; jasa cargo, repatriasi jenazah dan bunga duka cita segera hadir.",
};

/** The Layanan Kedukaan offered as icon cards (ADR 0010; rapat Ira, 6 Nov 2026): one not yet available says "Segera hadir" and links nowhere. */
export default function LayananKedukaanPage() {
  return (
    <ContentPage title="Layanan Kedukaan" lead="Kami bantu keluarga mengurus kebutuhan di hari-hari duka, dari penjemputan jenazah sampai bunga duka cita.">
      <ul className="grid gap-4 sm:grid-cols-2">
        {kedukaanTampil().map((konten) => {
          const isi = (
            <>
              <IkonKedukaanBulat nama={konten.ikon} />
              <span className="flex flex-col gap-1">
                <span className="text-title-3 font-semibold">{konten.judul}</span>
                <span className="text-body text-muted-foreground">{konten.ringkas}</span>
              </span>
            </>
          );
          const segera = konten.jenis !== "konsultasi" && tampilKedukaan[konten.jenis] === "segera";
          return (
            <li key={konten.jenis}>
              {segera ? (
                <div className="relative flex h-full items-start gap-4 rounded-2xl border bg-card p-5 opacity-80">
                  {isi}
                  <span className="absolute top-3 right-3 rounded-full bg-warning-soft px-2.5 py-0.5 text-caption font-semibold text-warning-soft-foreground">
                    Segera hadir
                  </span>
                </div>
              ) : (
                <Link href={hrefKedukaan(konten.jenis)} className="flex h-full items-start gap-4 rounded-2xl border bg-card p-5 hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/50">
                  {isi}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-body-lg">
        Merencanakan lebih awal?{" "}
        <Link href={hrefKedukaan("konsultasi")} className="font-semibold text-primary underline underline-offset-2">
          Minta Konsultasi Rencana Pemakaman
        </Link>
        .
      </p>
    </ContentPage>
  );
}
