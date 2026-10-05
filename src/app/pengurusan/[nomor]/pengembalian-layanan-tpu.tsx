import type { PesananTpuTerbaca } from "@/domain/layanan";
import type { PengembalianPesanan } from "@/domain/refunds";
import { documentPagePath } from "@/lib/document-links";
import { pengembalianPesananLabels } from "@/lib/layanan-tpu-labels";
import { formatRupiah } from "@/lib/rupiah";

/**
 * Where the refund of a cancelled hari-H Layanan stands (ticket 120): under the job list, once any of its jobs is Dibatalkan, one
 * line per refund on the order with its amount and state, and the Bukti Pengembalian Dana to open once the money is sent. A refund
 * of the order carries the cancelled Layanan with its other lines, so the state is the order's, never claimed per job. Nothing when no
 * job was cancelled or nothing was refunded (an order nobody had paid has no refund to follow).
 */
export function PengembalianLayananTpu({ order, pengembalian }: { order: PesananTpuTerbaca; pengembalian: readonly PengembalianPesanan[] }) {
  if (pengembalian.length === 0 || !order.item.some((satu) => satu.status === "dibatalkan")) return null;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4" data-testid="pengembalian-layanan-tpu">
      <h3 className="text-body font-semibold">Pengembalian dana</h3>
      <p className="text-small text-muted-foreground">Layanan yang dibatalkan dikembalikan lewat pengembalian dana berikut.</p>
      <ul className="flex flex-col gap-1">
        {pengembalian.map((satu) => (
          <li key={satu.id} className="text-body">
            <span className="font-medium text-foreground">
              {formatRupiah(satu.jumlah)} · {pengembalianPesananLabels[satu.status]}
            </span>
            {satu.bukti ? (
              <>
                {". "}
                <a href={documentPagePath(satu.bukti.link)} className="font-medium text-brand underline underline-offset-4">
                  Bukti Pengembalian Dana {satu.bukti.nomor}
                </a>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
