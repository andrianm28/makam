import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import type { CsContact } from "@/components/kode-masuk/state";
import type { publicMenu } from "@/lib/public-navigation";

/**
 * The public site's frame: the top bar, the page, and the footer. The CS link is
 * in the top bar and the drawer, so it is on every page. It takes its values
 * from the caller, which reads them through the domain's public queries, so this
 * stays a plain component and both can be checked on their own.
 */
export function SiteFrame({
  children,
  items,
  contact,
  legalName,
  year,
}: {
  children: ReactNode;
  items: ReturnType<typeof publicMenu>;
  contact: CsContact | null;
  legalName: string | null;
  year: number;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <SiteHeader items={items} contact={contact} />
      {children}
      <SiteFooter legalName={legalName} year={year} />
    </div>
  );
}
