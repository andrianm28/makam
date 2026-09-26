import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { PemulihanAkunForm } from "./pemulihan-akun-form";

const akunParam = z.string().trim().min(1).max(64);

/**
 * Pemulihan Akun: the Admin Platform screen for moving an Akun to a new Email
 * Terverifikasi after a KTP check. `?akun=<id>` (from the staff roster's
 * "Perlu Pemulihan Akun") picks the Akun by its id, the only way to an Akun
 * with no email on record; otherwise the Akun is named by its email.
 */
export default async function PemulihanAkunPage({ searchParams }: PageProps<"/staf/admin-platform/pemulihan-akun">) {
  await staffMenuActor("admin_platform");
  const parsed = akunParam.safeParse((await searchParams).akun);
  const akun = parsed.success ? await serverRuntime().identity.accountOnRecord(parsed.data) : null;

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Pemulihan Akun</h1>
      <Card>
        <CardHeader>
          <CardTitle>Pindahkan Akun ke Email Terverifikasi baru</CardTitle>
          <CardDescription>
            Untuk pemilik Akun yang tidak bisa lagi membuka emailnya, atau Akun lama yang belum punya Email
            Terverifikasi. Cocokkan KTP dengan data Akun, unggah foto atau scan KTP, lalu tulis alasannya. Semua pesanan,
            peran dan riwayat tetap pada Akun yang sama; email lama menerima pemberitahuan, dan tindakan ini tercatat di
            Audit Log.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PemulihanAkunForm
            akun={
              akun
                ? {
                    id: akun.id,
                    label: `${akun.email ?? "Tanpa email"}${akun.emailTerverifikasi ? "" : " (belum terverifikasi)"} · ${akun.phoneNumber ?? "tanpa nomor telepon"}`,
                  }
                : null
            }
          />
        </CardContent>
      </Card>
    </>
  );
}
