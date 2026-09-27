import { notFound } from "next/navigation";
import { FormSection } from "@/components/makam/form-section";
import { PageHeader } from "@/components/makam/page-header";
import { formatTanggalPanjang } from "@/lib/format-tanggal";
import { TPU_FLAG_STALE_DAYS } from "@/domain/queues";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { wibDateOf } from "@/lib/time/jakarta";
import { TpuProfileForm, TpuStatusForm } from "../tpu-forms";

/** One TPU: its profile, and what it takes today (the Antrean's Tier 4 row opens on this). */
export default async function TpuDkiDetailPage({ params }: PageProps<"/staf/admin-platform/tpu/[tpuId]">) {
  const actor = await staffMenuActor("admin_platform");
  const { tpuId } = await params;
  const tpu = (await serverRuntime().lokasi.tpuDkiList(actor)).find((item) => item.id === tpuId);
  if (!tpu) notFound();
  const checkedOn = wibDateOf(tpu.flagUpdatedAt);

  return (
    <>
      <PageHeader
        title={tpu.name}
        description={`${tpu.city} · TPU resmi pemerintah daerah. Makam.co.id tidak mengelola TPU, hanya mengurus berkas IPTM-nya.`}
      >
        <p className="text-body">
          <span className="font-medium">Status makam baru:</span>{" "}
          {tpu.menerimaMakamBaru ? "menerima makam baru" : "tidak menerima makam baru"}. Diperiksa terakhir pada{" "}
          {formatTanggalPanjang(checkedOn)}.
        </p>
      </PageHeader>

      <div className="flex flex-col gap-2 text-body">
        <p>{tpu.address}</p>
        <p className="text-small text-muted-foreground">
          Sumber data: {tpu.dataSource}. Status yang tidak diperiksa {TPU_FLAG_STALE_DAYS} hari muncul di Antrean sebagai &ldquo;Cek
          status TPU&rdquo;.
        </p>
      </div>

      <FormSection title="Status makam baru" description="Setiap penyimpanan mencatat tanggal pemeriksaan ini, dan masuk ke Audit Log.">
        <TpuStatusForm tpu={tpu} />
      </FormSection>

      <FormSection title="Profil TPU" description="Nama, alamat, kota, titik peta dan sumber data. Status makam baru punya formulirnya sendiri di atas.">
        <TpuProfileForm tpu={tpu} />
      </FormSection>
    </>
  );
}
