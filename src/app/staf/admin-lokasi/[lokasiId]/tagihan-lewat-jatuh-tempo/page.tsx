import type { Metadata } from "next";
import { PhoneCallIcon } from "lucide-react";
import { EmptyState } from "@/components/makam/empty-state";
import { PageHeader } from "@/components/makam/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRupiah } from "@/lib/rupiah";
import { formatTanggalJam } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { adminLokasiScope } from "../../scope";
import { CatatPanggilanForm } from "../antrean/catat-panggilan-form";
import { AkhiriHakPakaiForm, CatatanTagihanLokasiForm } from "./forms";

export const metadata: Metadata = { title: "Tagihan lewat jatuh tempo · Area Staf" };

const HASIL_LABEL: Record<string, string> = {
  sudah_dihubungi: "Sudah dihubungi",
  tidak_diangkat: "Tidak diangkat",
  nomor_salah: "Nomor salah",
  janji_bayar: "Janji bayar",
  menolak: "Menolak",
};

/**
 * A read-only list of this Lokasi Mitra's own overdue Tagihan with the call
 * log, plus notes (spec, story 133; ticket 29's AC 3): the Admin Lokasi
 * follows Chasing here, but only Admin Platform declares Tidak Tertagih.
 * Once it is, the Admin Lokasi may end the Hak Pakai (AC 7).
 */
export default async function TagihanLewatJatuhTempoLokasiPage({
  params,
}: PageProps<"/staf/admin-lokasi/[lokasiId]/tagihan-lewat-jatuh-tempo">) {
  const { lokasiId } = await params;
  const { current } = await adminLokasiScope(lokasiId);
  const { billing, notifications, pemesanan } = serverRuntime();
  const semua = await billing.tagihanLewatJatuhTempo();
  const milik = semua.filter((t) => t.lokasiId === current.id);
  const riwayat = await Promise.all(milik.map((t) => notifications.teleponPemesanRiwayat("tagihan", t.id)));
  const catatan = await Promise.all(milik.map((t) => notifications.catatanTagihan(t.id)));
  const hakPakaiIds = await Promise.all(milik.map((t) => pemesanan.hakPakaiIdForTagihan(t.id)));

  return (
    <>
      <PageHeader
        title="Tagihan lewat jatuh tempo"
        description={`Tagihan pay-after ${current.name} yang belum dibayar setelah jatuh tempo, hanya untuk dibaca; Admin Platform yang menyatakan Tidak Tertagih. Anda bisa menambah catatan di log panggilan.`}
      />

      {milik.length === 0 ? (
        <EmptyState icon={PhoneCallIcon} title="Tidak ada Tagihan yang sedang dikejar" description="Setiap Tagihan pay-after Lokasi Mitra ini masih dalam masa bayar atau sudah lunas." />
      ) : (
        <div className="flex flex-col gap-4">
          {milik.map((t, i) => (
            <Card key={t.id}>
              <CardHeader>
                <CardTitle>{t.nomorTagihan}</CardTitle>
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
                  {catatan[i]!.length > 0 ? (
                    <ul className="flex flex-col gap-1 text-caption text-muted-foreground">
                      {catatan[i]!.map((note) => (
                        <li key={note.id}>
                          {formatTanggalJam(note.dibuatPada)} — Catatan: {note.catatan}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-end gap-4">
                  <CatatanTagihanLokasiForm lokasiId={current.id} tagihanId={t.id} />
                  {(() => {
                    const open = riwayat[i]!.find((call) => !call.ditutupPada);
                    return open ? <CatatPanggilanForm lokasiId={current.id} teleponId={open.id} /> : null;
                  })()}
                  {t.status === "tidak_tertagih" && hakPakaiIds[i] ? (
                    <AkhiriHakPakaiForm lokasiId={current.id} hakPakaiId={hakPakaiIds[i]!} />
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
