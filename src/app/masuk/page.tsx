import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";
import { homeFor } from "@/server/staff-area";
import { MasukForm } from "./masuk-form";

export const metadata: Metadata = {
  title: "Masuk | Makam.co.id",
  robots: { index: false, follow: false },
};

export default async function MasukPage() {
  const actor = await currentActor();
  if (actor) redirect(homeFor(actor));
  // The OTP screen's CS pointer names the CS WhatsApp number once Pengaturan Operator holds it.
  const settings = await serverRuntime().operatorSettings.current();
  const csContact = settings ? { whatsApp: settings.csWhatsApp, replyHours: settings.csReplyHours } : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="text-2xl font-semibold">Masuk</h1>
          </CardTitle>
          <CardDescription>
            Masuk dengan nomor WhatsApp Anda. Tidak perlu daftar: akun dibuat saat nomor Anda terverifikasi.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <MasukForm csContact={csContact} />
          <Link href="/masuk/email" className="text-sm underline underline-offset-4">
            Masuk dengan email
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
