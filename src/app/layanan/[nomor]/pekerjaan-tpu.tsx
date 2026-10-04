import type { ReactNode } from "react";
import type { PesananTpuTerbaca } from "@/domain/layanan";
import { keluhanStatusLabels, labelBuktiPekerjaan } from "@/lib/layanan-labels";
import { keluhanTpuPenjelasan, pekerjaanTpuStatusLabels } from "@/lib/layanan-tpu-labels";
import { formatRupiah } from "@/lib/rupiah";
import { formatTanggal, formatTanggalJam } from "@/lib/time/jakarta";
import { BatalkanPekerjaanTerlambatTpu } from "./batalkan-terlambat-tpu";
import { AjukanKeluhanTpu } from "./keluhan";

/**
 * The TPU jobs of one order as their Pemesan reads them (spec, story 96 and Layanan >
 * Mitra Jasa: "The Pemesan sees the first name and photo"): each Layanan with its
 * status, the ±2-day window it may be done in, and — once a Mitra Jasa has accepted it —
 * that person's first name and photo, and nothing else of them. Shared by the Layanan
 * order page and the Pengurusan order page, whose hari-H items are the same jobs.
 */
export function PekerjaanTpuDaftar({ order, renderThread }: { order: PesananTpuTerbaca; renderThread?: (pekerjaanId: string) => ReactNode }) {
  const nomor = order.nomor;
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
          ) : satu.status === "dibatalkan" ? (
            <p className="mt-3 text-small text-muted-foreground">Pekerjaan ini dibatalkan dan tidak akan dikerjakan.</p>
          ) : (
            <p className="mt-3 text-small text-muted-foreground">Mitra Jasa akan ditugaskan sebelum tanggal target. Nama depan dan fotonya muncul di sini setelah ia menerima pekerjaan.</p>
          )}
          {satu.bukti.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2" data-testid="bukti-tpu">
              {satu.bukti.map((bukti) => (
                <li key={`${bukti.kind}-${bukti.takenAt.toISOString()}`}>
                  {bukti.url ? (
                    <a href={bukti.url} target="_blank" rel="noopener" className="text-body font-medium text-brand underline underline-offset-4">
                      {labelBuktiPekerjaan(bukti.kind)}
                    </a>
                  ) : (
                    <span className="text-body text-muted-foreground">{labelBuktiPekerjaan(bukti.kind)} (belum bisa dibuka)</span>
                  )}
                  <span className="ml-1 text-small text-muted-foreground">{formatTanggalJam(bukti.takenAt)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {satu.keluhan.diajukan ? (
            <div className="mt-3 flex flex-col gap-1 rounded-lg bg-warning-soft p-3" data-testid="keluhan-tpu">
              <p className="text-body font-semibold">Keluhan: {keluhanStatusLabels[satu.keluhan.diajukan.status]}</p>
              <p className="text-small text-muted-foreground">
                Diajukan {formatTanggalJam(satu.keluhan.diajukan.diajukanAt)}: &ldquo;{satu.keluhan.diajukan.alasan}&rdquo;
              </p>
              <p className="text-small text-muted-foreground">{keluhanTpuPenjelasan[satu.keluhan.diajukan.status]}</p>
            </div>
          ) : null}
          {satu.keluhan.bolehDiajukan && satu.keluhan.berakhirAt ? (
            <AjukanKeluhanTpu pekerjaanId={satu.id} nomor={nomor} berakhirPada={formatTanggalJam(satu.keluhan.berakhirAt)} />
          ) : null}
          {satu.status === "terlambat" ? <BatalkanPekerjaanTerlambatTpu pekerjaanId={satu.id} nomor={nomor} /> : null}
          {renderThread ? <div className="mt-3">{renderThread(satu.id)}</div> : null}
        </li>
      ))}
    </ul>
  );
}
