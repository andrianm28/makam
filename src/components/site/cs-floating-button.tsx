"use client";

import { usePathname } from "next/navigation";
import { MessageCircleIcon } from "lucide-react";
import { CsLink } from "@/components/site/cs-link";
import type { CsContact } from "@/components/kode-masuk/state";
import { cn } from "@/lib/utils";

/**
 * The floating Tanya CS button on every public page (public-site prototype). On
 * a Lokasi page it sits higher on phones, above that page's sticky order bar.
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
        raised ? "bottom-24 lg:bottom-8" : "bottom-4 md:bottom-8",
      )}
    >
      <MessageCircleIcon className="size-5" aria-hidden="true" />
      <span className="hidden sm:inline">Tanya CS</span>
    </CsLink>
  );
}
