"use client";

/* PROTOTYPE, throwaway. Beranda. */
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, HandHeart, MessageCircle, ReceiptText } from "lucide-react";
import { BASE, CS } from "./_mock/data";
import { usePratinjau } from "./_parts/site-shell";

const TILES = [
  {
    id: "perpanjang",
    title: "Perpanjang Makam",
    text: "Perpanjang masa Hak Pakai makam keluarga sebelum berakhir.",
    img: "/pratinjau/publik/tile-perpanjang.jpg",
    alt: "Area makam yang teduh dengan rumput terawat dan pohon besar",
  },
  {
    id: "layanan",
    title: "Layanan Makam",
    text: "Bunga, nisan, pembersihan dan perawatan makam, dengan foto bukti.",
    img: "/pratinjau/publik/tile-layanan.jpg",
    alt: "Rangkaian bunga putih di atas makam",
  },
  {
    id: "tpu",
    title: "Urus di TPU DKI",
    text: "Panduan gratis mengurus sendiri, atau kami bantu urus izinnya.",
    img: "/pratinjau/publik/tile-tpu.jpg",
    alt: "Pemakaman umum di Jakarta yang hijau dengan gedung di kejauhan",
  },
  {
    id: "wakaf",
    title: "Wakaf Tanah",
    text: "Ajukan wakaf tanah untuk pemakaman; kami hubungkan dengan Nazhir.",
    img: "/pratinjau/publik/tile-wakaf.jpg",
    alt: "Hamparan sawah hijau dengan rumah di kejauhan",
  },
];

export default function BerandaPratinjau() {
  const { semuaRilis, segera } = usePratinjau();

  const trust = [
    {
      icon: HandHeart,
      title: "Dibantu",
      text: semuaRilis
        ? "Bantuan administrasi pemakaman, termasuk berkas izin makam di TPU DKI."
        : "Bantuan administrasi pemakaman, dari memilih makam sampai dokumen, oleh tim yang bisa Anda hubungi.",
    },
    {
      icon: ReceiptText,
      title: "Jelas",
      text: "Harga di halaman lokasi sama dengan harga di Tagihan. Biaya Layanan Platform selalu tertulis terpisah.",
    },
    {
      icon: BadgeCheck,
      title: "Aman",
      text: "Setiap Lokasi Mitra dikunjungi dan diperiksa petugas kami, dan dokumen keluarga disimpan secara privat.",
    },
  ];

  return (
    <>
      {/* Hero */}
      <section className="px-4 pt-4 md:px-8 md:pt-8">
        <div className="mx-auto grid max-w-[80rem] overflow-hidden rounded-3xl bg-forest lg:grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col justify-center gap-6 px-6 py-10 sm:px-10 md:py-14 lg:px-14 lg:py-20">
            <h1 className="font-serif text-[2.125rem] leading-[1.15] font-semibold text-ivory sm:text-5xl sm:leading-[1.1] lg:text-[3.5rem]">
              Urus Pemakaman dengan Tenang, dalam Satu Platform.
            </h1>
            <p className="text-body-lg text-sand sm:text-title-2 sm:font-normal">Menemani Keluarga, Menjaga Kenangan.</p>
            <div className="mt-2 flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-8">
              <div className="flex flex-col gap-2">
                <Link
                  href={`${BASE}/pesan`}
                  className="inline-flex h-13 items-center justify-center gap-2 rounded-xl bg-highlight px-7 text-body-lg font-semibold text-highlight-foreground transition-colors hover:bg-highlight/90 focus-visible:ring-3 focus-visible:ring-sand/60 focus-visible:outline-none"
                >
                  Pesan makam sekarang <ArrowRight className="size-5" aria-hidden />
                </Link>
                <span className="text-small text-ivory/80 sm:text-center">untuk keluarga yang baru saja kehilangan</span>
              </div>
              <Link
                href={`${BASE}/lokasi?terencana=1`}
                className="inline-flex h-13 items-center gap-1.5 text-body-lg font-medium text-ivory underline decoration-sand/60 underline-offset-4 hover:decoration-sand"
              >
                Siapkan makam untuk nanti
              </Link>
            </div>
            <p className="max-w-md text-small text-ivory/75">Tidak ada yang dibayar saat mengirim pesanan, dan dokumen bisa menyusul.</p>
          </div>
          <div className="relative min-h-72 sm:min-h-96 lg:min-h-full">
            <Image
              src="/pratinjau/publik/hero-keluarga.jpg"
              alt="Tiga bersaudara berdiri berdampingan dengan tenang di taman yang berkabut"
              fill
              priority
              sizes="(min-width: 1024px) 40vw, 100vw"
              className="object-cover object-[50%_65%]"
            />
          </div>
        </div>
      </section>

      {/* Tiles */}
      <section className="px-4 py-14 md:px-8 md:py-20" aria-labelledby="tiles-title">
        <div className="mx-auto max-w-[80rem]">
          <h2 id="tiles-title" className="font-serif text-[1.75rem] leading-tight font-semibold text-forest md:text-4xl">
            Untuk makam keluarga
          </h2>
          <p className="mt-2 max-w-xl text-body-lg text-muted-foreground">Setelah pemakaman, kami tetap menemani: merawat, memperpanjang dan mengurus.</p>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {TILES.map((tile) => {
              const live = semuaRilis;
              return (
                <article key={tile.id} id={tile.id} className="group relative flex overflow-hidden rounded-3xl border border-border bg-card shadow-xs sm:flex-col">
                  <div className="relative w-28 shrink-0 overflow-hidden sm:aspect-[4/3] sm:w-auto">
                    <Image src={tile.img} alt={tile.alt} fill sizes="(min-width: 1024px) 300px, (min-width: 640px) 50vw, 100vw" className="object-cover" />
                    {!live ? (
                      <span className="absolute top-3 left-3 hidden rounded-full bg-card/95 px-3 py-1 text-caption font-semibold text-forest sm:inline">Segera hadir</span>
                    ) : null}
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5 p-4 sm:gap-2 sm:p-5">
                    {!live ? <span className="self-start rounded-full bg-muted px-2 py-0.5 text-caption font-semibold text-forest sm:hidden">Segera hadir</span> : null}
                    <h3 className="text-title-2 text-foreground">
                      {live ? (
                        <a href={`${BASE}#${tile.id}`} className="after:absolute after:inset-0">
                          {tile.title}
                        </a>
                      ) : (
                        tile.title
                      )}
                    </h3>
                    <p className="text-body text-muted-foreground">{tile.text}</p>
                    {live ? (
                      <span className="mt-auto inline-flex items-center gap-1 pt-2 text-body font-semibold text-forest">
                        Mulai <ArrowRight className="size-4" aria-hidden />
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => segera(tile.title)}
                        className="mt-auto inline-flex items-center gap-1.5 self-start pt-2 text-body font-medium text-sage-strong hover:text-forest"
                      >
                        <MessageCircle className="size-4" aria-hidden /> Butuh sekarang? Tanya CS
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-y border-border bg-card px-4 py-14 md:px-8" aria-labelledby="trust-title">
        <div className="mx-auto max-w-[80rem]">
          <h2 id="trust-title" className="font-serif text-[1.75rem] leading-tight font-semibold text-forest md:text-4xl">
            Dibantu, jelas, aman
          </h2>
          <div className="mt-8 grid gap-8 md:grid-cols-3 md:gap-10">
            {trust.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex gap-4 md:flex-col">
                <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-forest">
                  <Icon className="size-6" aria-hidden />
                </span>
                <div>
                  <h3 className="text-title-2 text-foreground">{title}</h3>
                  <p className="mt-1 text-body-lg text-muted-foreground">{text}</p>
                </div>
              </div>
            ))}
          </div>
          <a href={`${BASE}#cara-kami-bekerja`} className="mt-8 inline-flex items-center gap-1 text-body font-semibold text-forest">
            Cara Kami Bekerja <ArrowRight className="size-4" aria-hidden />
          </a>
        </div>
      </section>

      {/* CS */}
      <section className="px-4 py-14 md:px-8">
        <div className="mx-auto flex max-w-[80rem] flex-col items-start justify-between gap-4 rounded-3xl bg-brand-soft p-6 sm:flex-row sm:items-center sm:p-8">
          <div>
            <h2 className="text-title-2 text-forest">Butuh bantuan memilih langkah?</h2>
            <p className="mt-1 text-body text-muted-foreground">
              Tim kami siap mendampingi lewat WhatsApp, dibalas {CS.hours}.
            </p>
          </div>
          <a
            href={CS.waLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-body font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <MessageCircle className="size-4" aria-hidden /> WhatsApp CS
          </a>
        </div>
      </section>
    </>
  );
}
