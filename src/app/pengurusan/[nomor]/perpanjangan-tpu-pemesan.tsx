import { tanggalBerakhir } from "@/lib/perpanjangan-tanggal";
import type { PengurusanOrder } from "@/domain/pengurusan";
import type { PermintaanPengembalian } from "@/domain/refunds";
import { StatusBadge, type StatusKey } from "@/components/makam/status-badge";
import { formatRupiah } from "@/lib/rupiah";
import { formatTanggalJam } from "@/lib/time/jakarta";
import { PengajuanPemesan } from "./pengajuan-pemesan";
import { PengembalianPemesan } from "./pengembalian-pemesan";

/**
 * A Perpanjangan TPU, as its Pemegang Hak follows it (spec, Pengurusan > Perpanjangan TPU; stories 80-83; ticket 48):
 * the order, what is being waited for, the pay-first Tagihan once the documents pass, and the shared filing steps
 * (documents to upload, Perlu Perbaikan, the scan at IPTM Terbit, cancelling) of `PengajuanPemesan`.
 */
export function PerpanjanganTpuPemesan({
  order,
  scanUrl,
  pengembalian,
}: {
  order: PengurusanOrder;
  scanUrl: string | null;
  /** The refund waiting for the Pemesan's rekening once the PTSP has refused a paid renewal for good; null when none. */
  pengembalian: PermintaanPengembalian | null;
}) {
  const menungguTpu = order.status === "diajukan" && order.perpanjangan?.lewatMasaTenggang && !order.perpanjangan.cekTpuSelesaiPada;
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-title-1 text-foreground">Perpanjangan IPTM</h1>
        <p className="text-body-lg text-muted-foreground">
          Nomor Pemesanan{" "}
          <span className="font-mono font-semibold text-foreground" data-testid="nomor-pemesanan">
            {order.nomor}
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={order.status as StatusKey} />
          <span className="text-small text-muted-foreground">Diajukan {formatTanggalJam(order.diajukanAt)}</span>
        </div>
      </header>

      {menungguTpu ? (
        <p className="rounded-xl bg-info-soft px-4 py-3 text-body text-info-soft-foreground" data-testid="menunggu-cek-tpu">
          IPTM ini sudah melewati masa tenggang. Kami bertanya dulu ke TPU, tanpa biaya. Tagihan baru terbit bila TPU bersedia memperpanjang dan dokumen Anda kami periksa; bila TPU
          tidak memperpanjang, permohonan ditutup tanpa biaya.
        </p>
      ) : null}

      {order.tagihan && order.status === "menunggu_pembayaran" ? (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-body" data-testid="tagihan-perpanjangan">
          Tagihan {order.tagihan.nomor} sebesar {formatRupiah(order.tagihan.total)} jatuh tempo {formatTanggalJam(order.tagihan.dueAt)}.{" "}
          <a href={`/dokumen/${order.tagihan.link}`} className="font-medium text-brand underline underline-offset-4">
            Buka Tagihan
          </a>
        </p>
      ) : null}

      <p className="text-body text-muted-foreground" data-testid="lama-terbit">
        IPTM baru biasanya terbit dalam 5 hari kerja setelah pembayaran.
      </p>

      <PengajuanPemesan order={order} scanUrl={scanUrl} />

      <PengembalianPemesan nomor={order.nomor} pengembalian={pengembalian} />

      <section className="flex flex-col gap-3">
        <h2 className="text-title-3 text-foreground">Yang dipesan</h2>
        <dl className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5 text-body">
          <Baris label="TPU" value={order.tpu.name} />
          {order.makamBlokNomor ? <Baris label="Makam" value={order.makamBlokNomor} /> : null}
          {order.perpanjangan ? <Baris label="IPTM berakhir" value={tanggalBerakhir(order.perpanjangan)} /> : null}
          <Baris label="Pemegang Hak" value={order.pemegangHak.name} />
          <Baris label="Pemesan" value={`${order.pemesan.name}${order.pemesan.email ? ` · ${order.pemesan.email}` : ""}`} />
          {order.alasan ? <Baris label="Alasan" value={order.alasan} /> : null}
        </dl>
      </section>
    </main>
  );
}

function Baris({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}
