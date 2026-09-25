import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { currentActor } from "@/server/session";
import { MasukForm } from "./masuk-form";

export const metadata: Metadata = {
  title: "Masuk | Makam.co.id",
  robots: { index: false, follow: false },
};

export default async function MasukPage() {
  if (await currentActor()) redirect("/akun");

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
        <CardContent>
          <MasukForm />
        </CardContent>
      </Card>
    </main>
  );
}
