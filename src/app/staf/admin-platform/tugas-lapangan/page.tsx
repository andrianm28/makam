import { PageHeader } from "@/components/makam/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { tugasLapanganTypeLabels, tugasLapanganTypes } from "@/domain/fieldwork";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { CreateTugasLapanganForm, TugaskanTugasForm } from "./tugas-lapangan-forms";

/** Admin Platform: every Tugas Lapangan, by planned date, and the form to create and assign a new one. */
export default async function TugasLapanganListPage() {
  const actor = await staffMenuActor("admin_platform");
  const { fieldwork, identity, lokasi } = serverRuntime();
  const [tugas, staffAccounts, lokasiMitra] = await Promise.all([
    fieldwork.allTugasLapangan(actor),
    identity.staffAccounts(),
    lokasi.allLokasiMitra(actor),
  ]);
  const petugas = staffAccounts
    .filter((account) => account.roles.includes("petugas_lapangan") && !account.deactivated)
    .map((account) => ({ accountId: account.accountId, email: account.email ?? account.accountId }));

  return (
    <>
      <PageHeader title="Tugas Lapangan" description="Buat dan tugaskan pekerjaan lapangan ke satu Petugas Lapangan." />

      <Card>
        <CardHeader>
          <CardTitle>Tugas Lapangan baru</CardTitle>
          <CardDescription>Subjek, alamat + pin, tanggal rencana dan satu Petugas Lapangan.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateTugasLapanganForm
            petugas={petugas}
            lokasiMitra={lokasiMitra}
            types={tugasLapanganTypes.map((type) => ({ value: type, label: tugasLapanganTypeLabels[type] }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Setiap Tugas Lapangan</CardTitle>
        </CardHeader>
        <CardContent>
          {tugas.length === 0 ? (
            <p className="text-body text-muted-foreground">Belum ada Tugas Lapangan.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Jenis</th>
                  <th className="py-2 pr-3">Subjek</th>
                  <th className="py-2 pr-3">Tanggal rencana</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Petugas</th>
                </tr>
              </thead>
              <tbody>
                {tugas.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="py-2 pr-3">{tugasLapanganTypeLabels[item.type]}</td>
                    <td className="py-2 pr-3">{item.subject}</td>
                    <td className="py-2 pr-3">{item.plannedDate}</td>
                    <td className="py-2 pr-3">{item.status === "selesai" ? "Selesai" : item.assigneeAccountId === "" ? "Belum ditugaskan" : "Ditugaskan"}</td>
                    <td className="py-2 pr-3">
                      {item.assigneeAccountId === "" ? <TugaskanTugasForm id={item.id} petugas={petugas} /> : (petugas.find((akun) => akun.accountId === item.assigneeAccountId)?.email ?? item.assigneeAccountId)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
