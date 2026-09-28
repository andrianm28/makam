import { PageHeader } from "@/components/makam/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRupiah } from "@/lib/rupiah";
import { formatTanggalJam } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { GoodwillForm, PermintaanForms } from "./pengembalian-forms";

/**
 * Every open refund request, the page the Antrean's Tier 3 "refund transfer"
 * row links to (spec, Work Queues; ticket 31). No dedicated menu slot yet
 * (`docs/design-system.md` settles the Admin Platform menu with no Refunds
 * item, the same reason Payouts' own Pencairan run has none), so this is
 * reached only from the Antrean.
 */
export default async function PengembalianPage() {
  await staffMenuActor("admin_platform");
  const { refunds } = serverRuntime();
  const terbuka = await refunds.permintaanTerbuka();

  return (
    <>
      <PageHeader
        title="Pengembalian dana"
        description="Setiap permintaan pengembalian menunggu persetujuan Admin Platform, lalu rekening tujuan dan transfer sebelum Bukti Pengembalian Dana terbit."
      />

      <Card>
        <CardHeader>
          <CardTitle>Ajukan pengembalian goodwill</CardTitle>
          <CardDescription>Dari dana Operator sendiri, sebagai bentuk permintaan maaf; tidak pernah dipotongkan ke Lokasi Mitra.</CardDescription>
        </CardHeader>
        <CardContent>
          <GoodwillForm />
        </CardContent>
      </Card>

      {terbuka.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Tidak ada permintaan yang menunggu</CardTitle>
          </CardHeader>
        </Card>
      ) : (
        terbuka.map((permintaan) => (
          <Card key={permintaan.id}>
            <CardHeader>
              <CardTitle>
                {permintaan.nomorTagihan} · {formatRupiah(permintaan.jumlah)}
              </CardTitle>
              <CardDescription>
                Diajukan {formatTanggalJam(permintaan.diajukanPada)}
                {permintaan.nomorPemesanan ? ` · pesanan ${permintaan.nomorPemesanan}` : ""}
                {permintaan.goodwill ? " · goodwill (tidak dipotongkan)" : ""}
                {" · "}
                {permintaan.biayaLayananPlatformDikembalikan ? "Biaya Layanan Platform dikembalikan" : "Biaya Layanan Platform tetap"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PermintaanForms permintaan={permintaan} />
            </CardContent>
          </Card>
        ))
      )}
    </>
  );
}
