import type { Metadata } from "next";
import { EmptyState } from "@/components/makam/empty-state";
import { PageHeader } from "@/components/makam/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTanggalJam } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { StarIcon } from "lucide-react";

export const metadata: Metadata = {
  title: "Penilaian | Makam.co.id",
  robots: { index: false, follow: false },
};

/**
 * Every Penilaian a Pemesan gave a finished Pekerjaan Layanan, newest first (spec, Layanan; story 95): the
 * Operator's own read of quality. Admin Platform only: a Penilaian is never shown to an Admin Lokasi or a
 * Mitra Jasa. Reached from the Antrean, like the other pages that no menu slot holds.
 */
export default async function PenilaianPage() {
  const actor = await staffMenuActor("admin_platform");
  const daftar = await serverRuntime().layanan.daftarPenilaian(actor);

  return (
    <>
      <PageHeader
        title="Penilaian pemesan"
        description="Penilaian 1 sampai 5 bintang dengan komentar untuk setiap pekerjaan yang selesai. Hanya terlihat oleh Admin Platform."
      />
      {daftar.length === 0 ? (
        <EmptyState icon={StarIcon} title="Belum ada penilaian" description="Penilaian muncul di sini begitu pemesan memberikannya." />
      ) : (
        daftar.map((nilai) => (
          <Card key={nilai.pekerjaanId}>
            <CardHeader>
              <CardTitle>
                {nilai.bintang} dari 5 bintang · {nilai.label}
              </CardTitle>
              <CardDescription>
                {nilai.lokasi.name} · Petak {nilai.petak} · pesanan {nilai.pesanan} · {formatTanggalJam(nilai.dibuatAt)}
              </CardDescription>
            </CardHeader>
            {nilai.komentar ? (
              <CardContent>
                <p className="text-body text-muted-foreground">&ldquo;{nilai.komentar}&rdquo;</p>
              </CardContent>
            ) : null}
          </Card>
        ))
      )}
    </>
  );
}
