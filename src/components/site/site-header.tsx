import Link from "next/link";
import { BrandLogo } from "@/components/makam/brand-logo";
import { MobileMenu } from "@/components/site/mobile-menu";
import { SiteNav } from "@/components/site/site-nav";
import { pilGaris, pilUtama } from "@/components/site/gaya";
import type { CsContact } from "@/components/kode-masuk/state";
import { isAccountItem, type PublicMenuItem } from "@/lib/public-navigation";
import { cn } from "@/lib/utils";

/**
 * The public site's top bar (dri, 6 Nov 2026: the reference site's layout, Makam's own brand): a white bar with the
 * logo home, the menu from lg up, the account entry (Masuk or Akun Saya) as an outlined pill and Pesan Sekarang as the
 * solid one. Below lg the drawer carries the whole menu, the account entry and the CS link, and the frame's bottom
 * bar keeps WhatsApp CS and Pesan Sekarang in reach.
 */
export function SiteHeader({ items, contact }: { items: readonly PublicMenuItem[]; contact: CsContact | null }) {
  const account = items.find(isAccountItem);
  const menu = items.filter((item) => !isAccountItem(item));
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card text-foreground shadow-xs">
      <div className="mx-auto flex h-(--site-header-height) max-w-(--page-max-width) items-center justify-between gap-6 px-4 md:px-8">
        <Link href="/" aria-label="Makam.co.id, ke Beranda" className="rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50">
          <BrandLogo />
        </Link>
        <nav aria-label="Menu utama" className="hidden lg:flex">
          <SiteNav items={menu} variant="bar" />
        </nav>
        <div className="flex items-center gap-3">
          {account?.href ? (
            <Link href={account.href} className={cn(pilGaris, "hidden h-12 px-6 lg:inline-flex")}>
              {account.label}
            </Link>
          ) : null}
          <Link href="/pesan-makam/saat-duka" className={cn(pilUtama, "hidden h-12 px-6 lg:inline-flex")}>
            Pesan Sekarang
          </Link>
          <MobileMenu items={menu} account={account ?? null} contact={contact} />
        </div>
      </div>
    </header>
  );
}
