import Link from "next/link";
import { BrandLogo } from "@/components/makam/brand-logo";
import { MobileMenu } from "@/components/site/mobile-menu";
import { SiteNav } from "@/components/site/site-nav";
import type { CsContact } from "@/components/kode-masuk/state";
import { isAccountItem, type PublicMenuItem } from "@/lib/public-navigation";

/**
 * The public site's top bar, as settled on the public-site prototype: the logo
 * home, the menu from lg up, and the account entry (Masuk or Akun Saya) as an
 * outlined button on the right. Below lg the drawer carries the whole menu, the
 * account entry and the CS link; on every width the floating Tanya CS button of
 * the frame keeps a person one tap away.
 */
export function SiteHeader({ items, contact }: { items: readonly PublicMenuItem[]; contact: CsContact | null }) {
  const account = items.find(isAccountItem);
  const menu = items.filter((item) => !isAccountItem(item));
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/85">
      <div className="mx-auto flex h-16 max-w-[80rem] items-center justify-between gap-6 px-4 md:px-8">
        <Link href="/" aria-label="Makam.co.id, ke Beranda" className="rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50">
          <BrandLogo />
        </Link>
        <nav aria-label="Menu utama" className="hidden lg:flex">
          <SiteNav items={menu} variant="bar" />
        </nav>
        <div className="flex items-center gap-2">
          {account?.href ? (
            <Link
              href={account.href}
              className="hidden min-h-(--touch-target) items-center rounded-lg border border-border-strong px-4 text-body font-semibold text-forest transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 lg:inline-flex"
            >
              {account.label}
            </Link>
          ) : null}
          <MobileMenu items={menu} account={account ?? null} contact={contact} />
        </div>
      </div>
    </header>
  );
}
