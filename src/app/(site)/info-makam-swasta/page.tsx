import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { ContentPage, ContentPageFooter } from "@/components/site/content-page";
import { CsLink } from "@/components/site/cs-link";
import { serverRuntime } from "@/server/runtime";
import { DAFTAR_INFO_MAKAM_SWASTA, pesanKonsultasi } from "./daftar";

export const metadata: Metadata = {
  title: "Info Makam Swasta — Makam.co.id",
  description: "Informasi publik tentang pemakaman swasta yang belum bermitra dengan Makam.co.id. Konsultasi gratis lewat CS.",
};

/**
 * Info Makam Swasta: public information on private cemeteries that are not
 * Lokasi Mitra yet (see ./daftar.ts). Every card says it is not a partner, has
 * no price, no order and no pay button; the only action is a consultation with
 * the CS on WhatsApp (transactions stay on the platform, WhatsApp is CS only).
 */
export default async function InfoMakamSwastaPage() {
  const settings = await serverRuntime().operatorSettings.current();
  const contact = settings ? { whatsApp: settings.csWhatsApp, replyHours: settings.csReplyHours } : null;

  return (
    <ContentPage
      title="Info Makam Swasta"
      lead="Pemakaman swasta yang sedang kami ajak bermitra. Informasinya dari sumber publik, dan CS kami bisa membantu Anda bertanya."
    >
      <div role="note" className="rounded-xl border border-border bg-muted p-4 text-body">
        <p className="font-semibold">Belum bermitra dengan Makam.co.id</p>
        <p className="mt-1 text-muted-foreground">
          Lokasi di halaman ini belum Terverifikasi dan belum bisa dipesan atau dibayar lewat Makam.co.id. Data bisa
          berubah; pastikan langsung ke pengelolanya. Lokasi yang sudah bisa dipesan ada di{" "}
          <Link href="/lokasi" className="font-medium text-brand underline underline-offset-4">
            Daftar Lokasi
          </Link>
          .
        </p>
      </div>

      {DAFTAR_INFO_MAKAM_SWASTA.map((lokasi) => (
        <Card key={lokasi.slug} id={lokasi.slug}>
          <CardContent className="flex flex-col gap-3 pt-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-title-3 font-semibold">{lokasi.nama}</h2>
              <p className="text-small text-muted-foreground">
                {lokasi.kota} · Belum bermitra
              </p>
            </div>
            <dl className="flex flex-col gap-2 text-body">
              <Baris label="Alamat" isi={lokasi.alamat} />
              <Baris label="Pengelola" isi={lokasi.pengelola} />
              <Baris label="Untuk" isi={lokasi.segmen} />
              {lokasi.luas ? <Baris label="Luas" isi={lokasi.luas} /> : null}
              {lokasi.fasilitas ? <Baris label="Fasilitas" isi={lokasi.fasilitas} /> : null}
            </dl>
            <p className="text-small text-muted-foreground">Sumber: {lokasi.sumber.join("; ")}</p>
            <CsLink contact={contact} label="Konsultasi via CS" pesan={pesanKonsultasi(lokasi.nama)} />
          </CardContent>
        </Card>
      ))}

      <ContentPageFooter current="Info Makam Swasta" />
    </ContentPage>
  );
}

function Baris({ label, isi }: { label: string; isi: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-small text-muted-foreground">{label}</dt>
      <dd>{isi}</dd>
    </div>
  );
}
