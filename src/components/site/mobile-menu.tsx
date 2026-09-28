"use client";

import Link from "next/link";
import { useState } from "react";
import { MenuIcon, MessageCircleIcon, XIcon } from "lucide-react";
import { BrandLogo } from "@/components/makam/brand-logo";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SiteNav } from "@/components/site/site-nav";
import { CsLink } from "@/components/site/cs-link";
import type { CsContact } from "@/components/kode-masuk/state";
import type { PublicMenuItem } from "@/lib/public-navigation";

/**
 * The drawer below lg (public-site prototype): the logo and a close button on
 * top, the menu, then the account entry as an outlined button and the CS link
 * at the bottom.
 */
export function MobileMenu({
  items,
  account,
  contact,
}: {
  items: readonly PublicMenuItem[];
  account: PublicMenuItem | null;
  contact: CsContact | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <button
            type="button"
            aria-label="Buka menu"
            className="inline-flex min-h-(--touch-target) min-w-(--touch-target) items-center justify-center rounded-lg text-forest hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 lg:hidden"
          />
        }
      >
        <MenuIcon className="size-6" aria-hidden="true" />
      </SheetTrigger>
      <SheetContent side="right" className="w-[86%] max-w-sm gap-0 bg-background p-0" showCloseButton={false}>
        <div className="flex h-16 items-center justify-between border-b border-border px-4">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <BrandLogo />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Tutup menu"
            className="inline-flex min-h-(--touch-target) min-w-(--touch-target) items-center justify-center rounded-lg text-forest hover:bg-accent"
          >
            <XIcon className="size-6" aria-hidden="true" />
          </button>
        </div>
        <nav aria-label="Menu" className="flex flex-col p-2" onClick={() => setOpen(false)}>
          <SiteNav items={items} variant="drawer" />
        </nav>
        <div className="mt-auto flex flex-col gap-3 border-t border-border p-4">
          {account?.href ? (
            <Link
              href={account.href}
              onClick={() => setOpen(false)}
              className="inline-flex h-12 items-center justify-center rounded-lg border border-border-strong text-body-lg font-semibold text-forest"
            >
              {account.label}
            </Link>
          ) : null}
          <CsLink contact={contact} className="inline-flex items-center justify-center gap-2 text-body text-muted-foreground">
            <MessageCircleIcon className="size-4" aria-hidden="true" /> Butuh bantuan? WhatsApp CS
          </CsLink>
        </div>
      </SheetContent>
    </Sheet>
  );
}
