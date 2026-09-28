import Link from "next/link";
import { Clock } from "lucide-react";
import { EmptyState } from "@/components/makam/empty-state";
import { PageHeader } from "@/components/makam/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTanggalJam } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";

/**
 * Every Saat Duka TPU order still waiting for a burial to be arranged: the
 * landing page behind the Antrean's Tier 1 "Konfirmasi TPU Saat Duka" rows, and
 * the same work shown as a list. Each order links to its confirmation screen,
 * where the agreed burial, the TPU contact and the Petugas who fetches the surat
 * pengantar are entered.
 */
export default async function PengurusanTpuListPage() {
  const actor = await staffMenuActor("admin_platform");
  const terbuka = await serverRuntime().pengurusan.konfirmasiTpuTerbuka(actor);

  return (
    <>
      <PageHeader
        title="Konfirmasi TPU Saat Duka"
        description="Setiap pengurusan yang masih menunggu pemakaman disepakati dengan TPU-nya. Tenggatnya dua jam kerja pada jam layanan TPU (pukul 06.00–18.00)."
      />

      {terbuka.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="Tidak ada pengurusan yang menunggu"
          description="Semua pengurusan Saat Duka di TPU sudah punya pemakaman yang disepakati."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Menunggu konfirmasi</CardTitle>
            <CardDescription>{terbuka.length} pengurusan menunggu pemakaman disepakati dengan TPU.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {terbuka.map((order) => (
                <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 text-body">
                  <span>
                    <span className="font-mono font-semibold text-foreground">{order.nomor}</span> · {order.almarhumName} ·{" "}
                    {order.tpuName}
                    {order.tpuDitawarkan ? ` (ditawarkan ${order.tpuDitawarkan.name})` : ""}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-small text-muted-foreground">
                      {order.konfirmasiDueAt ? `paling lambat ${formatTanggalJam(order.konfirmasiDueAt)}` : ""}
                    </span>
                    <Link
                      href={`/staf/admin-platform/pengurusan/${order.nomor}`}
                      className="font-medium text-brand underline underline-offset-4"
                    >
                      Konfirmasi
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}
