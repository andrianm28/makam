import type { ReactNode } from "react";
import Link from "next/link";

/**
 * The frame every written content page shares: one `h1` in Lora, the page's own
 * copy, and a way to a person. Kept here so Tentang Kami, Cara Kami Bekerja,
 * FAQ and Hubungi Kami read as one site (spec, Content pages).
 */
export function ContentPage({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-(--page-gutter) py-10 md:py-14">
      <header className="flex flex-col gap-3">
        <h1 className="font-serif text-title-1 font-semibold tracking-tight text-balance">{title}</h1>
        {lead ? <p className="text-body-lg text-muted-foreground">{lead}</p> : null}
      </header>
      {children}
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
        <p key={paragraph} className="text-body-lg leading-relaxed">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

/**
 * The way out of a content page: the person, the answers, and the Lokasi. The
 * page's own link is left out, so a reader is never offered where they already
 * are — the labels here are the content pages' own titles.
 */
export function ContentPageFooter({ current }: { current: string }) {
  const links = [
    { href: "/hubungi-kami", label: "Hubungi Kami" },
    { href: "/faq", label: "FAQ" },
    { href: "/lokasi", label: "Daftar Lokasi" },
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
