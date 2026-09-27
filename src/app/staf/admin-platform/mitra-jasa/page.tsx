import { UserPlusIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/makam/empty-state";
import { PageHeader } from "@/components/makam/page-header";
import { StatusBadge } from "@/components/makam/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { authorize, semuaMitraJasaResource } from "@/domain/identity";
import { BARU_SAMPAI_SELESAI, type MitraJasaStatus } from "@/domain/layanan";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { BuatMitraJasaForm } from "./mitra-jasa-forms";

/** Each Mitra Jasa status in the one status vocabulary's words. */
function StatusMitraJasa({ status }: { status: MitraJasaStatus }) {
  return <StatusBadge status={status} />;
}

/** Admin Platform: every Mitra Jasa, and the start of a new one's onboarding record. */
export default async function MitraJasaListPage() {
  const actor = await staffMenuActor("admin_platform");
  if (!authorize(actor, "mitra_jasa.lihat_semua", semuaMitraJasaResource()).allowed) redirect("/staf");
  const { layanan } = serverRuntime();
  const [daftar, belum] = await Promise.all([layanan.semuaMitraJasa(actor), layanan.mitraJasaBelumLengkap(actor)]);

  return (
    <>
      <PageHeader
        title="Mitra Jasa"
        description="Mitra Jasa mengerjakan Pekerjaan Layanan di TPU DKI. Onboarding, rekening Pencairan, cakupan TPU dan Layanan, status, dan tinjauan skor bulanan."
      />

      <Card>
        <CardHeader>
          <CardTitle>Mitra Jasa baru</CardTitle>
          <CardDescription>
            Isi profil dan alamat email; Undangan Staf dikirim ke email itu dan perannya diberikan saat Akun dengan Email
            Terverifikasi tersebut masuk dengan Kode Masuk.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BuatMitraJasaForm />
        </CardContent>
      </Card>

      {daftar.length === 0 ? (
        <EmptyState
          icon={UserPlusIcon}
          title="Belum ada Mitra Jasa"
          description="Tambahkan Mitra Jasa pertama lewat formulir di atas."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Daftar Mitra Jasa</CardTitle>
            <CardDescription>
              {belum.length === 0
                ? "Onboarding semua Mitra Jasa sudah lengkap."
                : `${belum.length} Mitra Jasa masih belum lengkap onboardingly.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Selesai</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {daftar.map((satu) => (
                  <TableRow key={satu.id}>
                    <TableCell>
                      <a className="font-medium underline-offset-4 hover:underline" href={`/staf/admin-platform/mitra-jasa/${satu.id}`}>
                        {satu.namaLengkap}
                      </a>
                      {satu.baru ? (
                        <Badge variant="secondary" className="ml-2">
                          Baru
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>{satu.area}</TableCell>
                    <TableCell>
                      <StatusMitraJasa status={satu.status} />
                    </TableCell>
                    <TableCell>
                      {satu.selesai}
                      {satu.baru ? ` / ${BARU_SAMPAI_SELESAI}` : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
