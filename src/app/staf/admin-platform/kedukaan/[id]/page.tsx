import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/makam/page-header";
import { labelJenisKedukaan, labelStatusKedukaan, labelWaktuDihubungi, transisiStafKedukaan } from "@/domain/kedukaan/skema";
import { formatTanggal, formatTanggalJam } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { StatusKedukaanForm } from "../status-form";

const labelLangkah: Record<string, string> = { dihubungi: "Sudah dihubungi", selesai: "Selesai", dibatalkan: "Batalkan" };

/** The rincian a jenis asked for, as label and value. */
function rincianOf(rincian: Record<string, unknown>): [string, string][] {
  const label: Record<string, string> = {
    asal: "Asal / penjemputan",
    tujuan: "Tujuan",
    negaraAsal: "Negara asal",
    tanggal: "Tanggal",
    teksUcapan: "Teks ucapan",
    waktuDihubungi: "Waktu dihubungi",
    lokasiDiminati: "Lokasi diminati",
  };
  return Object.entries(rincian)
    .filter(([, nilai]) => typeof nilai === "string" && nilai !== "")
    .map(([kunci, nilai]) => {
      const teks = String(nilai);
      if (kunci === "tanggal") return [label[kunci]!, formatTanggal(teks)];
      if (kunci === "waktuDihubungi") return [label[kunci]!, labelWaktuDihubungi[teks as keyof typeof labelWaktuDihubungi] ?? teks];
      return [label[kunci] ?? kunci, teks];
    });
}

/** Admin Platform: one Permintaan Kedukaan, its facts, its timeline and the moves allowed from its status. */
export default async function KedukaanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await staffMenuActor("admin_platform");
  const permintaan = await serverRuntime().kedukaan.satu(actor, (await params).id);
  if (!permintaan) notFound();
  const pilihan = transisiStafKedukaan[permintaan.status].map((status) => ({ status, label: labelLangkah[status] ?? labelStatusKedukaan[status] }));

  return (
    <>
      <PageHeader
        title={`${labelJenisKedukaan[permintaan.jenis]} · ${permintaan.nomor}`}
        description={`${labelStatusKedukaan[permintaan.status]} · diajukan ${formatTanggalJam(permintaan.diajukanPada)}`}
        actions={
          <Link href="/staf/admin-platform/kedukaan" className="text-sm font-medium text-brand underline underline-offset-4">
            Semua permintaan
          </Link>
        }
      />
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-xl border bg-card p-4 text-body">
        <dt className="font-semibold">Nama</dt>
        <dd>{permintaan.nama}</dd>
        <dt className="font-semibold">Telepon</dt>
        <dd>
          <a href={`tel:${permintaan.telepon}`} className="text-primary underline underline-offset-2">
            {permintaan.telepon}
          </a>
        </dd>
        <dt className="font-semibold">Email</dt>
        <dd>{permintaan.email}</dd>
        <dt className="font-semibold">Kota/kabupaten</dt>
        <dd>{permintaan.kabKota}</dd>
        {rincianOf(permintaan.rincian as Record<string, unknown>).map(([label, nilai]) => (
          <div key={label} className="contents">
            <dt className="font-semibold">{label}</dt>
            <dd>{nilai}</dd>
          </div>
        ))}
        {permintaan.catatan ? (
          <>
            <dt className="font-semibold">Catatan keluarga</dt>
            <dd>{permintaan.catatan}</dd>
          </>
        ) : null}
      </dl>
      <ol className="flex flex-col gap-1 text-body">
        {permintaan.riwayat.map((langkah, indeks) => (
          <li key={indeks}>
            {labelStatusKedukaan[langkah.status]} · {formatTanggalJam(langkah.pada)}
            {langkah.catatan ? ` · ${langkah.catatan}` : ""}
          </li>
        ))}
      </ol>
      {pilihan.length > 0 ? <StatusKedukaanForm permintaanId={permintaan.id} pilihan={pilihan} /> : null}
    </>
  );
}
