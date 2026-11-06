import type { Metadata } from "next";
import Link from "next/link";
import { MapPinIcon } from "lucide-react";
import { ContentPageFooter, PageHero } from "@/components/site/content-page";
import { pilGaris, pilUtama } from "@/components/site/gaya";
import { KartuCs } from "@/components/site/kartu-cs";
import { cn } from "@/lib/utils";
import { CsLink } from "@/components/site/cs-link";
import { serverRuntime } from "@/server/runtime";
import { pesanKonsultasi } from "./pesan";

export const metadata: Metadata = {
  title: "Info Makam Swasta — Makam.co.id",
  description: "Informasi publik tentang pemakaman swasta yang belum bermitra dengan Makam.co.id.",
};

/**
 * Info Makam Swasta: public information on private cemeteries that are not
 * Lokasi Mitra yet, as Admin Platform keeps them (Lokasi module). Every card says it is not a partner, has
 * no price, no order and no pay button; the only action is a consultation with
 * the CS on WhatsApp (transactions stay on the platform, WhatsApp is CS only).
 */
export default async function InfoMakamSwastaPage() {
  const settings = await serverRuntime().operatorSettings.current();
  const contact = settings ? { whatsApp: settings.csWhatsApp, replyHours: settings.csReplyHours } : null;
  const daftar = await serverRuntime().lokasi.infoMakamSwastaTayang();

  return (
    <main className="flex w-full flex-1 flex-col">
      <PageHero
        eyebrow="Informasi publik"
        title="Info Makam Swasta"
        lead="Informasi dari sumber publik tentang beberapa pemakaman swasta. CS kami bisa membantu Anda bertanya."
        poin={["Alamat, pengelola dan fasilitas menurut sumbernya", "Belum bisa dipesan atau dibayar di sini", "Lokasi Mitra yang bisa dipesan ada di Daftar Lokasi"]}
        samping={<KartuCs contact={contact} judul="Ingin bertanya soal lokasi ini?" />}
      >
        <Link href="/lokasi" className={pilUtama}>
          Lihat Daftar Lokasi
        </Link>
      </PageHero>
      <div className="mx-auto flex w-full max-w-(--page-max-width) flex-col gap-8 px-(--page-gutter) py-14 md:py-20">
      <div role="note" className="rounded-3xl border border-border bg-muted p-7 text-lg text-foreground">
        <p className="font-heading text-2xl font-extrabold text-forest">Belum bermitra dengan Makam.co.id</p>
        <p className="mt-2">
          Lokasi di halaman ini belum kami verifikasi dan tidak bisa dipesan atau dibayar lewat Makam.co.id. Keterangan
          fasilitas berasal dari pengelola atau berita, bisa berubah; tanyakan lewat CS kami. Lokasi yang sudah bisa dipesan ada di{" "}
          <Link href="/lokasi" className="font-bold text-forest underline underline-offset-4">
            Daftar Lokasi
          </Link>
          .
        </p>
      </div>

      {daftar.length === 0 ? <p className="text-lg text-muted-foreground">Belum ada informasi pemakaman swasta untuk ditampilkan.</p> : null}
      <ul className="grid gap-6 lg:grid-cols-2">
      {daftar.map((lokasi) => (
        <li key={lokasi.slug}>
        <section id={lokasi.slug} aria-labelledby={`${lokasi.slug}-nama`} className="flex h-full scroll-mt-28 flex-col gap-5 rounded-3xl border border-border bg-card p-7 shadow-md md:p-8">
            <span className="inline-flex size-14 items-center justify-center rounded-full bg-brand-soft text-forest" aria-hidden>
              <MapPinIcon className="size-7" />
            </span>
            <div className="flex flex-col gap-1">
              <h2 id={`${lokasi.slug}-nama`} className="font-heading text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">{lokasi.nama}</h2>
              <p className="flex flex-wrap items-center gap-2 text-lg text-muted-foreground">
                {lokasi.kota}
                <span className="rounded-full bg-muted px-3 py-0.5 text-body font-bold text-muted-foreground">Belum bermitra</span>
              </p>
            </div>
            <dl className="flex flex-col gap-3 text-lg">
              <Baris label="Alamat" isi={lokasi.alamat} />
              <Baris label="Pengelola" isi={lokasi.pengelola} />
              <Baris label="Untuk" isi={lokasi.segmen} />
              {lokasi.luas ? <Baris label="Luas" isi={lokasi.luas} /> : null}
              {lokasi.fasilitas ? <Baris label="Fasilitas (menurut sumber)" isi={lokasi.fasilitas} /> : null}
            </dl>
            <p className="text-body text-muted-foreground">Sumber: {lokasi.sumber.join("; ")}</p>
            {contact ? (
              <CsLink
                contact={contact}
                label="Konsultasi via CS"
                pesan={pesanKonsultasi(lokasi.nama)}
                className={cn(pilGaris, "mt-auto w-fit no-underline hover:no-underline")}
              />
            ) : (
              <p className="mt-auto text-lg text-muted-foreground">
                Untuk konsultasi, lihat{" "}
                <Link href="/hubungi-kami" className="font-bold text-forest underline underline-offset-4">
                  Hubungi Kami
                </Link>
                .
              </p>
            )}
        </section>
        </li>
      ))}
      </ul>

      <ContentPageFooter current="Info Makam Swasta" />
      </div>
    </main>
  );
}

function Baris({ label, isi }: { label: string; isi: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-body font-bold text-forest">{label}</dt>
      <dd className="text-foreground">{isi}</dd>
    </div>
  );
}
