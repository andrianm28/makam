import Link from "next/link";
import { redirect } from "next/navigation";
import { FormSection } from "@/components/makam/form-section";
import { PageHeader } from "@/components/makam/page-header";
import { authorize, semuaTpuDkiResource } from "@/domain/identity";
import { TPU_FLAG_STALE_DAYS } from "@/domain/queues";
import { formatTanggalPanjang } from "@/lib/format-tanggal";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { wibDateOf } from "@/lib/time/jakarta";
import { AddTpuForm } from "./tpu-forms";

/** Admin Platform keeps the DKI TPU list: the whole catalog, never seeded. */
export default async function TpuDkiPage() {
  const actor = await staffMenuActor("admin_platform");
  if (!authorize(actor, "tpu.lihat_semua", semuaTpuDkiResource()).allowed) redirect("/staf");
  const tpu = await serverRuntime().lokasi.tpuDkiList(actor);

  return (
    <>
      <PageHeader
        title="TPU DKI"
        description={`Setiap TPU resmi Pemda di Jakarta, dengan alamat, titik peta, sumber data dan status menerima makam baru. Status yang tidak diperiksa ${TPU_FLAG_STALE_DAYS} hari muncul di Antrean sebagai "Cek status TPU".`}
      />

      <FormSection title="Tambah TPU">
        <AddTpuForm />
      </FormSection>

      <FormSection title="Daftar TPU" description={`${tpu.length} TPU.`}>
        {tpu.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada TPU di daftar ini.</p>
        ) : (
          <ul className="flex flex-col divide-y text-sm">
            {tpu.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="flex flex-col">
                  <Link href={`/staf/admin-platform/tpu/${item.id}`} className="font-medium text-brand underline underline-offset-4">
                    {item.name}
                  </Link>
                  <span className="text-muted-foreground">
                    {item.city} · {item.menerimaMakamBaru ? "menerima makam baru" : "tidak menerima makam baru"} · diperbarui{" "}
                    {formatTanggalPanjang(wibDateOf(item.flagUpdatedAt))}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </FormSection>
    </>
  );
}
