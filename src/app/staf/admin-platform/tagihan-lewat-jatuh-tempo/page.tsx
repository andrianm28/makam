import type { Metadata } from "next";
import { PhoneCallIcon } from "lucide-react";
import { EmptyState } from "@/components/makam/empty-state";
import { PageHeader } from "@/components/makam/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRupiah } from "@/lib/rupiah";
import { formatTanggalJam } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { CatatPanggilanTagihanForm, NyatakanTidakTertagihForm } from "./forms";

export const metadata: Metadata = { title: "Tagihan lewat jatuh tempo · Area Staf" };

const HASIL_LABEL: Record<string, string> = {
  sudah_dihubungi: "Sudah dihubungi",
  tidak_diangkat: "Tidak diangkat",
  nomor_salah: "Nomor salah",
  janji_bayar: "Janji bayar",
  menolak: "Menolak",
};

/**
 * Chasing's overdue list (spec, Billing > Chasing; ticket 29's AC 2, 4): every
 * pay-after Tagihan Lewat Jatuh Tempo or already Tidak Tertagih, oldest
 * overdue first, with its call log. The Tier 3 "Tagihan lewat jatuh tempo"
 * Antrean row links here.
 */
export default async function TagihanLewatJatuhTempoPage() {
  await staffMenuActor("admin_platform");
  const { billing, notifications } = serverRuntime();
  const overdue = await billing.tagihanLewatJatuhTempo();
  const riwayat = await Promise.all(overdue.map((t) => notifications.teleponPemesanRiwayat("tagihan", t.id)));

  return (
    <>
      <PageHeader
        title="Tagihan lewat jatuh tempo"
        description="Tagihan pay-after (Saat Duka, pemakaman di Hak Pakai yang sudah ada) yang belum dibayar setelah jatuh tempo. Pengingat keluarga terjadwal otomatis H+3/7/14/30; daftar ini menelepon dari H+1."
      />

      {overdue.length === 0 ? (
        <EmptyState icon={PhoneCallIcon} title="Tidak ada Tagihan yang sedang dikejar" description="Setiap Tagihan pay-after masih dalam masa bayar atau sudah lunas." />
      ) : (
        <div className="flex flex-col gap-4">
          {overdue.map((t, i) => (
            <Card key={t.id}>
              <CardHeader>
                <CardTitle>
                  {t.nomorTagihan}
                  {t.placeName ? ` · ${t.placeName}` : ""}
                </CardTitle>
                <CardDescription>
                  {formatRupiah(t.total)} · Lewat jatuh tempo sejak {formatTanggalJam(t.lewatJatuhTempoAt)}
                  {t.nomorPemesanan ? ` · pesanan ${t.nomorPemesanan}` : ""} ·{" "}
                  {t.status === "tidak_tertagih" ? "Tidak Tertagih" : "Lewat Jatuh Tempo"}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <p className="text-caption font-medium text-foreground">Log panggilan</p>
                  {riwayat[i]!.length === 0 ? (
                    <p className="text-caption text-muted-foreground">Belum ada panggilan tercatat.</p>
                  ) : (
                    <ul className="flex flex-col gap-1 text-caption text-muted-foreground">
                      {riwayat[i]!.map((call) => (
                        <li key={call.id}>
                          {formatTanggalJam(call.dibukaPada)}
                          {call.ditutupPada
                            ? ` — ${HASIL_LABEL[call.hasil ?? ""] ?? call.hasil}${call.catatan ? `: ${call.catatan}` : ""}`
                            : " — belum ditelepon"}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex flex-wrap items-end gap-4">
                  {(() => {
                    const open = riwayat[i]!.find((call) => !call.ditutupPada);
                    return open ? <CatatPanggilanTagihanForm teleponId={open.id} /> : null;
                  })()}
                  {t.status === "lewat_jatuh_tempo" ? <NyatakanTidakTertagihForm tagihanId={t.id} /> : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
