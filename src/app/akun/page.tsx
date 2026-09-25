import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { akunResource, authorize } from "@/domain/identity";
import { currentActor } from "@/server/session";
import { keluar } from "./actions";

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
  if (!authorize(actor, "akun.lihat", akunResource(actor.accountId)).allowed) redirect("/masuk");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Akun Saya</h1>
          <p className="text-muted-foreground">
            Masuk dengan nomor WhatsApp <span data-testid="akun-phone-number">{actor.phoneNumber}</span>
          </p>
        </div>
        <form action={keluar}>
          <Button type="submit" variant="outline">
            Keluar
          </Button>
        </form>
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
