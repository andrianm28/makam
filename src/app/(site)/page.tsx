import type { Metadata } from "next";
import { rilisAktif } from "@/lib/rilis";
import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon, MessageCircleIcon } from "lucide-react";
import { CsLink } from "@/components/site/cs-link";
import {
  homepageCsBand,
  homepageHero,
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
 * The Beranda (spec, Home), laid out as settled on the public-site prototype:
 * the Forest hero with the photograph, the tile row, the trust strip and the CS
 * band, restyled after the 6 Nov 2026 review as full-width Forest blocks with big
 * white type. Nothing here needs an Akun, and the only value it reads is the
 * CS contact, so a family can reach a person from the first screen.
 */
export default async function BerandaPage() {
  const settings = await serverRuntime().operatorSettings.current();
  const contact = settings ? { whatsApp: settings.csWhatsApp, replyHours: settings.csReplyHours } : null;

  return (
    <main className="flex w-full flex-1 flex-col">
      {/* Rapat Ira, 6 Nov 2026: one full-width Forest block with big white type, and the photograph beside it. */}
      <section className="bg-forest text-ivory">
        <div className="mx-auto grid max-w-(--page-max-width) lg:grid-cols-[1.15fr_0.85fr]">
          <div className="flex flex-col justify-center gap-6 px-(--page-gutter) py-12 md:py-20 lg:py-24 lg:pr-12">
            <h1 className="font-heading text-4xl font-extrabold leading-tight tracking-tight text-balance sm:text-5xl lg:text-6xl">
              {homepageHero.headline}
            </h1>
            <p className="text-xl text-sand md:text-2xl">{homepageHero.tagline}</p>
            <div className="mt-2 flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-8">
              <div className="flex flex-col gap-2">
                <Link
                  href={homepageHero.urgent.href}
                  className="inline-flex h-14 min-h-(--touch-target) items-center justify-center gap-2 rounded-xl bg-ivory px-8 text-lg font-bold text-forest transition-colors hover:bg-ivory/90 focus-visible:ring-3 focus-visible:ring-sand/60 focus-visible:outline-none"
                >
                  {homepageHero.urgent.label} <ArrowRightIcon className="size-5" aria-hidden="true" />
                </Link>
                <span className="text-small text-ivory/80 sm:text-center">{homepageHero.urgent.caption}</span>
              </div>
              <Link
                href={homepageHero.planned.href}
                prefetch={homepageHero.planned.prefetch}
                className="inline-flex h-14 min-h-(--touch-target) items-center justify-center gap-1.5 rounded-xl border-2 border-ivory/70 px-7 text-lg font-semibold text-ivory transition-colors hover:bg-ivory/10 focus-visible:ring-3 focus-visible:ring-sand/60 focus-visible:outline-none"
              >
                {homepageHero.planned.label}
              </Link>
            </div>
            <p className="max-w-md text-body-lg text-ivory/80">{homepageHero.reassurance}</p>
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

      <section className="px-(--page-gutter) py-14 md:py-20" aria-labelledby="tiles-title">
        <div className="mx-auto max-w-(--page-max-width)">
          <h2 id="tiles-title" className="font-heading text-3xl font-extrabold tracking-tight text-forest md:text-5xl">
            {homepageTilesIntro.heading}
          </h2>
          <p className="mt-3 max-w-2xl text-lg text-muted-foreground md:text-xl">{homepageTilesIntro.line}</p>
          <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {homepageTilesUntuk(rilisAktif()).map((tile) => {
              const live = tile.href !== undefined;
              return (
                <li key={tile.label} className="group relative flex flex-col overflow-hidden rounded-3xl bg-forest text-ivory shadow-sm">
                  <div className="relative aspect-[16/10] overflow-hidden sm:aspect-[4/3]">
                    <Image
                      src={tile.image}
                      alt={tile.imageAlt}
                      fill
                      sizes="(min-width: 1024px) 300px, (min-width: 640px) 50vw, 100vw"
                      className="object-cover transition-transform duration-(--duration-slow) group-hover:scale-105"
                    />
                    {!live ? (
                      <span className="absolute top-3 left-3 rounded-full bg-ivory px-3 py-1 text-caption font-bold text-forest">Segera hadir</span>
                    ) : null}
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-6">
                    <h3 className="font-heading text-2xl font-extrabold leading-tight tracking-tight">
                      {tile.href ? (
                        <Link href={tile.href} className="after:absolute after:inset-0 focus-visible:outline-none">
                          {tile.label}
                        </Link>
                      ) : (
                        tile.label
                      )}
                    </h3>
                    <p className="text-body-lg text-ivory/80">{tile.summary}</p>
                    {live ? (
                      <span className="mt-auto inline-flex items-center gap-1.5 pt-3 text-body-lg font-bold text-sand">
                        Mulai <ArrowRightIcon className="size-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                      </span>
                    ) : (
                      <CsLink
                        contact={contact}
                        aria-label={`Tanya CS soal ${tile.label}`}
                        className="relative mt-auto inline-flex items-center gap-1.5 self-start pt-3 text-body-lg font-semibold text-sand hover:text-ivory"
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

      <section className="px-(--page-gutter) pb-14 md:pb-20" aria-labelledby="info-makam-swasta-title">
        <div className="mx-auto flex max-w-(--page-max-width) flex-col gap-4 rounded-3xl border border-border bg-card p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="info-makam-swasta-title" className="font-heading text-2xl font-extrabold tracking-tight text-forest md:text-3xl">
              {homepageInfoMakamSwasta.heading}
            </h2>
            <span className="rounded-full bg-muted px-3 py-1 text-caption font-semibold text-muted-foreground">{homepageInfoMakamSwasta.badge}</span>
          </div>
          <p className="max-w-2xl text-body text-muted-foreground">{homepageInfoMakamSwasta.line}</p>
          <ul className="flex flex-wrap gap-2" aria-label="Pemakaman swasta yang belum bermitra">
            {DAFTAR_INFO_MAKAM_SWASTA.map((lokasi) => (
              <li key={lokasi.slug}>
                <Link
                  href={`/info-makam-swasta#${lokasi.slug}`}
                  className="inline-flex min-h-(--touch-target) items-center rounded-full border border-border px-3 text-small text-foreground hover:border-forest"
                >
                  {lokasi.nama}
                </Link>
              </li>
            ))}
          </ul>
          <Link href={homepageInfoMakamSwasta.link.href} className="inline-flex items-center gap-1 self-start text-body font-semibold text-forest">
            {homepageInfoMakamSwasta.link.label} <ArrowRightIcon className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className="bg-forest px-(--page-gutter) py-14 text-ivory md:py-20" aria-labelledby="trust-title">
        <div className="mx-auto max-w-(--page-max-width)">
          <h2 id="trust-title" className="font-heading text-3xl font-extrabold tracking-tight md:text-5xl">
            {homepageTrustHeading}
          </h2>
          <ul className="mt-10 grid gap-8 md:grid-cols-3 md:gap-10">
            {homepageTrust.map(({ icon: Icon, label, line }) => (
              <li key={label} className="flex gap-4 md:flex-col">
                <span className="inline-flex size-14 shrink-0 items-center justify-center rounded-2xl bg-ivory/10 text-sand">
                  <Icon className="size-7" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="font-heading text-2xl font-extrabold">{label}</h3>
                  <p className="mt-2 text-lg text-ivory/80">{line}</p>
                </div>
              </li>
            ))}
          </ul>
          <Link href={homepageTrustLink.href} className="mt-10 inline-flex items-center gap-1.5 text-lg font-bold text-sand hover:text-ivory">
            {homepageTrustLink.label} <ArrowRightIcon className="size-5" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {contact ? (
        <section className="px-(--page-gutter) py-14 md:py-20">
          <div className="mx-auto flex max-w-(--page-max-width) flex-col items-start justify-between gap-6 rounded-3xl bg-brand-soft p-8 sm:flex-row sm:items-center md:p-12">
            <div>
              <h2 className="font-heading text-3xl font-extrabold tracking-tight text-forest md:text-4xl">{homepageCsBand.heading}</h2>
              <p className="mt-2 text-lg text-muted-foreground">
                {homepageCsBand.line}, {contact.replyHours}.
              </p>
            </div>
            <CsLink
              contact={contact}
              className="inline-flex h-14 shrink-0 items-center gap-2 rounded-xl bg-primary px-7 text-lg font-bold text-primary-foreground hover:bg-primary/90"
            >
              <MessageCircleIcon className="size-5" aria-hidden="true" /> WhatsApp CS
            </CsLink>
          </div>
        </section>
      ) : null}
    </main>
  );
}
