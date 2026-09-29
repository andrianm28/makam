import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EmailSection, PhoneSection } from "./email-section";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { currentActor } from "@/server/session";

export const metadata: Metadata = {
  title: "Profil · Akun Saya | Makam.co.id",
  robots: { index: false, follow: false },
};

/**
 * Akun Saya's Profil tab (ticket 27's AC 6; email and Verifikasi email built in
 * ticket 67, phone number in ticket 82): the Email Terverifikasi (changed only
 * through Verifikasi email — it can never be removed) and the phone number, an
 * unverified contact the Pemesan may edit freely.
 */
export default async function AkunProfilPage() {
  const actor = await currentActor();
  if (!actor) redirect("/masuk");

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Email</CardTitle>
          <CardDescription>Kode Masuk, Tagihan, Bukti dan kabar pesanan dikirim ke email ini.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmailSection email={actor.email} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Nomor telepon</CardTitle>
          <CardDescription>Agar staf bisa menelepon Anda bila perlu. Nomor ini tidak dipakai untuk masuk.</CardDescription>
        </CardHeader>
        <CardContent>
          <PhoneSection phoneNumber={actor.phoneNumber} />
        </CardContent>
      </Card>
    </div>
  );
}
