import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { KodeMasukForm } from "@/components/kode-masuk/kode-masuk-form";
import { PageHero } from "@/components/site/content-page";
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
        eyebrow="Akun Saya"
        title="Masuk"
        lead="Masukkan email Anda. Kami mengirim Kode Masuk ke email itu. Tidak perlu daftar: bila email ini belum punya akun, akun dibuat saat kodenya dimasukkan."
        poin={["Tanpa kata sandi, cukup Kode Masuk dari email", "Pesanan, Tagihan dan dokumen keluarga ada di Akun Saya"]}
        samping={
          <div className="flex flex-col gap-5 rounded-3xl border border-border bg-card p-7 shadow-lg md:p-8">
            <h2 className="font-heading text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">Email Anda</h2>
            <div className="text-lg">
              <KodeMasukForm requestAction={kirimKodeMasuk} verifyAction={masukDenganKodeMasuk} csContact={csContact} />
            </div>
            <p className="text-body text-muted-foreground">
              Dengan masuk, Anda menyetujui pemakaian data Anda seperti dijelaskan di{" "}
              <Link href="/kebijakan-privasi" className="font-semibold text-forest underline underline-offset-4">
                Kebijakan Privasi
              </Link>
              .
            </p>
          </div>
        }
      />
    </main>
  );
}
