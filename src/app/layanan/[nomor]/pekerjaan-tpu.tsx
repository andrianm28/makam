import type { ReactNode } from "react";
import type { PesananTpuTerbaca } from "@/domain/layanan";
import { pekerjaanTpuStatusLabels } from "@/lib/layanan-tpu-labels";
import { formatRupiah } from "@/lib/rupiah";
import { formatTanggal } from "@/lib/time/jakarta";

/**
 * The TPU jobs of one order as their Pemesan reads them (spec, story 96 and Layanan >
 * Mitra Jasa: "The Pemesan sees the first name and photo"): each Layanan with its
 * status, the ±2-day window it may be done in, and — once a Mitra Jasa has accepted it —
 * that person's first name and photo, and nothing else of them. Shared by the Layanan
 * order page and the Pengurusan order page, whose hari-H items are the same jobs.
 */
export function PekerjaanTpuDaftar({ order, renderThread }: { order: PesananTpuTerbaca; renderThread?: (pekerjaanId: string) => ReactNode }) {
  return (
    <ul className="flex flex-col gap-4">
      {order.item.map((satu) => (
        <li key={satu.id} className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-body font-semibold">{satu.label}</h3>
            <span className="text-body font-medium">{formatRupiah(satu.amount)}</span>
          </div>
          <p className="mt-1 text-small text-muted-foreground">
            {pekerjaanTpuStatusLabels[satu.status]} · target {formatTanggal(satu.targetDate)} (boleh dikerjakan {formatTanggal(satu.jendela.dari)} sampai{" "}
            {formatTanggal(satu.jendela.sampai)})
          </p>
          {satu.teks ? <p className="mt-1 text-body">Tulisan: &ldquo;{satu.teks}&rdquo;</p> : null}
          {satu.mitraJasa ? (
            <div className="mt-3 flex items-center gap-3" data-testid="mitra-jasa">
              {satu.mitraJasa.fotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL of a private file
                <img src={satu.mitraJasa.fotoUrl} alt={`Foto ${satu.mitraJasa.namaDepan}`} className="size-12 rounded-full border border-border object-cover" />
              ) : null}
              <p className="text-body">
                Dikerjakan oleh <span className="font-semibold">{satu.mitraJasa.namaDepan}</span>
              </p>
            </div>
          ) : (
            <p className="mt-3 text-small text-muted-foreground">Mitra Jasa akan ditugaskan sebelum tanggal target. Nama depan dan fotonya muncul di sini setelah ia menerima pekerjaan.</p>
          )}
          {renderThread ? <div className="mt-3">{renderThread(satu.id)}</div> : null}
        </li>
      ))}
    </ul>
  );
}
