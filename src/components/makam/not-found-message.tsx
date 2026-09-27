import Link from "next/link";

/**
 * The message a 404 shows, for an area that renders its **own** frame: the staff
 * area, the booking wizard, the document pages. Those areas must not get the
 * public site's frame nested inside theirs, so each carries a `not-found.tsx`
 * that renders this and nothing else.
 *
 * The public site's own 404 is the root one, in `SiteFrame`.
 */
export function NotFoundMessage({ links }: { links: { href: string; label: string }[] }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-start gap-6 px-(--page-gutter) py-16">
      <h1 className="text-title-1 font-semibold tracking-tight">Halaman tidak ditemukan</h1>
      <p className="text-body-lg text-muted-foreground">
        Alamat yang Anda buka tidak ada. Mungkin ada salah ketik, atau halamannya sudah dipindahkan.
      </p>
      <nav aria-label="Halaman lain" className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="text-body-lg font-medium text-brand underline underline-offset-4">
            {link.label}
          </Link>
        ))}
      </nav>
    </main>
  );
}
