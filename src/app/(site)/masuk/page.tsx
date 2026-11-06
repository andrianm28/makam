import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { KodeMasukForm } from "@/components/kode-masuk/kode-masuk-form";
import { PageHero } from "@/components/site/content-page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <main className="flex w-full flex-1 flex-col">
      <PageHero
        title="Masuk"
        lead="Masukkan email Anda. Kami mengirim Kode Masuk ke email itu. Tidak perlu daftar: bila email ini belum punya akun, akun dibuat saat kodenya dimasukkan."
      />
      <div className="mx-auto flex w-full max-w-lg flex-col px-(--page-gutter) py-10 md:py-14">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="font-heading text-3xl font-extrabold tracking-tight text-forest">Email Anda</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-lg">
            <KodeMasukForm requestAction={kirimKodeMasuk} verifyAction={masukDenganKodeMasuk} csContact={csContact} />
          </CardContent>
        </Card>
        <p className="mt-5 text-center text-body text-muted-foreground">
          Dengan masuk, Anda menyetujui pemakaian data Anda seperti dijelaskan di{" "}
          <Link href="/kebijakan-privasi" className="font-semibold underline underline-offset-4">
            Kebijakan Privasi
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
