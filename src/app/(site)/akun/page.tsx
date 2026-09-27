import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmailSection, PhoneSection } from "./email-section";
import { PageHeader } from "@/components/makam/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { akunResource, authorize } from "@/domain/identity";
import { hubPath } from "@/lib/makam-keluarga-content";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";
import { heldStaffRoles } from "@/server/staff-area";
import { KeluarButton } from "./keluar-button";

export const metadata: Metadata = {
  title: "Akun Saya | Makam.co.id",
  robots: { index: false, follow: false },
};

/**
 * Akun Saya: the Email Terverifikasi (changed by Verifikasi email) and the
 * phone number (a contact); the Pemesan's orders and the Makam Keluarga tab
 * (every grave whose Pemegang Hak recorded this email, as shortcuts into the
 * hub) are here, and the Pengajuan Wakaf is a shell until its slice arrives.
 */
export default async function AkunSayaPage() {
  const actor = await currentActor();
  if (!actor) redirect("/masuk");
  const authorization = authorize(actor, "akun.lihat", akunResource(actor.accountId));
  if (!authorization.allowed) redirect(authorization.reason === "perlu_totp" ? "/staf/totp" : "/masuk");
  const isStaff = heldStaffRoles(actor.roles).length > 0;
  const { inventory, lokasi } = serverRuntime();
  const namaLokasi = new Map((await lokasi.publicLokasiMitraList()).map((satu) => [satu.id, satu.name]));
  const tab = (await inventory.makamPemegangHak({ email: actor.email })).map((satu) => ({
    lokasiId: satu.lokasiId,
    namaLokasi: namaLokasi.get(satu.lokasiId) ?? "Lokasi Mitra",
    nomor: satu.nomorKavling ?? satu.petak[0]?.nomorMakam ?? "",
    almarhum: satu.petak.flatMap((petak) => petak.almarhum),
    alamat: hubPath({
      lokasiId: satu.lokasiId,
      cari: satu.kavlingId === null ? "nomor_makam" : "nomor_kavling",
      nomor: satu.nomorKavling ?? satu.petak[0]?.nomorMakam ?? "",
    }),
  }));

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
      <Card>
        <CardHeader>
          <CardTitle>Pesanan</CardTitle>
          <CardDescription>Belum ada pesanan.</CardDescription>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Makam Keluarga</CardTitle>
          <CardDescription>
            {tab.length === 0
              ? "Belum ada makam yang tercatat atas email ini."
              : "Makam yang tercatat atas email ini, masing-masing sebuah pintasan ke Makam Keluarga."}
          </CardDescription>
        </CardHeader>
        {tab.length > 0 ? (
          <CardContent>
            <ul className="flex flex-col gap-2">
              {tab.map((satu) => (
                <li key={`${satu.lokasiId}-${satu.nomor}`}>
                  <Link href={satu.alamat} className="font-medium text-brand underline underline-offset-4">
                    {satu.namaLokasi} · {satu.nomor}
                  </Link>
                  <p className="text-small text-muted-foreground">
                    {satu.almarhum.length > 0 ? satu.almarhum.join(", ") : "Belum ada nama Almarhum yang tercatat"}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        ) : null}
      </Card>
    </main>
  );
}
