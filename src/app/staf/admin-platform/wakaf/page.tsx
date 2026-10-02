import Link from "next/link";
import { HeartHandshakeIcon } from "lucide-react";
import { EmptyState } from "@/components/makam/empty-state";
import { PageHeader } from "@/components/makam/page-header";
import { labelStatusWakaf } from "@/domain/wakaf/skema";
import { formatTanggalJam } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";

/** Admin Platform: every Pengajuan Wakaf, newest first, with the link to review each one. */
export default async function WakafListPage() {
  const actor = await staffMenuActor("admin_platform");
  const daftar = await serverRuntime().wakaf.semuaPengajuan(actor);

  return (
    <>
      <PageHeader
        title="Wakaf Tanah"
        description="Pengajuan Wakaf dari Wakif: tinjau, cocokkan Nazhir, jadwalkan survei dan selesaikan. Operator hanya memfasilitasi; tanah dan uang tidak pernah melewati Makam.co.id."
        actions={
          <Link href="/staf/admin-platform/wakaf/nazhir" className="text-sm font-medium text-brand underline underline-offset-4">
            Daftar Nazhir
          </Link>
        }
      />
      {daftar.length === 0 ? (
        <EmptyState icon={HeartHandshakeIcon} title="Belum ada Pengajuan Wakaf" description="Pengajuan dari halaman Wakaf Tanah muncul di sini." />
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border bg-card text-body">
          {daftar.map((satu) => (
            <li key={satu.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span>
                <Link href={`/staf/admin-platform/wakaf/${satu.id}`} className="font-mono font-semibold text-primary underline underline-offset-2">
                  {satu.nomor}
                </Link>{" "}
                · {satu.wakifNama} · {satu.kabKota}
              </span>
              <span className="text-small text-muted-foreground">
                {labelStatusWakaf[satu.status]} · {formatTanggalJam(satu.diajukanPada)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
