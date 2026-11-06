import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage, ContentPageFooter } from "@/components/site/content-page";
import { CsLink } from "@/components/site/cs-link";
import { serverRuntime } from "@/server/runtime";
import { DAFTAR_INFO_MAKAM_SWASTA, pesanKonsultasi } from "./daftar";

export const metadata: Metadata = {
  title: "Info Makam Swasta — Makam.co.id",
  description: "Informasi publik tentang pemakaman swasta yang belum bermitra dengan Makam.co.id.",
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
      lead="Informasi dari sumber publik tentang beberapa pemakaman swasta. CS kami bisa membantu Anda bertanya."
    >
      <div role="note" className="rounded-2xl bg-brand-soft p-6 text-lg text-brand-soft-foreground">
        <p className="font-heading text-2xl font-extrabold">Belum bermitra dengan Makam.co.id</p>
        <p className="mt-2">
          Lokasi di halaman ini belum kami verifikasi dan tidak bisa dipesan atau dibayar lewat Makam.co.id. Keterangan
          fasilitas berasal dari pengelola atau berita, bisa berubah; pastikan langsung ke pengelolanya. Lokasi yang sudah bisa dipesan ada di{" "}
          <Link href="/lokasi" className="font-bold underline underline-offset-4">
            Daftar Lokasi
          </Link>
          .
        </p>
      </div>

      {DAFTAR_INFO_MAKAM_SWASTA.map((lokasi) => (
        <section key={lokasi.slug} id={lokasi.slug} aria-labelledby={`${lokasi.slug}-nama`} className="flex flex-col gap-5 rounded-2xl bg-forest p-7 text-ivory md:p-9">
            <div className="flex flex-col gap-1">
              <h2 id={`${lokasi.slug}-nama`} className="font-heading text-3xl font-extrabold tracking-tight md:text-4xl">{lokasi.nama}</h2>
              <p className="text-lg font-semibold text-sand">
                {lokasi.kota} · Belum bermitra
              </p>
            </div>
            <dl className="flex flex-col gap-3 text-lg">
              <Baris label="Alamat" isi={lokasi.alamat} />
              <Baris label="Pengelola" isi={lokasi.pengelola} />
              <Baris label="Untuk" isi={lokasi.segmen} />
              {lokasi.luas ? <Baris label="Luas" isi={lokasi.luas} /> : null}
              {lokasi.fasilitas ? <Baris label="Fasilitas (menurut sumber)" isi={lokasi.fasilitas} /> : null}
            </dl>
            <p className="text-body text-ivory/75">Sumber: {lokasi.sumber.join("; ")}</p>
            {contact ? (
              <CsLink
                contact={contact}
                label="Konsultasi via CS"
                pesan={pesanKonsultasi(lokasi.nama)}
                className="inline-flex h-14 w-fit items-center rounded-xl bg-ivory px-8 text-lg font-bold text-forest hover:bg-ivory/90"
              />
            ) : (
              <p className="text-lg text-ivory/85">
                Untuk konsultasi, lihat{" "}
                <Link href="/hubungi-kami" className="font-bold text-ivory underline underline-offset-4">
                  Hubungi Kami
                </Link>
                .
              </p>
            )}
        </section>
      ))}

      <ContentPageFooter current="Info Makam Swasta" />
    </ContentPage>
  );
}

function Baris({ label, isi }: { label: string; isi: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-body font-semibold text-sand">{label}</dt>
      <dd className="text-ivory">{isi}</dd>
    </div>
  );
}
