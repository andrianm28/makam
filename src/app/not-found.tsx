import type { Metadata } from "next";
import { SiteFrame } from "@/components/site/site-frame";
import { NotFoundMessage } from "@/components/makam/not-found-message";
import { publicMenu } from "@/lib/public-navigation";
import { yearInJakarta } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";

export const metadata: Metadata = {
  title: "Halaman tidak ditemukan — Makam.co.id",
  robots: { index: false, follow: true },
};

/**
 * A 404 is still a page of this site, so it carries the site's frame: the top
 * bar, the menu, the footer and the CS link, like every other page. It lives at
 * the root on purpose — that is the one that answers an address which matches no
 * route at all, which is where the Beranda's forward link to the Terencana wizard
 * lands until that wizard exists. The staff area, the wizard and the document
 * pages have their own `not-found.tsx`, so none of them gets this frame nested
 * inside its own.
 *
 * Rendered per request, like the layout that normally provides the frame: the
 * legal name and the CS number come from Pengaturan Operator, and a build must
 * never need a database.
 */
export const dynamic = "force-dynamic";

export default async function HalamanTidakDitemukan() {
  const { operatorSettings, adapters } = serverRuntime();
  const [settings, actor] = await Promise.all([operatorSettings.current(), currentActor()]);

  return (
    <SiteFrame
      items={publicMenu({ signedIn: actor !== null })}
      contact={settings ? { whatsApp: settings.csWhatsApp, replyHours: settings.csReplyHours } : null}
      legalName={settings?.legalName ?? null}
      year={yearInJakarta(adapters.clock.now())}
    >
      <NotFoundMessage
        links={[
          { href: "/", label: "Beranda" },
          { href: "/lokasi", label: "Daftar Lokasi" },
          { href: "/hubungi-kami", label: "Hubungi Kami" },
        ]}
      />
    </SiteFrame>
  );
}
