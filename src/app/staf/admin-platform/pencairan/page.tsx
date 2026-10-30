import type { Metadata } from "next";
import { PageHeader } from "@/components/makam/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BarisPencairan } from "@/domain/payouts";
import { formatRupiah } from "@/lib/rupiah";
import { formatTanggalJam, wibDateOf } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { LepaskanItemForm, TahanItemForm, TerbitkanBuktiForm } from "./pencairan-forms";

export const metadata: Metadata = { title: "Pencairan · Area Staf" };

const JENIS_PENERIMA = { lokasi_mitra: "Lokasi Mitra", mitra_jasa: "Mitra Jasa" } as const;

/**
 * The Pencairan run (spec, Billing > Payouts: "one row per recipient with due
 * items minus Potongan. Items can be held out with a reason. Admin Platform
 * transfers manually, uploads proof, enters date; system issues Bukti
 * Pencairan"; story 162; ticket 32's AC 5). The page the Antrean's Tier 3
 * "Pencairan jatuh tempo" row links to, and like the refunds page it has no
 * menu slot of its own (`docs/design-system.md`).
 *
 * Every number on it is the Payouts module's own: the run is a read, and the
 * transfer form sends back exactly the row's items and Potongan, so what the
 * Bukti records is what this page told Admin Platform to send.
 */
export default async function PencairanPage() {
  const actor = await staffMenuActor("admin_platform");
  const runtime = serverRuntime();
  const baris = await runtime.payouts.jalankanPencairan(actor);
  const hariIni = wibDateOf(runtime.adapters.clock.now());

  return (
    <>
      <PageHeader
        title="Pencairan"
        description="Satu baris per penerima: item yang jatuh tempo dikurangi Potongan. Transfer manual ke rekening penerima, lalu unggah bukti dan tanggalnya agar Bukti Pencairan terbit dan terkirim."
      />

      {baris.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Tidak ada Pencairan yang menunggu</CardTitle>
          </CardHeader>
        </Card>
      ) : (
        baris.map((row) => <BarisPenerima key={kunci(row)} row={row} hariIni={hariIni} />)
      )}
    </>
  );
}

function kunci(row: BarisPencairan): string {
  return row.recipient.kind === "lokasi_mitra" ? `lokasi_mitra:${row.recipient.lokasiId}` : `mitra_jasa:${row.recipient.akunId}`;
}

function BarisPenerima({ row, hariIni }: { row: BarisPencairan; hariIni: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {JENIS_PENERIMA[row.recipient.kind]} {row.recipient.nama} · {row.neto === null ? "tidak ada yang ditransfer" : formatRupiah(row.neto)}
        </CardTitle>
        <CardDescription>
          Tenggat {formatTanggalJam(row.jatuhTempoAt)}
          {" · "}
          {row.rekening
            ? `Rekening ${row.rekening.bankName} ${row.rekening.accountNumber} a.n. ${row.rekening.accountHolder}`
            : row.recipient.kind === "lokasi_mitra"
              ? "Rekening Lokasi Mitra belum tercatat"
              : "Rekening Mitra Jasa tidak tercatat di sistem: pakai data dari Mitra Jasa"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {row.items.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Pesanan</TableHead>
                <TableHead className="text-right">Jumlah</TableHead>
                <TableHead>Tahan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {row.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    {item.label}
                    {item.catatanPenyesuaian ? <span className="block text-xs text-muted-foreground">Disesuaikan: {item.catatanPenyesuaian}</span> : null}
                  </TableCell>
                  <TableCell>{item.nomorPemesanan ?? "–"}</TableCell>
                  <TableCell className="text-right">{formatRupiah(item.amount)}</TableCell>
                  <TableCell>
                    <TahanItemForm itemId={item.id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}

        {row.potongan.length > 0 ? (
          <div className="flex flex-col gap-1 text-sm">
            <p className="font-medium">Potongan</p>
            {row.potongan.map((entry) => (
              <p key={entry.id}>
                − {formatRupiah(entry.dipotong)} · {entry.alasan}
                {entry.dipotong < entry.amount ? ` (dari ${formatRupiah(entry.amount)}; sisanya terbawa ke Pencairan berikutnya)` : ""}
              </p>
            ))}
          </div>
        ) : null}

        <dl className="grid grid-cols-2 gap-1 text-sm sm:max-w-sm">
          <dt>Item jatuh tempo</dt>
          <dd className="text-right">{formatRupiah(row.jumlahItem)}</dd>
          <dt>Potongan</dt>
          <dd className="text-right">− {formatRupiah(row.potonganDipotong)}</dd>
          <dt className="font-medium">Ditransfer</dt>
          <dd className="text-right font-medium">{row.neto === null ? "–" : formatRupiah(row.neto)}</dd>
        </dl>

        {row.ditahan.length > 0 ? (
          <div className="flex flex-col gap-2 text-sm">
            <p className="font-medium">Ditahan</p>
            {row.ditahan.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center gap-2">
                <span>
                  {item.label} · {formatRupiah(item.amount)} · alasan: {item.alasan}
                </span>
                <LepaskanItemForm itemId={item.id} />
              </div>
            ))}
          </div>
        ) : null}

        {row.itemsBelumJatuhTempo.length > 0 ? (
          <p className="text-sm text-muted-foreground">{row.itemsBelumJatuhTempo.length} item lain belum jatuh tempo.</p>
        ) : null}

        {row.neto === null ? (
          <p className="text-sm text-muted-foreground">
            Tidak ada transfer untuk penerima ini sekarang: tidak ada item jatuh tempo, atau Potongan menghabiskan seluruh item. Potongan yang tidak
            terpotong diselesaikan di luar Pencairan.
          </p>
        ) : (
          <TerbitkanBuktiForm itemIds={row.items.map((item) => item.id)} potonganIds={row.potongan.map((entry) => entry.id)} hariIni={hariIni} />
        )}
      </CardContent>
    </Card>
  );
}
