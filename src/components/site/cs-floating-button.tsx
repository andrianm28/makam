"use client";

import { usePathname } from "next/navigation";
import { MessageCircleIcon } from "lucide-react";
import { CsLink } from "@/components/site/cs-link";
import type { CsContact } from "@/components/kode-masuk/state";
import { cn } from "@/lib/utils";

/**
 * The floating Tanya CS button on every public page (public-site prototype). On
 * a Lokasi page it sits higher on phones, above that page's sticky order bar;
 * elsewhere below lg the bottom action bar carries WhatsApp CS instead.
 * Nothing at all while Pengaturan Operator holds no number.
 */
export function CsFloatingButton({ contact }: { contact: CsContact | null }) {
  const pathname = usePathname() ?? "/";
  const raised = /^\/lokasi\/[^/]+$/.test(pathname);
  return (
    <CsLink
      contact={contact}
      aria-label="Tanya CS lewat WhatsApp"
      className={cn(
        "fixed right-4 z-30 inline-flex h-12 min-h-(--touch-target) items-center gap-2 rounded-full bg-primary px-4 text-body font-semibold text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 md:right-8",
        // Below lg the bottom action bar carries WhatsApp CS, except on a Lokasi page, whose own order bar it sits above.
        raised ? "bottom-24 lg:bottom-8" : "hidden lg:bottom-8 lg:inline-flex",
      )}
    >
      <MessageCircleIcon className="size-5" aria-hidden="true" />
      <span className="hidden sm:inline">Tanya CS</span>
    </CsLink>
  );
}
