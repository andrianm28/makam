import { MapPinnedIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/makam/empty-state";
import { PageHeader } from "@/components/makam/page-header";
import { StatCard } from "@/components/makam/stat-card";
import { buttonVariants } from "@/components/ui/button";
import { formatTanggalTanpaTahun } from "@/lib/time/jakarta";
import { adminPlatformBeranda } from "./beranda";

const AP = "/staf/admin-platform";

/** The Admin Platform Beranda: where things stand across Lokasi Mitra, staf and the Operator's own settings. */
export default async function AdminPlatformPage() {
  const { lokasiMitra, staf, hariLiburBerikutnya, pengaturanOperatorDiisi } = await adminPlatformBeranda();
  const totalLokasi = Object.values(lokasiMitra).reduce((sum, count) => sum + count, 0);

  return (
    <>
      <PageHeader
        title="Admin Platform"
        description="Ringkasan Lokasi Mitra, Akun Staf, Hari Libur Nasional dan Pengaturan Operator. Setiap angka membuka daftarnya."
      />

      <section aria-label="Ringkasan" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Lokasi Mitra Terverifikasi"
          value={lokasiMitra.terverifikasi}
          note={`${lokasiMitra.belum_tayang} Belum Tayang, ${lokasiMitra.ditangguhkan} Ditangguhkan`}
          attention={lokasiMitra.ditangguhkan > 0 ? "warning" : undefined}
          href={`${AP}/lokasi`}
        />
        <StatCard
          label="Akun Staf aktif"
          value={staf.aktif}
          note={
            staf.undanganTerbuka > 0 ? `${staf.undanganTerbuka} Undangan Staf belum diterima` : "Tidak ada Undangan Staf terbuka"
          }
          href={`${AP}/staf`}
        />
        <StatCard
          label="Hari Libur Nasional berikutnya"
          value={hariLiburBerikutnya ? formatTanggalTanpaTahun(hariLiburBerikutnya.date) : "Belum ada"}
          note={
            hariLiburBerikutnya
              ? `${hariLiburBerikutnya.name}, ${hariLiburBerikutnya.date.slice(0, 4)}`
              : "Tidak ada tanggal mendatang: setiap Senin–Jumat dihitung Hari Kerja"
          }
          attention={hariLiburBerikutnya ? undefined : "warning"}
          href={`${AP}/hari-libur`}
        />
        <StatCard
          label="Pengaturan Operator"
          value={pengaturanOperatorDiisi ? "Terisi" : "Belum diisi"}
          note={
            pengaturanOperatorDiisi
              ? "Nama resmi, alamat, kontak dan nomor CS"
              : "Nama resmi, alamat, kontak dan nomor CS belum ada"
          }
          attention={pengaturanOperatorDiisi ? undefined : "warning"}
          href={`${AP}/pengaturan-operator`}
        />
      </section>

      {totalLokasi === 0 ? (
        <EmptyState
          icon={MapPinnedIcon}
          title="Belum ada Lokasi Mitra"
          description="Lokasi Mitra baru berstatus Belum Tayang sampai profil, perjanjian, rekening, kebijakan dan Admin Lokasi-nya lengkap."
          action={
            <Link href={`${AP}/lokasi`} className={buttonVariants({ variant: "default" })}>
              <PlusIcon aria-hidden /> Tambah Lokasi Mitra
            </Link>
          }
        />
      ) : null}
    </>
  );
}
