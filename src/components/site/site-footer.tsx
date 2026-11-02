import Link from "next/link";
import { BrandLogo } from "@/components/makam/brand-logo";
import { CsLink } from "@/components/site/cs-link";
import type { CsContact } from "@/components/kode-masuk/state";
import { formatTelepon } from "@/lib/format-telepon";
import { contentPageLinks, isAccountItem, type PublicMenuItem } from "@/lib/public-navigation";

/**
 * The public site's footer, as settled on the public-site prototype: the logo
 * and the brand line, the content pages under "Tentang", the CS under "Bantuan",
 * and who runs makam.co.id on a line of its own. The legal name and the CS come
 * from Pengaturan Operator; while it holds neither, the footer claims neither.
 */
export function SiteFooter({ legalName, contact, items = [] }: { legalName: string | null; contact: CsContact | null; /** The site menu: its groups get a column each, the rest one more. */ items?: readonly PublicMenuItem[] }) {
  const menu = items.filter((item) => !isAccountItem(item));
  const grup = menu.filter((item) => item.children);
  const lainnya = menu.filter((item) => !item.children);
  return (
    <footer className="mt-auto bg-forest text-ivory">
      <div className="mx-auto grid max-w-(--page-max-width) gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(4,1fr)] md:px-8">
        <div className="flex flex-col gap-3">
          <BrandLogo onBrand />
          <p className="max-w-sm text-small text-ivory/80">
            Menemani keluarga, menjaga kenangan. Kami bekerja sama dengan Lokasi Mitra yang sudah terverifikasi.
          </p>
        </div>
        {grup.map((satu) => (
          <nav key={satu.label} aria-label={satu.label} className="flex flex-col gap-2 text-small">
            <span className="text-caption font-semibold tracking-wide text-ivory/70 uppercase">{satu.label}</span>
            {satu.children!.map((anak) =>
              anak.href ? (
                <Link key={anak.label} href={anak.href} className="text-ivory hover:underline">
                  {anak.label}
                </Link>
              ) : null,
            )}
            {lainnya.length > 0 && satu === grup.at(-1)
              ? lainnya.map((item) =>
                  item.href ? (
                    <Link key={item.label} href={item.href} className="mt-2 font-semibold text-ivory hover:underline">
                      {item.label}
                    </Link>
                  ) : (
                    <span key={item.label} className="mt-2 font-semibold text-ivory/70">
                      {item.label} · Segera hadir
                    </span>
                  ),
                )
              : null}
          </nav>
        ))}
        <nav aria-label="Halaman isi" className="flex flex-col gap-2 text-small">
          <span className="text-caption font-semibold tracking-wide text-ivory/70 uppercase">Tentang</span>
          {contentPageLinks.map((page) => (
            <Link key={page.href} href={page.href} className="text-ivory hover:underline">
              {page.label}
            </Link>
          ))}
        </nav>
        {contact ? (
          <div className="flex flex-col gap-2 text-small">
            <span className="text-caption font-semibold tracking-wide text-ivory/70 uppercase">Bantuan</span>
            <CsLink contact={contact} className="font-medium text-ivory underline">
              WhatsApp CS {formatTelepon(contact.whatsApp)}
            </CsLink>
            <span className="text-ivory/80">{contact.replyHours}</span>
          </div>
        ) : null}
      </div>
      <div className="border-t border-ivory/15">
        <p className="mx-auto max-w-(--page-max-width) px-4 py-4 text-caption text-ivory/80 md:px-8">
          {legalName ? `Makam.co.id dikelola oleh ${legalName}` : "Makam.co.id"}
        </p>
      </div>
    </footer>
  );
}
