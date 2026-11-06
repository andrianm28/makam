import type { Metadata } from "next";
import { rilisAktif } from "@/lib/rilis";
import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon, CalendarHeartIcon, ClockIcon, MapPinIcon, MessageCircleIcon, PlusIcon } from "lucide-react";
import { CsLink } from "@/components/site/cs-link";
import { Eyebrow } from "@/components/site/content-page";
import { judulBagian, pilGaris, pilTerang, pilTerangGaris, pilUtama } from "@/components/site/gaya";
import { faqQuestions } from "@/lib/content-pages";
import { cn } from "@/lib/utils";
import {
  homepageCsBand,
  homepageDirektori,
  homepageFaq,
  homepageHero,
  homepagePintu,
  homepageInfoMakamSwasta,
  homepageTilesUntuk,
  homepageTilesIntro,
  homepageTrust,
  homepageTrustHeading,
  homepageTrustLink,
} from "@/lib/homepage-content";
import { serverRuntime } from "@/server/runtime";
import { DAFTAR_INFO_MAKAM_SWASTA } from "./info-makam-swasta/daftar";

export const metadata: Metadata = {
  title: "Makam.co.id — Urus Pemakaman dengan Tenang, dalam Satu Platform",
  description:
    "Pesan makam saat keluarga berduka, atau siapkan untuk nanti. Lokasi Mitra yang sudah Terverifikasi dan harga yang sama dengan Tagihan.",
};

/**
 * The Beranda (spec, Home), in the reference site's UI/UX with Makam's own brand (dri, 6 Nov 2026): the full-bleed
 * photo hero with a centred headline and one accent phrase, the two doors (now / plan), the services, the Lokasi Mitra
 * directory by city, how we work, the first FAQ answers and the CS. Nothing here needs an Akun; it reads the CS
 * contact, the Lokasi Mitra cities and the FAQ.
 */
export default async function BerandaPage() {
  const { operatorSettings, lokasi } = serverRuntime();
  const [settings, mitra] = await Promise.all([operatorSettings.current(), lokasi.publicLokasiMitraList()]);
  const contact = settings ? { whatsApp: settings.csWhatsApp, replyHours: settings.csReplyHours } : null;
  const kota = kotaMitra(mitra.map((satu) => satu.city));
  const faq = faqQuestions(settings?.legalName ?? null, rilisAktif()).slice(0, homepageFaq.jumlah);
  const [sebelumAksen, setelahAksen] = homepageHero.headline.split(homepageHero.aksen);

  return (
    <main className="flex w-full flex-1 flex-col">
      <section className="relative isolate overflow-hidden bg-forest text-ivory">
        <Image
          src={homepageHero.photo}
          alt={homepageHero.photoAlt}
          fill
          priority
          sizes="100vw"
          className="-z-10 object-cover object-[50%_60%]"
        />
        <div className="absolute inset-0 -z-10 bg-forest/75" aria-hidden />
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-(--page-gutter) pt-20 pb-36 text-center md:pt-28 md:pb-44">
          <h1 className="font-heading text-4xl font-extrabold leading-tight tracking-tight text-balance sm:text-6xl lg:text-7xl">
            {setelahAksen === undefined ? (
              homepageHero.headline
            ) : (
              <>
                {sebelumAksen}
                <span className="text-sand">{homepageHero.aksen}</span>
                {setelahAksen}
              </>
            )}
          </h1>
          <p className="max-w-2xl text-xl text-ivory/90 md:text-2xl">{homepageHero.tagline}</p>
          <div className="mt-2 flex w-full flex-col items-center justify-center gap-4 sm:w-auto sm:flex-row">
            <div className="flex w-full flex-col gap-2 sm:w-auto">
              <Link href={homepageHero.urgent.href} className={cn(pilTerang, "w-full sm:w-auto")}>
                {homepageHero.urgent.label} <ArrowRightIcon className="size-5" aria-hidden="true" />
              </Link>
              <span className="text-small text-ivory/80">{homepageHero.urgent.caption}</span>
            </div>
            {contact ? (
              <div className="flex w-full flex-col gap-2 sm:w-auto">
                <CsLink contact={contact} className={cn(pilTerangGaris, "w-full sm:w-auto")}>
                  <MessageCircleIcon className="size-5" aria-hidden="true" /> Tanya CS lewat WhatsApp
                </CsLink>
                <span className="text-small text-ivory/80">{contact.replyHours}</span>
              </div>
            ) : null}
          </div>
          <p className="max-w-md text-body-lg text-ivory/80">{homepageHero.reassurance}</p>
        </div>
      </section>

      <section className="relative z-10 -mt-24 px-(--page-gutter)" aria-label="Mulai dari sini">
        <ul className="mx-auto grid max-w-(--page-max-width) gap-5 md:grid-cols-2">
          {homepagePintu.map((pintu) => {
            const Ikon = pintu.kunci === "sekarang" ? ClockIcon : CalendarHeartIcon;
            return (
              <li key={pintu.kunci}>
                <Link
                  href={pintu.kunci === "nanti" ? homepageHero.planned.href : pintu.href}
                  prefetch={pintu.kunci === "nanti" ? homepageHero.planned.prefetch : undefined}
                  className={cn(
                    "group flex h-full flex-col gap-3 rounded-3xl border-2 bg-card p-7 shadow-lg transition-colors md:p-9",
                    pintu.kunci === "sekarang" ? "border-forest" : "border-border hover:border-forest",
                  )}
                >
                  <span className="inline-flex size-14 items-center justify-center rounded-full bg-forest text-ivory">
                    <Ikon className="size-7" aria-hidden="true" />
                  </span>
                  <span className="font-heading text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">{pintu.judul}</span>
                  <span className="text-lg text-muted-foreground">{pintu.ringkas}</span>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-lg font-bold text-forest">
                    {pintu.kunci === "nanti" ? homepageHero.planned.label : pintu.tautan}
                    <ArrowRightIcon className="size-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="px-(--page-gutter) py-16 md:py-24" aria-labelledby="tiles-title">
        <div className="mx-auto max-w-(--page-max-width)">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
            <Eyebrow tengah>{homepageTilesIntro.eyebrow}</Eyebrow>
            <h2 id="tiles-title" className={judulBagian}>
              {homepageTilesIntro.heading}
            </h2>
            <p className="text-lg text-muted-foreground md:text-xl">{homepageTilesIntro.line}</p>
          </div>
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {homepageTilesUntuk(rilisAktif()).map((tile) => {
              const live = tile.href !== undefined;
              return (
                <li key={tile.label} className="group relative flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-md">
                  <div className="relative aspect-[16/10] overflow-hidden">
                    <Image
                      src={tile.image}
                      alt={tile.imageAlt}
                      fill
                      sizes="(min-width: 1024px) 300px, (min-width: 640px) 50vw, 100vw"
                      className="object-cover transition-transform duration-(--duration-slow) group-hover:scale-105"
                    />
                    {!live ? (
                      <span className="absolute top-3 left-3 rounded-full bg-card px-3 py-1 text-caption font-bold text-forest">Segera hadir</span>
                    ) : null}
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-6">
                    <h3 className="font-heading text-2xl font-extrabold leading-tight tracking-tight text-foreground">
                      {tile.href ? (
                        <Link href={tile.href} className="after:absolute after:inset-0 focus-visible:outline-none">
                          {tile.label}
                        </Link>
                      ) : (
                        tile.label
                      )}
                    </h3>
                    <p className="text-body-lg text-muted-foreground">{tile.summary}</p>
                    {live ? (
                      <span className="mt-auto inline-flex items-center gap-1.5 pt-3 text-body-lg font-bold text-forest">
                        Mulai <ArrowRightIcon className="size-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                      </span>
                    ) : (
                      <CsLink
                        contact={contact}
                        aria-label={`Tanya CS soal ${tile.label}`}
                        className="relative mt-auto inline-flex items-center gap-1.5 self-start pt-3 text-body-lg font-semibold text-forest hover:underline"
                      >
                        <MessageCircleIcon className="size-5" aria-hidden="true" /> Tanya CS
                      </CsLink>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="bg-brand-soft px-(--page-gutter) py-16 md:py-24" aria-labelledby="direktori-title">
        <div className="mx-auto grid max-w-(--page-max-width) gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div className="flex flex-col gap-4">
            <Eyebrow>{homepageDirektori.eyebrow}</Eyebrow>
            <h2 id="direktori-title" className={judulBagian}>
              {homepageDirektori.heading}
            </h2>
            <p className="text-lg text-muted-foreground">{homepageDirektori.line}</p>
            <Link href="/pesan-makam/saat-duka" className={cn(pilGaris, "mt-2 self-start")}>
              Lihat semua lokasi mitra
            </Link>
          </div>
          <div className="flex flex-col gap-6 rounded-3xl border border-border bg-card p-6 shadow-md md:p-8">
            <div className="flex flex-col gap-3">
              <p className="text-body font-bold text-foreground">Kota Lokasi Mitra</p>
              {kota.length === 0 ? (
                <p className="text-body-lg text-muted-foreground">Lokasi Mitra pertama segera tampil di sini.</p>
              ) : (
                <ul className="flex flex-wrap gap-2" aria-label="Kota Lokasi Mitra">
                  {kota.map((satu) => (
                    <li key={satu.nama}>
                      <Link
                        href={`/pesan-makam/saat-duka#${encodeURIComponent(`kota-${satu.nama}`)}`}
                        className="inline-flex min-h-(--touch-target) items-center gap-2 rounded-full border border-border bg-card px-4 text-body font-semibold text-foreground hover:border-forest"
                      >
                        <MapPinIcon className="size-4 text-forest" aria-hidden="true" />
                        {satu.nama} <span className="font-normal text-muted-foreground">({satu.jumlah})</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-col gap-3 border-t border-border pt-6" aria-labelledby="info-makam-swasta-title">
              <div className="flex flex-wrap items-center gap-3">
                <h3 id="info-makam-swasta-title" className="text-title-2 text-foreground">
                  {homepageInfoMakamSwasta.heading}
                </h3>
                <span className="rounded-full bg-muted px-3 py-1 text-caption font-semibold text-muted-foreground">{homepageInfoMakamSwasta.badge}</span>
              </div>
              <p className="text-body text-muted-foreground">{homepageInfoMakamSwasta.line}</p>
              <ul className="flex flex-wrap gap-2" aria-label="Pemakaman swasta yang belum bermitra">
                {DAFTAR_INFO_MAKAM_SWASTA.map((satu) => (
                  <li key={satu.slug}>
                    <Link
                      href={`/info-makam-swasta#${satu.slug}`}
                      className="inline-flex min-h-(--touch-target) items-center rounded-full border border-border px-3 text-small text-foreground hover:border-forest"
                    >
                      {satu.nama}
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href={homepageInfoMakamSwasta.link.href} className="inline-flex items-center gap-1 self-start text-body font-bold text-forest">
                {homepageInfoMakamSwasta.link.label} <ArrowRightIcon className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="px-(--page-gutter) py-16 md:py-24" aria-labelledby="trust-title">
        <div className="mx-auto max-w-(--page-max-width)">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
            <Eyebrow tengah>Cara kami bekerja</Eyebrow>
            <h2 id="trust-title" className={judulBagian}>
              {homepageTrustHeading}
            </h2>
          </div>
          <ul className="mt-12 grid gap-6 md:grid-cols-3">
            {homepageTrust.map(({ icon: Icon, label, line }) => (
              <li key={label} className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-7 shadow-sm">
                <span className="inline-flex size-14 items-center justify-center rounded-full bg-brand-soft text-forest">
                  <Icon className="size-7" aria-hidden="true" />
                </span>
                <h3 className="font-heading text-2xl font-extrabold text-foreground">{label}</h3>
                <p className="text-lg text-muted-foreground">{line}</p>
              </li>
            ))}
          </ul>
          <div className="mt-10 flex justify-center">
            <Link href={homepageTrustLink.href} className={pilGaris}>
              {homepageTrustLink.label}
            </Link>
          </div>
        </div>
      </section>

      {faq.length > 0 ? (
        <section className="border-t border-border bg-subtle px-(--page-gutter) py-16 md:py-24" aria-labelledby="faq-title">
          <div className="mx-auto grid max-w-(--page-max-width) gap-10 lg:grid-cols-[1fr_1.5fr]">
            <div className="flex flex-col gap-4">
              <Eyebrow>{homepageFaq.eyebrow}</Eyebrow>
              <h2 id="faq-title" className={judulBagian}>
                {homepageFaq.heading}
              </h2>
              <p className="text-lg text-muted-foreground">{homepageFaq.line}</p>
              <div className="mt-2 flex flex-wrap gap-3">
                {contact ? (
                  <CsLink contact={contact} className={pilUtama}>
                    <MessageCircleIcon className="size-5" aria-hidden="true" /> WhatsApp CS
                  </CsLink>
                ) : null}
                <Link href="/faq" className={pilGaris}>
                  Semua pertanyaan
                </Link>
              </div>
            </div>
            <ol className="flex flex-col gap-3">
              {faq.map((entry, index) => (
                <li key={entry.question}>
                  <details className="group rounded-2xl border border-border bg-card shadow-xs open:shadow-sm">
                    <summary className="flex cursor-pointer list-none items-center gap-4 p-5 [&::-webkit-details-marker]:hidden">
                      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-body font-bold text-forest tabular-nums">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="flex-1 text-lg font-bold text-foreground">{entry.question}</span>
                      <PlusIcon className="size-5 shrink-0 text-forest transition-transform group-open:rotate-45" aria-hidden="true" />
                    </summary>
                    <p className="px-5 pb-5 pl-19 text-body-lg text-muted-foreground">{entry.answer}</p>
                  </details>
                </li>
              ))}
            </ol>
          </div>
        </section>
      ) : null}

      {contact ? (
        <section className="bg-forest px-(--page-gutter) py-16 text-ivory md:py-20">
          <div className="mx-auto flex max-w-(--page-max-width) flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-heading text-3xl font-extrabold tracking-tight md:text-4xl">{homepageCsBand.heading}</h2>
              <p className="mt-2 text-lg text-ivory/85">
                {homepageCsBand.line}, {contact.replyHours}.
              </p>
            </div>
            <CsLink contact={contact} className={cn(pilTerang, "shrink-0")}>
              <MessageCircleIcon className="size-5" aria-hidden="true" /> WhatsApp CS
            </CsLink>
          </div>
        </section>
      ) : null}
    </main>
  );
}

/** The partners' cities with how many Lokasi Mitra each has, most first. */
function kotaMitra(kota: string[]): { nama: string; jumlah: number }[] {
  const hitung = new Map<string, number>();
  for (const satu of kota) hitung.set(satu, (hitung.get(satu) ?? 0) + 1);
  return [...hitung].map(([nama, jumlah]) => ({ nama, jumlah })).sort((a, b) => b.jumlah - a.jumlah || a.nama.localeCompare(b.nama, "id"));
}
