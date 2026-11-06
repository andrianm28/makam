"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircleIcon } from "lucide-react";
import { CsLink } from "@/components/site/cs-link";
import { pilGaris, pilUtama } from "@/components/site/gaya";
import type { CsContact } from "@/components/kode-masuk/state";
import { cn } from "@/lib/utils";

/**
 * The phone's bottom action bar on the public site (dri, 6 Nov 2026): WhatsApp CS and Pesan Sekarang, always in reach
 * below lg. A Lokasi page keeps its own order bar there instead, so this one stands aside on it.
 */
export function BarAksiPonsel({ contact }: { contact: CsContact | null }) {
  const pathname = usePathname() ?? "/";
  if (/^\/lokasi\/[^/]+$/.test(pathname)) return null;
  return (
    <>
      {/* Room under the footer, so the bar never covers its last line. */}
      <div className="h-20 lg:hidden" aria-hidden />
      <nav aria-label="Aksi cepat" className="fixed inset-x-0 bottom-0 z-30 flex gap-3 border-t border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur lg:hidden">
        {contact ? (
          <CsLink contact={contact} aria-label="Tanya CS lewat WhatsApp" className={cn(pilGaris, "h-12 flex-1 px-4 text-body-lg no-underline hover:no-underline")}>
            <MessageCircleIcon className="size-5" aria-hidden="true" /> WhatsApp CS
          </CsLink>
        ) : null}
        <Link href="/pesan-makam/saat-duka" className={cn(pilUtama, "h-12 flex-1 px-4 text-body-lg")}>
          Pesan Sekarang
        </Link>
      </nav>
    </>
  );
}
