import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { currentActor } from "@/server/session";
import { homeFor } from "@/server/staff-area";
import { EmailLoginForm } from "./email-login-form";

export const metadata: Metadata = {
  title: "Masuk dengan email | Makam.co.id",
  robots: { index: false, follow: false },
};

export default async function MasukDenganEmailPage() {
  const actor = await currentActor();
  if (actor) redirect(homeFor(actor));

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="text-2xl font-semibold">Masuk dengan email</h1>
          </CardTitle>
          <CardDescription>Kami mengirim kode masuk ke email terverifikasi akun Anda.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <EmailLoginForm />
          <Link href="/masuk" className="text-sm underline underline-offset-4">
            Masuk dengan nomor WhatsApp
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
