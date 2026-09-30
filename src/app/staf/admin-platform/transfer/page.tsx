import type { Metadata } from "next";
import Link from "next/link";
import { FormSection } from "@/components/makam/form-section";
import { PageHeader } from "@/components/makam/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { tanggalMingguSchema } from "@/domain/queues";
import { formatRupiah } from "@/lib/rupiah";
import { addWibDateDays, formatTanggal, wibDateOf } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";

export const metadata: Metadata = { title: "Transfer keluar · Area Staf" };

const JENIS = { pencairan: "Pencairan", pengembalian: "Pengembalian dana" } as const;

/**
 * The weekly list of every outgoing transfer, Pencairan and refunds, Monday to
 * Sunday in WIB, with the Bukti number, who approved it and a link to its proof
 * (spec, Work Queues > Laporan; story 165; ticket 33). Admin Platform alone: it
 * is what lets the books be reviewed without a second approver.
 */
export default async function TransferKeluarPage({ searchParams }: PageProps<"/staf/admin-platform/transfer">) {
  const actor = await staffMenuActor("admin_platform");
  const runtime = serverRuntime();
  const mentah = (await searchParams).tanggal;
  const diminta = tanggalMingguSchema.safeParse(Array.isArray(mentah) ? mentah[0] : mentah);
  const tanggal = diminta.success ? diminta.data : wibDateOf(runtime.adapters.clock.now());
  const tanggalTidakValid = mentah !== undefined && !diminta.success;
  const hasil = await runtime.queues.daftarTransferMingguan(actor, tanggal);

  return (
    <>
      <PageHeader
        title="Transfer keluar mingguan"
        description="Setiap transfer yang keluar dari rekening Operator dalam satu minggu (Senin sampai Minggu, WIB): Pencairan dan pengembalian dana, dengan nomor Bukti, penyetuju dan tautan bukti transfernya."
      />

      {tanggalTidakValid ? (
        <p role="alert" className="text-body text-destructive">
          Tanggal yang diminta tidak valid, jadi yang ditampilkan adalah minggu ini.
        </p>
      ) : null}

      <FormSection title="Minggu">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-2">
            <label htmlFor="tanggal" className="text-body font-medium">
              Tanggal di dalam minggu itu
            </label>
            <Input id="tanggal" name="tanggal" type="date" defaultValue={tanggal} required />
          </div>
          <Button type="submit">Tampilkan</Button>
        </form>
      </FormSection>

      {hasil.ok ? (
        <FormSection
          title={`${formatTanggal(hasil.daftar.dari)} sampai ${formatTanggal(addWibDateDays(hasil.daftar.sampai, -1))}`}
          description={`Total ${formatRupiah(hasil.daftar.total.semua)}: Pencairan ${formatRupiah(hasil.daftar.total.pencairan)}, pengembalian dana ${formatRupiah(hasil.daftar.total.pengembalian)}.`}
        >
          {hasil.daftar.transfer.length === 0 ? (
            <p className="text-body text-muted-foreground">Tidak ada transfer keluar pada minggu ini.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Penerima</TableHead>
                  <TableHead className="text-right">Jumlah</TableHead>
                  <TableHead>Nomor Bukti</TableHead>
                  <TableHead>Penyetuju</TableHead>
                  <TableHead>Bukti transfer</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hasil.daftar.transfer.map((baris) => (
                  <TableRow key={baris.nomorBukti}>
                    <TableCell>{formatTanggal(baris.tanggal)}</TableCell>
                    <TableCell>{JENIS[baris.jenis]}</TableCell>
                    <TableCell>{baris.penerima}</TableCell>
                    <TableCell className="text-right">{formatRupiah(baris.amount)}</TableCell>
                    <TableCell>
                      <Link href={baris.hrefBukti} className="font-mono text-brand underline underline-offset-4">
                        {baris.nomorBukti}
                      </Link>
                    </TableCell>
                    <TableCell>{baris.disetujuiOleh ?? "Tidak tercatat"}</TableCell>
                    <TableCell>
                      {baris.buktiTransferUrl ? (
                        <a href={baris.buktiTransferUrl} target="_blank" rel="noreferrer noopener" className="text-brand underline underline-offset-4">
                          Buka bukti
                        </a>
                      ) : (
                        "Tidak tersedia"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </FormSection>
      ) : (
        <p role="alert" className="text-body text-destructive">
          Tanggal tidak bisa dibuka. Pilih tanggal yang valid.
        </p>
      )}
    </>
  );
}
