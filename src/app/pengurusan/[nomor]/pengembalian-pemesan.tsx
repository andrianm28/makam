import { RekeningPengembalianForm } from "@/app/(site)/pesanan/[nomor]/rekening-pengembalian-form";
import type { PermintaanPengembalian } from "@/domain/refunds";
import { formatRupiah } from "@/lib/rupiah";
import { isiRekeningPengembalianPengurusanAction } from "./pengajuan-actions";

/**
 * The refund a Pengurusan order that has ended is waiting to send (a paid order the Pemesan cancelled, or one the PTSP refused for
 * good: `STATUS_BERAKHIR_DENGAN_PENGEMBALIAN`), as its Pemesan reads it on the order's page: the form for the bank account while Admin
 * Platform has not approved the request, and afterwards a note that the account can no longer be changed here. Nothing when the order
 * owes no refund.
 */
export function PengembalianPemesan({ nomor, pengembalian }: { nomor: string; pengembalian: PermintaanPengembalian | null }) {
  if (!pengembalian) return null;
  return pengembalian.status === "diajukan" ? (
    <RekeningPengembalianForm
      nomor={nomor}
      jumlahLabel={formatRupiah(pengembalian.jumlah)}
      rekeningTercatat={pengembalian.rekening ? `${pengembalian.rekening.bank} ****${pengembalian.rekening.nomor.slice(-4)}` : null}
      simpan={isiRekeningPengembalianPengurusanAction}
    />
  ) : (
    <p className="rounded-xl bg-info-soft px-4 py-3 text-body text-info-soft-foreground" data-testid="rekening-pengembalian-terkunci">
      Pengembalian dana {formatRupiah(pengembalian.jumlah)} sudah disetujui dan menunggu transfer. Untuk mengubah rekening, hubungi CS.
    </p>
  );
}
