import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { akunResource, authorize } from "@/domain/identity";
import { currentActor } from "@/server/session";
import { heldStaffRoles } from "@/server/staff-area";
import { KeluarButton } from "./keluar-button";

export const metadata: Metadata = {
  title: "Akun Saya | Makam.co.id",
  robots: { index: false, follow: false },
};

/**
 * Akun Saya: an empty shell until ticket 27 fills in the Pemesan's orders,
 * Makam Keluarga and Pengajuan Wakaf.
 */
export default async function AkunSayaPage() {
  const actor = await currentActor();
  if (!actor) redirect("/masuk");
  const authorization = authorize(actor, "akun.lihat", akunResource(actor.accountId));
  if (!authorization.allowed) redirect(authorization.reason === "perlu_totp" ? "/staf/totp" : "/masuk");
  const isStaff = heldStaffRoles(actor.roles).length > 0;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Akun Saya</h1>
          <p className="text-muted-foreground">
            Masuk dengan nomor WhatsApp <span data-testid="akun-phone-number">{actor.phoneNumber}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isStaff ? (
            <Link href="/staf" className="text-sm font-medium underline underline-offset-4">
              Area staf
            </Link>
          ) : null}
          <KeluarButton />
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Pesanan</CardTitle>
          <CardDescription>Belum ada pesanan.</CardDescription>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Makam Keluarga</CardTitle>
          <CardDescription>Belum ada makam yang tercatat atas nomor ini.</CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
