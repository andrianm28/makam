import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KodeMasukForm } from "@/components/kode-masuk/kode-masuk-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";
import { homeFor } from "@/server/staff-area";
import { kirimKodeMasuk, masukDenganKodeMasuk } from "./actions";

export const metadata: Metadata = {
  title: "Masuk | Makam.co.id",
  robots: { index: false, follow: false },
};

export default async function MasukPage() {
  const actor = await currentActor();
  if (actor) redirect(homeFor(actor));
  // "Tidak punya email? Minta bantuan CS" names the CS number once Pengaturan Operator holds it.
  const settings = await serverRuntime().operatorSettings.current();
  const csContact = settings ? { whatsApp: settings.csWhatsApp, replyHours: settings.csReplyHours } : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="text-title-1 text-foreground">Masuk</h1>
          </CardTitle>
          <CardDescription>
            Masukkan email Anda. Kami mengirim Kode Masuk ke email itu. Tidak perlu daftar: bila email ini belum punya
            akun, akun dibuat saat kodenya dimasukkan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <KodeMasukForm requestAction={kirimKodeMasuk} verifyAction={masukDenganKodeMasuk} csContact={csContact} />
        </CardContent>
      </Card>
    </main>
  );
}
