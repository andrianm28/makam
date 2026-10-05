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
          <KartuPencairan satu={satu} />
        </li>
      ))}
    </ul>
  );
}

function KartuPencairan({ satu }: { satu: PencairanMitraJasaEntri }) {
  const tanggal = tanggalPencairan(satu);
  return (
    <Card data-status={satu.status}>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatusBadge status={satu.status} />
          {tanggal ? <span className="text-body font-medium">{tanggal}</span> : null}
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
  );
}

/**
 * The one date a Pencairan has to say, in words that tell what the date is: the earliest it can fall due (when the masa
 * keluhan of its job ends), by when it is to be paid, the day it fell due while Admin Platform holds it (a held one has no
 * date to be paid by, so it promises none), when it was paid, or when it was cancelled. None when the read has none.
 */
function tanggalPencairan(satu: PencairanMitraJasaEntri): string | null {
  if (!satu.tanggal) return null;
  const tanggal = formatTanggal(satu.tanggal);
  switch (satu.status) {
    case "belum_jatuh_tempo":
      return `Jatuh tempo paling cepat ${tanggal}`;
    case "jatuh_tempo":
      return `Dibayar paling lambat ${tanggal}`;
    case "ditahan":
      return `Jatuh tempo sejak ${tanggal}`;
    case "dicairkan":
      return `Ditransfer ${tanggal}`;
    case "dibatalkan":
      return `Dibatalkan ${tanggal}`;
  }
}

/** What the status means for the person waiting to be paid. */
function keterangan(satu: PencairanMitraJasaEntri): string {
  switch (satu.status) {
    case "belum_jatuh_tempo":
      return "Menunggu masa keluhan atas pekerjaan ini berakhir.";
    case "jatuh_tempo":
      return "Pencairan ini sudah jatuh tempo. Admin Platform akan mentransfernya ke rekening Anda.";
    case "ditahan":
      return "Admin Platform menahan Pencairan ini untuk sementara.";
    case "dicairkan":
      return satu.pekerjaan.length > 1 ? `Satu transfer untuk ${satu.pekerjaan.length} pekerjaan.` : "Sudah ditransfer ke rekening Anda.";
    case "dibatalkan":
      return "Pencairan ini dibatalkan dan tidak dibayarkan.";
  }
}
