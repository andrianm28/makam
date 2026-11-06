import type { ReactNode } from "react";
import Link from "next/link";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** The small uppercase label with a rule before it, over a section's big heading. */
export function Eyebrow({ children, tengah = false, terang = false }: { children: ReactNode; tengah?: boolean; terang?: boolean }) {
  return (
    <p
      className={cn(
        "flex items-center gap-3 text-small font-bold tracking-widest uppercase",
        terang ? "text-sand" : "text-forest",
        tengah && "justify-center",
      )}
    >
      <span className={cn("h-px w-6", terang ? "bg-sand" : "bg-forest")} aria-hidden />
      {children}
    </p>
  );
}

/**
 * The band a public page opens with (dri, 6 Nov 2026: the reference site's layout, Makam's own brand): a light
 * Forest-tinted band with the eyebrow, the page's one big `h1`, its lead, an optional checklist and pill actions, and
 * an optional white card beside it (a CS or "need it now" card).
 */
export function PageHero({
  eyebrow,
  title,
  lead,
  poin,
  children,
  samping,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  poin?: readonly string[];
  children?: ReactNode;
  samping?: ReactNode;
}) {
  return (
    <section className="border-b border-border bg-brand-soft">
      <div
        className={cn(
          "mx-auto grid max-w-(--page-max-width) gap-10 px-(--page-gutter) py-12 md:py-20",
          samping && "lg:grid-cols-[1.3fr_1fr] lg:items-center",
        )}
      >
        <div className="flex flex-col gap-5">
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <h1 className="max-w-4xl font-heading text-4xl font-extrabold leading-tight tracking-tight text-foreground text-balance md:text-6xl">
            {title}
          </h1>
          {lead ? <p className="max-w-2xl text-lg text-muted-foreground md:text-xl">{lead}</p> : null}
          {poin && poin.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {poin.map((satu) => (
                <li key={satu} className="flex items-start gap-3 text-lg text-foreground">
                  <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-card text-forest">
                    <CheckIcon className="size-4" aria-hidden />
                  </span>
                  {satu}
                </li>
              ))}
            </ul>
          ) : null}
          {children ? <div className="mt-2 flex flex-wrap items-center gap-4">{children}</div> : null}
        </div>
        {samping ? <div>{samping}</div> : null}
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
