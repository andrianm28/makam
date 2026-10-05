import { StatusBadge } from "@/components/makam/status-badge";
import type { PengurusanOrder } from "@/domain/pengurusan";
import type { PermintaanPengembalian } from "@/domain/refunds";
import { formatRupiah } from "@/lib/rupiah";
import { formatTanggal, formatTanggalJam } from "@/lib/time/jakarta";
import { PengajuanPemesan } from "./pengajuan-pemesan";
import { PengembalianPemesan } from "./pengembalian-pemesan";

/**
 * A Pengurusan IPTM, the filing-only order of a family that buried at a DKI TPU on its own, as its Pemesan follows it
 * (spec, Pengurusan > Pengurusan IPTM; stories 78 and 82; tickets 47 and 116): the order, the pay-first Tagihan once the
 * documents pass, and the shared filing steps (documents to upload, Perlu Perbaikan, the scan at IPTM Terbit, cancelling)
 * of `PengajuanPemesan`.
 *
 * It is not a Saat Duka TPU order with the burial left out. The Operator arranged no burial, so nothing here speaks of
 * one: no burial time, no confirmation deadline, no TPU window, no documents to carry on the day. The order starts at
 * Dimakamkan, and nothing is billed until Admin Platform has checked the documents.
 */
export function PengurusanIptmPemesan({
  order,
  scanUrl,
  pengembalian,
}: {
  order: PengurusanOrder;
  scanUrl: string | null;
  /** The refund waiting for the Pemesan's rekening on an order that had been paid and ended (cancelled, or refused for good by the PTSP); null when none. */
  pengembalian: PermintaanPengembalian | null;
}) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-title-1 text-foreground">Pengurusan IPTM</h1>
        <p className="text-body-lg text-muted-foreground">
          Nomor Pemesanan{" "}
          <span className="font-mono font-semibold text-foreground" data-testid="nomor-pemesanan">
            {order.nomor}
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={order.status} />
          <span className="text-small text-muted-foreground">Diajukan {formatTanggalJam(order.diajukanAt)}</span>
        </div>
      </header>

      {order.tagihan && order.status === "menunggu_pembayaran" ? (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-body" data-testid="tagihan-pengurusan-iptm">
          Tagihan {order.tagihan.nomor} sebesar {formatRupiah(order.tagihan.total)} jatuh tempo {formatTanggalJam(order.tagihan.dueAt)}.{" "}
          <a href={`/dokumen/${order.tagihan.link}`} className="font-medium text-brand underline underline-offset-4">
            Buka Tagihan
          </a>
        </p>
      ) : null}

      <PengajuanPemesan order={order} scanUrl={scanUrl} />

      <PengembalianPemesan nomor={order.nomor} pengembalian={pengembalian} />

      <section className="flex flex-col gap-3">
        <h2 className="text-title-3 text-foreground">Dokumen</h2>
        <p className="text-small text-muted-foreground">Yang Anda unggah ke kami, untuk kami ajukan IPTM-nya.</p>
        <ul className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4">
          {order.dokumen.pengajuan.map((satu) => (
            <li key={satu.nama} className="text-small text-muted-foreground">
              <span className="font-medium text-foreground">{satu.nama}</span>
              {satu.catatan ? ` — ${satu.catatan}` : ""}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-title-3 text-foreground">Yang dipesan</h2>
        <dl className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5 text-body">
          <Baris label="TPU" value={order.tpu.name} href={`/tpu/${order.tpu.id}`} />
          <Baris label="Alamat TPU" value={order.tpu.address} />
          {order.jenisPenguburan ? (
            <Baris
              label="Jenis pemakaman"
              value={order.jenisPenguburan === "tumpang" ? "Tumpang, di makam yang sudah ada isinya" : "Makam baru"}
            />
          ) : null}
          {order.kuburan ? <Baris label="Makam yang ditumpang" value={`${order.kuburan.blokNomor} · ${order.kuburan.nama}`} /> : null}
          {order.almarhum ? <Baris label="Almarhum" value={`${order.almarhum.name}, wafat ${formatTanggal(order.almarhum.tanggalWafat)}`} /> : null}
          <Baris
            label="Pemegang Hak"
            value={
              order.pemegangHak.mode === "pemesan"
                ? `${order.pemegangHak.name} (Pemesan)`
                : `${order.pemegangHak.name}${order.pemegangHak.phoneNumber ? ` · ${order.pemegangHak.phoneNumber}` : ""}`
            }
          />
          <Baris label="Pemesan" value={`${order.pemesan.name}${order.pemesan.email ? ` · ${order.pemesan.email}` : ""}`} />
          {order.pemesan.phoneNumber ? <Baris label="Telepon Pemesan" value={order.pemesan.phoneNumber} /> : null}
          {order.alasan ? <Baris label="Alasan" value={order.alasan} /> : null}
        </dl>
      </section>
    </main>
  );
}

function Baris({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{href ? <a href={href} className="underline underline-offset-4">{value}</a> : value}</dd>
    </div>
  );
}
