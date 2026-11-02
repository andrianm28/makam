import Link from "next/link";
import { HeartHandshakeIcon } from "lucide-react";
import { EmptyState } from "@/components/makam/empty-state";
import { PageHeader } from "@/components/makam/page-header";
import { labelJenisKedukaan, labelStatusKedukaan } from "@/domain/kedukaan/skema";
import { formatTanggalJam } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";

/** Admin Platform: every Permintaan Kedukaan, newest first (ADR 0010). */
export default async function KedukaanListPage() {
  const actor = await staffMenuActor("admin_platform");
  const daftar = await serverRuntime().kedukaan.semua(actor);

  return (
    <>
      <PageHeader
        title="Permintaan Kedukaan"
        description="Permintaan Layanan Kedukaan dan Konsultasi Rencana Pemakaman: telepon keluarga, atur layanannya, lalu catat hasilnya."
      />
      {daftar.length === 0 ? (
        <EmptyState icon={HeartHandshakeIcon} title="Belum ada permintaan" description="Permintaan dari halaman Layanan Kedukaan dan Konsultasi muncul di sini." />
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border bg-card text-body">
          {daftar.map((satu) => (
            <li key={satu.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span>
                <Link href={`/staf/admin-platform/kedukaan/${satu.id}`} className="font-mono font-semibold text-primary underline underline-offset-2">
                  {satu.nomor}
                </Link>{" "}
                · {labelJenisKedukaan[satu.jenis]} · {satu.nama} · {satu.kabKota}
              </span>
              <span className="text-small text-muted-foreground">
                {labelStatusKedukaan[satu.status]} · {formatTanggalJam(satu.diajukanPada)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
