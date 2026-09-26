import { InboxIcon } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/makam/page-header";
import { StatCard } from "@/components/makam/stat-card";
import { StatusBadge } from "@/components/makam/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { antrean, lokasiMitra, pekerjaanTerlambat } from "./_mock/data";
import { AntreanList } from "./antrean-list";
import { BASE } from "./_shell/nav";

/** PROTOTYPE (a): the Admin Platform dashboard. */
export default function DashboardPratinjau() {
  const aktif = lokasiMitra.filter((item) => item.status === "terverifikasi").length;
  const belumTayang = lokasiMitra.filter((item) => item.status === "belum_tayang").length;

  return (
    <>
      <PageHeader
        title="Hari ini"
        description="Sabtu, 26 September 2026. Anda Bertugas sampai 18.00; peringatan mendesak masuk ke WhatsApp dan perangkat ini."
        actions={
          <Link href={`${BASE}/antrean`} className={buttonVariants({ variant: "default" })}>
            <InboxIcon aria-hidden /> Buka Antrean
          </Link>
        }
      />

      <section aria-label="Ringkasan" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Lokasi Mitra aktif" value={aktif} note={`${belumTayang} Belum Tayang menunggu Kunjungan Verifikasi`} href={`${BASE}/lokasi`} />
        <StatCard label="Staf" value={38} note="3 Undangan Staf belum diterima" href={`${BASE}/staf`} />
        <StatCard label="Antrean hari ini" value={17} note="2 lewat tenggat dalam 1 jam" attention="warning" href={`${BASE}/antrean`} />
        <StatCard label="Tagihan lewat jatuh tempo" value={4} note="Rp 18.450.000 belum dibayar" attention="danger" href={`${BASE}/antrean`} />
      </section>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="flex flex-col gap-3" aria-labelledby="antrean-judul">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="antrean-judul" className="text-title-2">
              Antrean, paling mendesak dulu
            </h2>
            <Link href={`${BASE}/antrean`} className="text-small font-medium text-brand underline-offset-4 hover:underline">
              Lihat semua 17
            </Link>
          </div>
          <AntreanList rows={antrean} />
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="terlambat-judul">
          <h2 id="terlambat-judul" className="text-title-2">
            Pekerjaan Layanan Terlambat
          </h2>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
            {pekerjaanTerlambat.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 p-4">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="text-body font-medium">{item.layanan}</p>
                  <p className="text-small text-muted-foreground">{item.tempat}</p>
                  <p className="text-small text-muted-foreground">Oleh {item.oleh}, {item.hari} hari tanpa foto</p>
                </div>
                <StatusBadge status="terlambat" />
              </li>
            ))}
          </ul>
          <p className="text-small text-muted-foreground">
            Terlambat berarti belum ada foto bukti dua hari setelah tanggal target.
          </p>
        </section>
      </div>
    </>
  );
}
