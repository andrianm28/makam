import type { Metadata } from "next";
import { rilisTerbuka } from "@/lib/rilis";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/makam/page-header";
import { PageTabs } from "@/components/makam/page-tabs";
import { akunResource, authorize } from "@/domain/identity";
import { currentActor } from "@/server/session";
import { heldStaffRoles } from "@/server/staff-area";
import { dataAkunSaya } from "./data";
import { KeluarButton } from "./keluar-button";
import { PerluTindakanStrip } from "./perlu-tindakan-strip";

export const metadata: Metadata = {
  title: "Akun Saya | Makam.co.id",
  robots: { index: false, follow: false },
};

/**
 * Akun Saya (ticket 27): the shared header, the Perlu Tindakan strip and the
 * Profil / Pesanan / Makam Keluarga tabs, each its own URL (docs/design-system.md,
 * Detail pattern) so a shared link and the back button both land on the right one.
 * The Wakaf tab (ticket 58) and the Pemegang Hak actions (38, 39) are later
 * extension points on the same shell.
 */
export default async function AkunSayaLayout({ children }: LayoutProps<"/akun">) {
  const actor = await currentActor();
  if (!actor) redirect("/masuk");
  const authorization = authorize(actor, "akun.lihat", akunResource(actor.accountId));
  if (!authorization.allowed) redirect(authorization.reason === "perlu_totp" ? "/staf/totp" : "/masuk");
  const isStaff = heldStaffRoles(actor.roles).length > 0;
  const { perluTindakan } = await dataAkunSaya(actor.accountId);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <PageHeader
        title="Akun Saya"
        description={
          <>
            Masuk dengan Kode Masuk ke <span data-testid="akun-login-email">{actor.email}</span>
          </>
        }
        actions={
          <>
            {isStaff ? (
              <Link href="/staf" className="text-sm font-medium text-brand underline underline-offset-4">
                Area staf
              </Link>
            ) : null}
            <KeluarButton />
          </>
        }
      />
      <PerluTindakanStrip items={perluTindakan} />
      <PageTabs
        label="Tab Akun Saya"
        items={[
          { href: "/akun", label: "Profil" },
          { href: "/akun/pesanan", label: "Pesanan" },
          { href: "/akun/makam", label: "Makam Keluarga" },
          ...(rilisTerbuka("wakaf") ? [{ href: "/akun/wakaf", label: "Wakaf" }] : []),
        ]}
      />
      {children}
    </main>
  );
}
