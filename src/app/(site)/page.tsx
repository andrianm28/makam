import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { CsLink } from "@/components/site/cs-link";
import { homepageHero, homepageTiles, homepageTrust } from "@/lib/homepage-content";
import { serverRuntime } from "@/server/runtime";

export const metadata: Metadata = {
  title: "Makam.co.id — Urus Pemakaman dengan Tenang, dalam Satu Platform",
  description:
    "Pesan makam saat keluarga berduka, atau siapkan untuk nanti. Lokasi Mitra yang sudah Terverifikasi dan harga yang sama dengan Tagihan.",
};

/**
 * The Beranda (spec, Home): the Forest hero with the urgent entry as its one
 * button, the tile row and the trust strip. Nothing here needs an Akun, and the
 * only value it reads is the CS contact, so a family can reach a person from
 * the first screen.
 */
export default async function BerandaPage() {
  const settings = await serverRuntime().operatorSettings.current();
  const contact = settings ? { whatsApp: settings.csWhatsApp, replyHours: settings.csReplyHours } : null;

  return (
    <main className="flex w-full flex-1 flex-col">
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto grid w-full max-w-(--page-max-width) gap-8 px-(--page-gutter) py-12 md:grid-cols-2 md:items-center md:py-16">
          <div className="flex flex-col items-start gap-5">
            <h1 className="font-serif text-3xl leading-tight font-semibold tracking-tight text-balance md:text-4xl">
              {homepageHero.headline}
            </h1>
            <p className="text-body-lg text-primary-foreground/85">{homepageHero.tagline}</p>
            <div className="flex w-full flex-col items-start gap-2">
              {/* The public CTA on Forest is the Sand button (docs/design-system.md,
                  Tokens), with a highlight-coloured focus ring: the Forest ring
                  would vanish into the hero. */}
              <Link
                href={homepageHero.urgent.href}
                className="inline-flex min-h-(--touch-target) items-center justify-center rounded-lg bg-highlight px-6 py-3 text-body-lg font-semibold text-highlight-foreground outline-none transition-colors hover:bg-highlight/90 focus-visible:ring-3 focus-visible:ring-highlight/70"
              >
                {homepageHero.urgent.label}
              </Link>
              <p className="text-small text-primary-foreground/75">{homepageHero.urgent.caption}</p>
            </div>
            <Link
              href={homepageHero.planned.href}
              prefetch={homepageHero.planned.prefetch}
              className="min-h-(--touch-target) rounded-md text-body-lg font-medium underline underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-highlight/70"
            >
              {homepageHero.planned.label}
            </Link>
          </div>
          <Image
            src="/content/beranda-keluarga.jpg"
            alt={homepageHero.photoAlt}
            width={1400}
            height={933}
            priority
            sizes="(min-width: 768px) 50vw, 100vw"
            className="h-56 w-full rounded-xl object-cover md:h-80 lg:h-96"
          />
        </div>
      </section>

      <section aria-labelledby="layanan-heading" className="mx-auto w-full max-w-(--page-max-width) px-(--page-gutter) py-(--section-gap)">
        <h2 id="layanan-heading" className="font-serif text-title-2 font-semibold">
          Layanan di makam.co.id
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {homepageTiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <li key={tile.label}>
                <Card className="h-full">
                  <CardContent className="flex flex-col items-start gap-2 pt-6">
                    <Icon className="size-6 text-brand" aria-hidden="true" />
                    {/* A tile that leads somewhere is a link; one that does not yet is a
                        heading that says so, never a dead link (docs/design-system.md). */}
                    <h3 className="text-title-3 font-semibold">
                      {tile.href ? (
                        <Link href={tile.href} className="hover:underline">
                          {tile.label}
                        </Link>
                      ) : (
                        tile.label
                      )}
                    </h3>
                    <p className="text-body text-muted-foreground">{tile.summary}</p>
                    <p className="text-small text-muted-foreground">{tile.description}</p>
                    <CsLink contact={contact} className="mt-1 text-body" label={`Tanya CS soal ${tile.label}`} />
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="trust-heading" className="border-t border-border bg-card">
        <div className="mx-auto w-full max-w-(--page-max-width) px-(--page-gutter) py-(--section-gap)">
          <h2 id="trust-heading" className="sr-only">
            Alasan memilih makam.co.id
          </h2>
          <ul className="grid gap-6 sm:grid-cols-3">
            {homepageTrust.map((column) => (
              <li key={column.label}>
                <Link
                  href={column.href}
                  className="flex h-full flex-col items-start gap-2 rounded-lg p-2 outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="text-title-3 font-semibold text-brand">{column.label}</span>
                  <span className="text-body text-muted-foreground">{column.line}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
