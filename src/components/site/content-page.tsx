import type { ReactNode } from "react";
import Link from "next/link";

/**
 * The full-width Forest band a public page opens with (rapat Ira, 6 Nov 2026: big type in bold blocks, green with
 * white text, in our own words): the page's one `h1`, its lead, and an optional action row under it.
 */
export function PageHero({ eyebrow, title, lead, children }: { eyebrow?: string; title: string; lead?: string; children?: ReactNode }) {
  return (
    <section className="bg-forest text-ivory">
      <div className="mx-auto flex max-w-(--page-max-width) flex-col gap-4 px-(--page-gutter) py-12 md:px-8 md:py-20">
        {eyebrow ? <p className="text-small font-semibold tracking-wide text-sand uppercase">{eyebrow}</p> : null}
        <h1 className="max-w-4xl font-heading text-4xl font-extrabold leading-tight tracking-tight text-balance md:text-6xl">{title}</h1>
        {lead ? <p className="max-w-2xl text-lg text-ivory/85 md:text-xl">{lead}</p> : null}
        {children ? <div className="mt-2 flex flex-wrap items-center gap-4">{children}</div> : null}
      </div>
    </section>
  );
}

/**
 * The frame every written content page shares: the Forest title band, the page's own copy, and a way to a person.
 * Kept here so Tentang Kami, Cara Kami Bekerja, FAQ and Hubungi Kami read as one site (spec, Content pages).
 */
export function ContentPage({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <main className="flex w-full flex-1 flex-col">
      <PageHero title={title} lead={lead} />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-(--page-gutter) py-10 md:py-14">{children}</div>
    </main>
  );
}

/** A block of body copy on a content page. */
export function ContentParagraphs({ paragraphs }: { paragraphs: readonly string[] }) {
  return (
    <div className="flex flex-col gap-4">
      {/* The paragraph itself is the key: it is the whole, unchanging text, so
          there is nothing to truncate and no two of them are alike. */}
      {paragraphs.map((paragraph) => (
        <p key={paragraph} className="text-lg leading-relaxed">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

/**
 * The way out of a content page: the person, the answers, and Pesan Sekarang (where the Lokasi Mitra are browsed now). The
 * page's own link is left out, so a reader is never offered where they already
 * are — the labels here are the content pages' own titles.
 */
export function ContentPageFooter({ current }: { current: string }) {
  const links = [
    { href: "/hubungi-kami", label: "Hubungi Kami" },
    { href: "/faq", label: "FAQ" },
    { href: "/pesan-makam/saat-duka", label: "Pesan Sekarang" },
  ].filter((link) => link.label !== current);

  return (
    <nav aria-label="Lanjut membaca" className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-6">
      {links.map((link) => (
        <Link key={link.href} href={link.href} className="text-body font-medium text-brand underline underline-offset-4">
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
