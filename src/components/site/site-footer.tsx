import Link from "next/link";
import { contentPageLinks } from "@/lib/public-navigation";

/**
 * The public site's footer: who runs makam.co.id, the content pages, and the
 * year. The legal name comes from Pengaturan Operator (the Operator's own value,
 * read through its public query), so this page can never disagree with the
 * documents or Hubungi Kami; before an Admin Platform has entered one, the
 * footer says nothing about who runs it rather than guessing (AGENTS.md: read
 * the domain's values through a public query, never hardcode them).
 */
export function SiteFooter({ legalName, year }: { legalName: string | null; year: number }) {
  return (
    <footer className="mt-auto border-t border-border bg-card">
      <div className="mx-auto flex w-full max-w-(--page-max-width) flex-col gap-6 px-(--page-gutter) py-10 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <p className="text-body font-semibold">Makam.co.id</p>
          <p className="max-w-sm text-small text-muted-foreground">
            {legalName ? `Makam.co.id dikelola oleh ${legalName}.` : "Makam.co.id"}
          </p>
          <p className="text-small text-muted-foreground">
            © {year} Makam.co.id. Semua hak dilindungi.
          </p>
        </div>
        <nav aria-label="Halaman isi" className="flex flex-col gap-2">
          <p className="text-body font-semibold">Halaman</p>
          <ul className="flex flex-col gap-1.5">
            {contentPageLinks.map((page) => (
              <li key={page.href}>
                <Link
                  href={page.href}
                  className="rounded-sm text-small text-brand underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {page.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
