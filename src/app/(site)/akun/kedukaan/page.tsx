import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HeartHandshake } from "lucide-react";
import { EmptyState } from "@/components/makam/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { labelJenisKedukaan, labelStatusKedukaan } from "@/domain/kedukaan/skema";
import { formatTanggalJam } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";
import { BatalkanKedukaanForm } from "./batalkan-form";

export const metadata: Metadata = {
  title: "Layanan Kedukaan · Akun Saya | Makam.co.id",
  robots: { index: false, follow: false },
};

/** Akun Saya's Layanan Kedukaan tab (ADR 0010): the family's own Permintaan Kedukaan with their timeline. */
export default async function AkunKedukaanPage() {
  const actor = await currentActor();
  if (!actor) redirect("/masuk");
  const daftar = await serverRuntime().kedukaan.milikSaya(actor.accountId);

  if (daftar.length === 0) {
    return (
      <EmptyState
        icon={HeartHandshake}
        title="Belum ada permintaan"
        description="Permintaan Layanan Kedukaan dan Konsultasi Rencana Pemakaman Anda tampil di sini beserta statusnya."
        action={
          <Link href="/layanan-kedukaan" className="font-semibold text-primary underline underline-offset-2">
            Lihat Layanan Kedukaan
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {daftar.map((satu) => (
        <Card key={satu.id}>
          <CardHeader>
            <CardTitle>
              {labelJenisKedukaan[satu.jenis]} · {labelStatusKedukaan[satu.status]}
            </CardTitle>
            <CardDescription>
              {satu.nomor} · {satu.kabKota} · diajukan {formatTanggalJam(satu.diajukanPada)}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-body">
            <ol className="flex flex-col gap-1">
              {satu.riwayat.map((langkah, indeks) => (
                <li key={indeks}>
                  {labelStatusKedukaan[langkah.status]} · {formatTanggalJam(langkah.pada)}
                  {langkah.catatan ? ` · ${langkah.catatan}` : ""}
                </li>
              ))}
            </ol>
            {satu.status === "diajukan" ? <BatalkanKedukaanForm permintaanId={satu.id} /> : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
