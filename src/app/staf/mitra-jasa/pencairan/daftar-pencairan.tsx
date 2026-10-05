import Link from "next/link";
import { StatusBadge } from "@/components/makam/status-badge";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import type { PencairanMitraJasaEntri } from "@/domain/payouts";
import { documentPagePath } from "@/lib/document-links";
import { formatRupiah } from "@/lib/rupiah";
import { formatTanggal } from "@/lib/time/jakarta";

/**
 * A Mitra Jasa's Pencairan, in the order the Payouts read gave them (newest first): each with its status and its date,
 * the jobs it covers (Layanan, TPU, date, rate) and what it comes to. The read hands over nothing else, so nothing else
 * can be drawn: no Potongan (a Mitra Jasa is paid in full), no order, no family and no Hak Pakai.
 */
export function DaftarPencairan({ pencairan }: { pencairan: PencairanMitraJasaEntri[] }) {
  return (
    <ul className="flex flex-col gap-4">
      {pencairan.map((satu) => (
        <li key={satu.kunci}>
          <Card data-status={satu.status}>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <StatusBadge status={satu.status} />
                {tanggalPencairan(satu) ? <span className="text-body font-medium">{tanggalPencairan(satu)}</span> : null}
              </div>
              <CardDescription>{keterangan(satu)}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-body">
              <ul className="flex flex-col divide-y divide-border">
                {satu.pekerjaan.map((baris) => (
                  <li key={baris.itemId} className="flex items-start justify-between gap-4 py-2 first:pt-0 last:pb-0">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-medium">{baris.layanan}</span>
                      <span className="text-muted-foreground">{[baris.tpu, baris.tanggal ? formatTanggal(baris.tanggal) : null].filter(Boolean).join(" · ")}</span>
                    </div>
                    <span className={`whitespace-nowrap tabular-nums${satu.status === "dibatalkan" ? " text-muted-foreground line-through" : ""}`}>{formatRupiah(baris.tarif)}</span>
                  </li>
                ))}
              </ul>
              <p className="flex items-baseline justify-between gap-4 border-t border-border pt-3 font-semibold">
                <span>{satu.status === "dibatalkan" ? "Total dibayarkan" : "Total"}</span>
                <span className="tabular-nums">{formatRupiah(satu.total)}</span>
              </p>
              {satu.bukti ? (
                <p>
                  Bukti Pencairan{" "}
                  <Link href={documentPagePath(satu.bukti.link)} className="font-medium text-brand underline underline-offset-4">
                    {satu.bukti.nomorBukti}
                  </Link>
                </p>
              ) : null}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}

/** The one date a Pencairan has to say: when it was paid, is to be paid by, or was cancelled. Waiting and held ones have none to promise. */
function tanggalPencairan(satu: PencairanMitraJasaEntri): string | null {
  if (!satu.tanggal) return null;
  switch (satu.status) {
    case "dicairkan":
      return `Ditransfer ${formatTanggal(satu.tanggal)}`;
    case "jatuh_tempo":
      return `Dibayar paling lambat ${formatTanggal(satu.tanggal)}`;
    case "dibatalkan":
      return `Dibatalkan ${formatTanggal(satu.tanggal)}`;
    default:
      return null;
  }
}

/** What the status means for the person waiting to be paid. */
function keterangan(satu: PencairanMitraJasaEntri): string {
  switch (satu.status) {
    case "belum_jatuh_tempo":
      return "Menunggu jendela Keluhan atas pekerjaan ini selesai.";
    case "jatuh_tempo":
      return "Pencairan ini sudah jatuh tempo. Admin Platform akan mentransfernya ke rekening Anda.";
    case "ditahan":
      return "Admin Platform menahan Pencairan ini untuk sementara. Hubungi Admin Platform bila Anda perlu keterangan.";
    case "dicairkan":
      return satu.pekerjaan.length > 1 ? `Satu transfer untuk ${satu.pekerjaan.length} pekerjaan.` : "Sudah ditransfer ke rekening Anda.";
    case "dibatalkan":
      return "Pencairan ini dibatalkan dan tidak dibayarkan.";
  }
}
