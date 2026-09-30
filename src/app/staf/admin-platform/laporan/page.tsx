import type { Metadata } from "next";
import { FormSection } from "@/components/makam/form-section";
import { PageHeader } from "@/components/makam/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { barisLaporan, bulanLaporanSchema } from "@/domain/queues";
import { formatRupiah } from "@/lib/rupiah";
import { wibDateOf } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";

export const metadata: Metadata = { title: "Laporan · Area Staf" };

/**
 * The monthly Laporan (spec, Work Queues > Laporan; story 165; ticket 33):
 * orders, Rp collected, platform fees, Pencairan, refunds and Tidak Tertagih,
 * cut at the Asia/Jakarta month, for Admin Platform alone. The page and its CSV
 * are the same rows of the same read, so they cannot disagree.
 */
export default async function LaporanPage({ searchParams }: PageProps<"/staf/admin-platform/laporan">) {
  const actor = await staffMenuActor("admin_platform");
  const runtime = serverRuntime();
  const mentah = (await searchParams).bulan;
  const diminta = bulanLaporanSchema.safeParse(Array.isArray(mentah) ? mentah[0] : mentah);
  const bulan = diminta.success ? diminta.data : wibDateOf(runtime.adapters.clock.now()).slice(0, 7);
  const bulanTidakValid = mentah !== undefined && !diminta.success;
  const hasil = await runtime.queues.laporanBulanan(actor, bulan);
  const baris = hasil.ok ? barisLaporan(hasil.laporan) : [];
  const bagian = [...new Set(baris.map((satu) => satu.bagian))];

  return (
    <>
      <PageHeader
        title="Laporan bulanan"
        description="Pesanan, Rp diterima, pendapatan Operator, Pencairan, pengembalian dana dan Tidak Tertagih dalam satu bulan, dihitung menurut hari dan jam WIB."
        actions={
          hasil.ok ? (
            <a href={`/staf/admin-platform/laporan/csv?bulan=${bulan}`} className={buttonVariants({ variant: "outline" })}>
              Unduh CSV
            </a>
          ) : null
        }
      />

      {bulanTidakValid ? (
        <p role="alert" className="text-body text-destructive">
          Bulan yang diminta tidak valid, jadi yang ditampilkan adalah bulan ini.
        </p>
      ) : null}

      <FormSection title="Bulan">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-2">
            <label htmlFor="bulan" className="text-body font-medium">
              Bulan
            </label>
            <Input id="bulan" name="bulan" type="month" defaultValue={bulan} required />
          </div>
          <Button type="submit">Tampilkan</Button>
        </form>
      </FormSection>

      {hasil.ok ? (
        bagian.map((nama) => (
          <FormSection key={nama} title={nama}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Keterangan</TableHead>
                  <TableHead className="text-right">Jumlah</TableHead>
                  <TableHead className="text-right">Rp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {baris
                  .filter((satu) => satu.bagian === nama)
                  .map((satu) => (
                    <TableRow key={`${satu.bagian}:${satu.keterangan}`}>
                      <TableCell>{satu.keterangan}</TableCell>
                      <TableCell className="text-right">{satu.jumlah === null ? "" : satu.jumlah}</TableCell>
                      <TableCell className="text-right">{satu.amount === null ? "" : formatRupiah(satu.amount)}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </FormSection>
        ))
      ) : (
        <p role="alert" className="text-body text-destructive">
          Bulan tidak bisa dibuka. Pilih bulan yang valid.
        </p>
      )}
    </>
  );
}
