"use client";

import { MenuIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { CsLink } from "@/components/site/cs-link";
import { SiteNav } from "@/components/site/site-nav";
import type { CsContact } from "@/components/kode-masuk/state";
import type { PublicMenuItem } from "@/lib/public-navigation";

/**
 * The menu on a phone: the same items the top bar shows from `md` up, plus a way
 * to the CS. It opens from the header's button, so the header and the footer
 * stay server components and this, with the nav it marks up, is the only client
 * part of the frame.
 */
export function MobileMenu({ items, contact }: { items: readonly PublicMenuItem[]; contact: CsContact | null }) {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button variant="outline" size="icon" aria-label="Buka menu" className="md:hidden">
            <MenuIcon className="size-5" aria-hidden="true" />
          </Button>
        }
      />
      <SheetContent side="right" className="w-4/5 max-w-sm gap-2 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <nav aria-label="Menu" className="flex flex-col">
          <SiteNav items={items} variant="drawer" />
        </nav>
        <div className="mt-auto border-t border-border pt-3">
          <CsLink contact={contact} label="Tanya CS lewat WhatsApp" className="text-body" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
