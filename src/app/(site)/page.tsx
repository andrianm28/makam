import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon, MessageCircleIcon } from "lucide-react";
import { CsLink } from "@/components/site/cs-link";
import {
  homepageCsBand,
  homepageHero,
  homepageTiles,
  homepageTilesIntro,
  homepageTrust,
  homepageTrustHeading,
  homepageTrustLink,
} from "@/lib/homepage-content";
import { serverRuntime } from "@/server/runtime";

export const metadata: Metadata = {
  title: "Makam.co.id — Urus Pemakaman dengan Tenang, dalam Satu Platform",
  description:
    "Pesan makam saat keluarga berduka, atau siapkan untuk nanti. Lokasi Mitra yang sudah Terverifikasi dan harga yang sama dengan Tagihan.",
};

/**
 * The Beranda (spec, Home), laid out as settled on the public-site prototype:
 * the Forest hero card with the photograph, the tile row, the trust strip and
 * the CS band. Nothing here needs an Akun, and the only value it reads is the
 * CS contact, so a family can reach a person from the first screen.
 */
export default async function BerandaPage() {
  const settings = await serverRuntime().operatorSettings.current();
  const contact = settings ? { whatsApp: settings.csWhatsApp, replyHours: settings.csReplyHours } : null;

  return (
    <main className="flex w-full flex-1 flex-col">
      <section className="px-4 pt-4 md:px-8 md:pt-8">
        <div className="mx-auto grid max-w-[80rem] overflow-hidden rounded-3xl bg-forest lg:grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col justify-center gap-6 px-6 py-10 sm:px-10 md:py-14 lg:px-14 lg:py-20">
            <h1 className="font-serif text-[2.125rem] leading-[1.15] font-semibold text-ivory sm:text-5xl sm:leading-[1.1] lg:text-[3.5rem]">
              {homepageHero.headline}
            </h1>
            <p className="text-body-lg text-sand sm:text-title-2 sm:font-normal">{homepageHero.tagline}</p>
            <div className="mt-2 flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-8">
              <div className="flex flex-col gap-2">
                <Link
                  href={homepageHero.urgent.href}
                  className="inline-flex h-13 min-h-(--touch-target) items-center justify-center gap-2 rounded-xl bg-highlight px-7 text-body-lg font-semibold text-highlight-foreground transition-colors hover:bg-highlight/90 focus-visible:ring-3 focus-visible:ring-sand/60 focus-visible:outline-none"
                >
                  {homepageHero.urgent.label} <ArrowRightIcon className="size-5" aria-hidden="true" />
                </Link>
                <span className="text-small text-ivory/80 sm:text-center">{homepageHero.urgent.caption}</span>
              </div>
              <Link
                href={homepageHero.planned.href}
                prefetch={homepageHero.planned.prefetch}
                className="inline-flex h-13 min-h-(--touch-target) items-center gap-1.5 text-body-lg font-medium text-ivory underline decoration-sand/60 underline-offset-4 hover:decoration-sand focus-visible:ring-3 focus-visible:ring-sand/60 focus-visible:outline-none"
              >
                {homepageHero.planned.label}
              </Link>
            </div>
            <p className="max-w-md text-small text-ivory/75">{homepageHero.reassurance}</p>
          </div>
          <div className="relative min-h-72 sm:min-h-96 lg:min-h-full">
            <Image
              src={homepageHero.photo}
              alt={homepageHero.photoAlt}
              fill
              priority
              sizes="(min-width: 1024px) 40vw, 100vw"
              className="object-cover object-[50%_65%]"
            />
          </div>
        </div>
      </section>

      <section className="px-4 py-14 md:px-8 md:py-20" aria-labelledby="tiles-title">
        <div className="mx-auto max-w-[80rem]">
          <h2 id="tiles-title" className="font-serif text-[1.75rem] leading-tight font-semibold text-forest md:text-4xl">
            {homepageTilesIntro.heading}
          </h2>
          <p className="mt-2 max-w-xl text-body-lg text-muted-foreground">{homepageTilesIntro.line}</p>
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {homepageTiles.map((tile) => {
              const live = tile.href !== undefined;
              return (
                <li key={tile.label} className="group relative flex overflow-hidden rounded-3xl border border-border bg-card shadow-xs sm:flex-col">
                  <div className="relative w-28 shrink-0 overflow-hidden sm:aspect-[4/3] sm:w-auto">
                    <Image src={tile.image} alt={tile.imageAlt} fill sizes="(min-width: 1024px) 300px, (min-width: 640px) 50vw, 100vw" className="object-cover" />
                    {!live ? (
                      <span className="absolute top-3 left-3 hidden rounded-full bg-card/95 px-3 py-1 text-caption font-semibold text-forest sm:inline">Segera hadir</span>
                    ) : null}
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5 p-4 sm:gap-2 sm:p-5">
                    {!live ? <span className="self-start rounded-full bg-muted px-2 py-0.5 text-caption font-semibold text-forest sm:hidden">Segera hadir</span> : null}
                    <h3 className="text-title-2 text-foreground">
                      {tile.href ? (
                        <Link href={tile.href} className="after:absolute after:inset-0">
                          {tile.label}
                        </Link>
                      ) : (
                        tile.label
                      )}
                    </h3>
                    <p className="text-body text-muted-foreground">{tile.summary}</p>
                    {live ? (
                      <span className="mt-auto inline-flex items-center gap-1 pt-2 text-body font-semibold text-forest">
                        Mulai <ArrowRightIcon className="size-4" aria-hidden="true" />
                      </span>
                    ) : (
                      <CsLink
                        contact={contact}
                        aria-label={`Tanya CS soal ${tile.label}`}
                        className="mt-auto inline-flex items-center gap-1.5 self-start pt-2 text-body font-medium text-sage-strong hover:text-forest"
                      >
                        <MessageCircleIcon className="size-4" aria-hidden="true" /> Butuh sekarang? Tanya CS
                      </CsLink>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="border-y border-border bg-card px-4 py-14 md:px-8" aria-labelledby="trust-title">
        <div className="mx-auto max-w-[80rem]">
          <h2 id="trust-title" className="font-serif text-[1.75rem] leading-tight font-semibold text-forest md:text-4xl">
            {homepageTrustHeading}
          </h2>
          <ul className="mt-8 grid gap-8 md:grid-cols-3 md:gap-10">
            {homepageTrust.map(({ icon: Icon, label, line }) => (
              <li key={label} className="flex gap-4 md:flex-col">
                <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-forest">
                  <Icon className="size-6" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-title-2 text-foreground">{label}</h3>
                  <p className="mt-1 text-body-lg text-muted-foreground">{line}</p>
                </div>
              </li>
            ))}
          </ul>
          <Link href={homepageTrustLink.href} className="mt-8 inline-flex items-center gap-1 text-body font-semibold text-forest">
            {homepageTrustLink.label} <ArrowRightIcon className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {contact ? (
        <section className="px-4 py-14 md:px-8">
          <div className="mx-auto flex max-w-[80rem] flex-col items-start justify-between gap-4 rounded-3xl bg-brand-soft p-6 sm:flex-row sm:items-center sm:p-8">
            <div>
              <h2 className="text-title-2 text-forest">{homepageCsBand.heading}</h2>
              <p className="mt-1 text-body text-muted-foreground">
                {homepageCsBand.line}, {contact.replyHours}.
              </p>
            </div>
            <CsLink
              contact={contact}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-body font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <MessageCircleIcon className="size-4" aria-hidden="true" /> WhatsApp CS
            </CsLink>
          </div>
        </section>
      ) : null}
    </main>
  );
}
