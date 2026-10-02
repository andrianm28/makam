import { SiteFrame } from "@/components/site/site-frame";
import { rilisAktif } from "@/lib/rilis";
import { publicMenu } from "@/lib/public-navigation";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";

/**
 * The public site's frame, on every page a visitor reads without signing in and
 * on Akun Saya (the CS link is on all of them). The booking wizard and the staff
 * area have their own frames, so they sit outside this group.
 *
 * Rendered per request: the legal name and the CS number come from Pengaturan
 * Operator and the menu from the session, and a build must never need a
 * database.
 */
export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const { operatorSettings } = serverRuntime();
  const [settings, actor] = await Promise.all([operatorSettings.current(), currentActor()]);

  return (
    <SiteFrame
      items={publicMenu({ signedIn: actor !== null, rilis: rilisAktif() })}
      contact={settings ? { whatsApp: settings.csWhatsApp, replyHours: settings.csReplyHours } : null}
      legalName={settings?.legalName ?? null}
    >
      {children}
    </SiteFrame>
  );
}
