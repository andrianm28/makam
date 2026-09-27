import type { Metadata } from "next";
import Link from "next/link";
import { InboxIcon } from "lucide-react";
import { EmptyState } from "@/components/makam/empty-state";
import { PageHeader } from "@/components/makam/page-header";
import { StatCard } from "@/components/makam/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import type { AntreanLokasiRow } from "@/domain/queues";
import { cn } from "@/lib/utils";
import { formatTanggalJam } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { adminLokasiScope } from "../../scope";
import { CatatPanggilanForm } from "./catat-panggilan-form";

export const metadata: Metadata = { title: "Antrean Lokasi · Area Staf" };

/**
 * The Antrean Lokasi (spec, Work Queues; story 115): the Admin Lokasi's own list
 * of open work for this Lokasi Mitra, in Mendesak and Lainnya, soonest deadline
 * first. Rows only — there is no Ambil, no tier and no Bertugas here — and every
 * row closes itself as the state it reads moves on.
 */
export default async function AntreanLokasiPage({ params }: PageProps<"/staf/admin-lokasi/[lokasiId]/antrean">) {
  const { lokasiId } = await params;
  const { actor, current } = await adminLokasiScope(lokasiId);
  const antrean = await serverRuntime().queues.antreanLokasi(actor, current.id);
  const jumlah = antrean.mendesak.length + antrean.lainnya.length;

  return (
    <>
      <PageHeader
        title="Antrean Lokasi"
        description={`Baris kerja terbuka di ${current.name}, per kelompok lalu tenggat. Baris menutup diri sendiri begitu keadaannya berubah.`}
      />

      <section aria-label="Ringkasan" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Baris terbuka" value={jumlah} attention={jumlah > 0 ? "warning" : undefined} />
        <StatCard
          label="Konfirmasi terlambat"
          value={antrean.statistik.konfirmasiTerlambat}
          attention={antrean.statistik.konfirmasiTerlambat > 0 ? "danger" : undefined}
        />
      </section>

      {jumlah === 0 ? (
        <EmptyState icon={InboxIcon} title="Antrean kosong" description="Tidak ada baris kerja terbuka di Lokasi Mitra ini." />
      ) : (
        <div className="flex flex-col gap-6">
          <Grupan judul="Mendesak" baris={antrean.mendesak} lokasiId={current.id} />
          <Grupan judul="Lainnya" baris={antrean.lainnya} lokasiId={current.id} />
        </div>
      )}
    </>
  );
}

/** One group of rows, its own heading and nothing else: the group is the row type's declaration. */
function Grupan({ judul, baris, lokasiId }: { judul: string; baris: AntreanLokasiRow[]; lokasiId: string }) {
  if (baris.length === 0) return null;
  return (
    <section aria-label={judul} className="flex flex-col gap-3">
      <h2 className="text-title-2 text-foreground">{judul}</h2>
      <div className="flex flex-col gap-3">
        {baris.map((row) => (
          <Baris key={`${row.type}:${row.subjectId}`} row={row} lokasiId={lokasiId} />
        ))}
      </div>
    </section>
  );
}

/** One row: what it is, its deadline, and the one thing this row's kind asks the staff member to do. */
function Baris({ row, lokasiId }: { row: AntreanLokasiRow; lokasiId: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-caption text-muted-foreground">{row.label}</p>
          <Link href={row.href} className="text-body font-medium text-foreground underline-offset-4 hover:underline">
            {row.subjectLabel}
          </Link>
          <p className={cn("text-small", row.pastDeadline ? "text-danger-soft-foreground" : "text-muted-foreground")}>
            {row.deadline
              ? `Tenggat ${formatTanggalJam(row.deadline)}${row.pastDeadline ? " — lewat tenggat" : ""}`
              : "Tidak ada tenggat"}
          </p>
        </div>
        {row.type === "pesan_lokasi_gagal" ? <CatatPanggilanForm lokasiId={lokasiId} teleponId={row.subjectId} /> : null}
      </CardContent>
    </Card>
  );
}
