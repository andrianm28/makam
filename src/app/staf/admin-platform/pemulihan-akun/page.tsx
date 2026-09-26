import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { staffMenuActor } from "@/server/staff-area";
import { PemulihanAkunForm } from "./pemulihan-akun-form";

/** Pemulihan Akun: the Admin Platform screen for moving an Akun to a new Email Terverifikasi after a KTP check. */
export default async function PemulihanAkunPage() {
  await staffMenuActor("admin_platform");
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Pemulihan Akun</h1>
      <Card>
        <CardHeader>
          <CardTitle>Pindahkan Akun ke Email Terverifikasi baru</CardTitle>
          <CardDescription>
            Untuk pemilik Akun yang tidak bisa lagi membuka emailnya, atau Akun lama yang belum punya Email
            Terverifikasi. Cocokkan KTP dengan data Akun, unggah foto atau scan KTP, lalu tulis alasannya. Semua pesanan,
            peran dan riwayat tetap pada Akun yang sama; tindakan ini tercatat di Audit Log.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PemulihanAkunForm />
        </CardContent>
      </Card>
    </>
  );
}
