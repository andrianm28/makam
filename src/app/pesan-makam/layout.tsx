import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { BrandMark } from "@/components/makam/brand-logo";
import { csWhatsAppLink } from "@/components/kode-masuk/state";
import { serverRuntime } from "@/server/runtime";

// Every screen of the wizard is rendered per request: its prices, Tersedia
// counts and confirmation deadlines come from the database at that moment, and
// a build must never need one.
export const dynamic = "force-dynamic";

/**
 * The booking wizard's own frame: the logo home and a way to reach the CS. No
 * site menu and no footer here — a family in the middle of a burial needs a
 * way out to a person, not a shop (spec, Booking wizards; the public prototype).
 */
export default async function PesanMakamLayout({ children }: LayoutProps<"/pesan-makam">) {
  const settings = await serverRuntime().operatorSettings.current();
  const cs = settings ? { whatsApp: settings.csWhatsApp, replyHours: settings.csReplyHours } : null;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-4 px-4">
          <Link href="/" aria-label="Keluar dari pemesanan, ke Beranda" className="flex items-center gap-2.5">
            <BrandMark className="h-8" />
            <span className="text-small font-bold tracking-[0.04em] text-forest">MAKAM.CO.ID</span>
          </Link>
          {cs ? (
            <Link
              href={csWhatsAppLink(cs)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-small font-medium text-brand hover:bg-accent"
            >
              <MessageCircle className="size-4" aria-hidden />
              <span>Tanya CS</span>
            </Link>
          ) : null}
        </div>
      </header>
      {children}
    </div>
  );
}
