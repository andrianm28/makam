import Link from "next/link";
import { BrandLogo } from "@/components/makam/brand-logo";
import { csWhatsAppLink, type CsContact } from "@/components/kode-masuk/state";
import { formatTelepon } from "@/lib/format-telepon";
import { contentPageLinks } from "@/lib/public-navigation";

/**
 * The public site's footer, as settled on the public-site prototype: the logo
 * and the brand line, the content pages under "Tentang", the CS under "Bantuan",
 * and who runs makam.co.id on a line of its own. The legal name and the CS come
 * from Pengaturan Operator; while it holds neither, the footer claims neither.
 */
export function SiteFooter({ legalName, contact }: { legalName: string | null; contact: CsContact | null }) {
  return (
    <footer className="mt-auto border-t border-border bg-muted/50">
      <div className="mx-auto grid max-w-[80rem] gap-8 px-4 py-10 md:grid-cols-[1.4fr_1fr_1fr] md:px-8">
        <div className="flex flex-col gap-3">
          <BrandLogo />
          <p className="max-w-sm text-small text-muted-foreground">
            Menemani keluarga, menjaga kenangan. Kami bekerja sama dengan Lokasi Mitra yang sudah terverifikasi.
          </p>
        </div>
        <nav aria-label="Halaman isi" className="flex flex-col gap-2 text-small">
          <span className="text-caption font-semibold tracking-wide text-muted-foreground uppercase">Tentang</span>
          {contentPageLinks.map((page) => (
            <Link key={page.href} href={page.href} className="text-foreground hover:text-forest">
              {page.label}
            </Link>
          ))}
        </nav>
        {contact ? (
          <div className="flex flex-col gap-2 text-small">
            <span className="text-caption font-semibold tracking-wide text-muted-foreground uppercase">Bantuan</span>
            <a href={csWhatsAppLink(contact)} target="_blank" rel="noopener noreferrer" className="font-medium text-forest">
              WhatsApp CS {formatTelepon(contact.whatsApp)}
            </a>
            <span className="text-muted-foreground">{contact.replyHours}</span>
          </div>
        ) : null}
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-[80rem] px-4 py-4 text-caption text-muted-foreground md:px-8">
          {legalName ? `Makam.co.id dikelola oleh ${legalName}` : "Makam.co.id"}
        </p>
      </div>
    </footer>
  );
}
