import type { ReactNode } from "react";
import { BarAksiPonsel } from "@/components/site/bar-aksi-ponsel";
import { BarPengumuman } from "@/components/site/bar-pengumuman";
import { CsFloatingButton } from "@/components/site/cs-floating-button";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import type { CsContact } from "@/components/kode-masuk/state";
import type { publicMenu } from "@/lib/public-navigation";

/**
 * The public site's frame (public-site prototype; dri, 6 Nov 2026): the Forest help strip, the top bar, the page,
 * the footer, the floating Tanya CS button from lg up and the bottom action bar below it, so a person is one tap
 * away on every page. It takes its values from the caller, which reads them through the
 * domain's public queries, so this stays a plain component.
 */
export function SiteFrame({
  children,
  items,
  contact,
  legalName,
}: {
  children: ReactNode;
  items: ReturnType<typeof publicMenu>;
  contact: CsContact | null;
  legalName: string | null;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-background text-foreground">
      <BarPengumuman contact={contact} />
      <SiteHeader items={items} contact={contact} />
      {children}
      <SiteFooter legalName={legalName} contact={contact} items={items} />
      <CsFloatingButton contact={contact} />
      <BarAksiPonsel contact={contact} />
    </div>
  );
}
