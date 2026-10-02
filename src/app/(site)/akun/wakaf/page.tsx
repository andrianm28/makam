import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HeartHandshake } from "lucide-react";
import { EmptyState } from "@/components/makam/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { labelStatusWakaf } from "@/domain/wakaf/skema";
import { formatTanggal, formatTanggalJam } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";
import { BatalkanWakafForm, TambahBerkasForm } from "./wakaf-forms";

export const metadata: Metadata = {
  title: "Wakaf · Akun Saya | Makam.co.id",
  robots: { index: false, follow: false },
};

const statusAkhir = new Set(["selesai", "ditolak", "dirujuk", "dibatalkan"]);

/**
 * Akun Saya's Wakaf tab: the Wakif's own Pengajuan Wakaf with its timeline, the dates, the notes Admin
 * Platform wrote to them, their documents and the final AIW / certificate scan. Never an internal note or
 * the survey: the module's read for a Wakif does not select them.
 */
export default async function AkunWakafPage() {
  const actor = await currentActor();
  if (!actor) redirect("/masuk");
  const daftar = await serverRuntime().wakaf.pengajuanSaya({ accountId: actor.accountId, email: actor.email });

  if (daftar.length === 0) {
    return (
      <EmptyState
        icon={HeartHandshake}
        title="Belum ada Pengajuan Wakaf"
        description="Pengajuan wakaf tanah Anda tampil di sini beserta statusnya."
        action={
          <Link href="/wakaf-tanah" className="font-semibold text-primary underline underline-offset-2">
            Ajukan wakaf tanah
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
              {satu.nomor} · {labelStatusWakaf[satu.status]}
            </CardTitle>
            <CardDescription>
              {satu.kabKota} · {satu.luasM2.toLocaleString("id-ID")} m² · diajukan {formatTanggalJam(satu.diajukanPada)}
              {satu.nazhirNama ? ` · Nazhir ${satu.nazhirNama}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-body">
            {satu.alasan ? <p>{satu.alasan}</p> : null}
            {satu.tanggalSurvei ? <p>Survei: {formatTanggal(satu.tanggalSurvei)}</p> : null}
            {satu.tanggalIkrar ? <p>Ikrar di KUA: {formatTanggal(satu.tanggalIkrar)}</p> : null}
            <ol className="flex flex-col gap-1">
              {satu.riwayat.map((langkah, indeks) => (
                <li key={indeks}>
                  {labelStatusWakaf[langkah.status]} · {formatTanggalJam(langkah.pada)}
                </li>
              ))}
            </ol>
            {satu.catatan.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="font-semibold">Catatan dari tim kami</p>
                {satu.catatan.map((catatan) => (
                  <p key={catatan.id} className="rounded-lg bg-muted px-3 py-2">
                    {catatan.isi} <span className="text-small text-muted-foreground">· {formatTanggalJam(catatan.pada)}</span>
                  </p>
                ))}
              </div>
            ) : null}
            {satu.berkas.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {satu.berkas.map((berkas) => (
                  <li key={berkas.id}>
                    <a href={`/akun/wakaf/${satu.id}/berkas/${berkas.id}`} className="text-primary underline underline-offset-2">
                      {berkas.kunci === "hasil" ? "Scan AIW / sertipikat" : berkas.kunci.replaceAll("_", " ")}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
            {!statusAkhir.has(satu.status) ? <TambahBerkasForm pengajuanId={satu.id} /> : null}
            {satu.bisaDibatalkan ? <BatalkanWakafForm pengajuanId={satu.id} /> : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
