import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { staffMenuActor } from "@/server/staff-area";
import { PindahNomorForm } from "./pindah-nomor-form";

/** Pindah Nomor: the Admin Platform screen for moving an Akun to a new number after a KTP check. */
export default async function PindahNomorPage() {
  await staffMenuActor("admin_platform");
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Pindah Nomor</h1>
      <Card>
        <CardHeader>
          <CardTitle>Pindahkan Akun ke nomor baru</CardTitle>
          <CardDescription>
            Untuk pemilik Akun yang kehilangan nomor WhatsApp-nya. Cocokkan KTP dengan data pesanan Akun, unggah foto
            atau scan KTP, lalu tulis alasannya. Semua pesanan dan riwayat tetap pada Akun yang sama; tindakan ini
            tercatat di Audit Log.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PindahNomorForm />
        </CardContent>
      </Card>
    </>
  );
}
