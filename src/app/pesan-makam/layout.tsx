import Link from "next/link";
import { BrandLogo } from "@/components/makam/brand-logo";
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
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" aria-label="Makam.co.id, beranda">
            <BrandLogo />
          </Link>
          {cs ? (
            <Link
              href={csWhatsAppLink(cs)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-body font-medium text-brand underline underline-offset-4"
            >
              Tanya CS
            </Link>
          ) : null}
        </div>
      </header>
      {children}
    </div>
  );
}
