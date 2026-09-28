import { PageHeader } from "@/components/makam/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRupiah } from "@/lib/rupiah";
import { formatTanggalJam } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { SetorRetribusiForms } from "./setor-retribusi-forms";

/**
 * The open Setor Retribusi rows, the page the Antrean's Tier 3 row links to
 * (spec, Work Queues; ticket 45). A Retribusi Pemda line the family paid is the
 * Operator's to hand on to the town, so each one here is a debt until it is
 * recorded with the proof.
 *
 * Every Retribusi is Rp 0 today, so this list is empty in practice; v1 builds
 * the structure, and a tariff that turns non-zero fills it with no code change.
 */
export default async function SetorRetribusiPage() {
  await staffMenuActor("admin_platform");
  const { fieldwork, identity } = serverRuntime();
  const [terbuka, staffAccounts] = await Promise.all([fieldwork.setorRetribusiTerbuka(), identity.staffAccounts()]);
  const petugas = staffAccounts
    .filter((account) => account.roles.includes("petugas_lapangan") && !account.deactivated)
    .map((account) => ({ accountId: account.accountId, name: account.name || account.email || account.accountId }));

  return (
    <>
      <PageHeader
        title="Setor Retribusi"
        description="Setiap Tagihan Lunas dengan baris Retribusi Pemda bukan nol harus disetor ke Pemda. Baris Antrean Tier 3 terbuka dua hari kerja setelah Lunas dan menutup begitu setor dicatat."
      />

      {terbuka.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Tidak ada setoran yang menunggu</CardTitle>
            <CardDescription>
              Retribusi Pemda saat ini Rp 0, jadi tidak ada satu pun Tagihan yang harus disetor ke Pemda. Baris
              ini terisi sendiri begitu tarif Retribusi Pemda berubah.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        terbuka.map((setor) => (
          <Card key={setor.tagihanId}>
            <CardHeader>
              <CardTitle>
                {setor.nomorTagihan}
                {setor.placeName ? ` · ${setor.placeName}` : ""}
              </CardTitle>
              <CardDescription>
                {formatRupiah(setor.amount)} · Lunas {formatTanggalJam(setor.lunasAt)}
                {setor.dueAt ? ` · jatuh tempo ${formatTanggalJam(setor.dueAt)}` : ""}
                {setor.nomorPemesanan ? ` · pesanan ${setor.nomorPemesanan}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SetorRetribusiForms
                setor={{
                  tagihanId: setor.tagihanId,
                  nomorTagihan: setor.nomorTagihan,
                  sudahDitugaskan: setor.tugasLapanganId !== null,
                }}
                petugas={petugas}
              />
            </CardContent>
          </Card>
        ))
      )}
    </>
  );
}
