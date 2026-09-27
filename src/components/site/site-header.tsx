import Link from "next/link";
import { BrandLogo } from "@/components/makam/brand-logo";
import { CsLink } from "@/components/site/cs-link";
import { MobileMenu } from "@/components/site/mobile-menu";
import { SiteNav } from "@/components/site/site-nav";
import type { CsContact } from "@/components/kode-masuk/state";
import type { PublicMenuItem } from "@/lib/public-navigation";

/**
 * The public site's top bar: the logo home, the menu from `md` up (the drawer
 * takes it on a phone), and a way to the CS on every page (ADR 0004: a `wa.me`
 * link, no API).
 */
export function SiteHeader({ items, contact }: { items: readonly PublicMenuItem[]; contact: CsContact | null }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card">
      <div className="mx-auto flex h-(--header-height) w-full max-w-(--page-max-width) items-center gap-3 px-(--page-gutter)">
        <Link href="/" aria-label="Makam.co.id, beranda" className="rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50">
          <BrandLogo />
        </Link>
        <nav aria-label="Menu utama" className="hidden min-w-0 flex-1 justify-center md:flex">
          <SiteNav items={items} variant="bar" />
        </nav>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <CsLink contact={contact} className="text-body" hideLabelOnPhone />
          <MobileMenu items={items} contact={contact} />
        </div>
      </div>
    </header>
  );
}
