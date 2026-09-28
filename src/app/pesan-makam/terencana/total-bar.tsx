"use client";

import { ChevronUp } from "lucide-react";
import { useState } from "react";
import { formatRupiah } from "@/lib/rupiah";
import { cn } from "@/lib/utils";
import type { DenahView } from "./tampilan";

/**
 * The sticky total bar shown at the bottom of both "Pilih petak" and "Data &
 * kirim" (spec, Booking wizards; the public prototype's `TotalBarTerencana`):
 * a collapsed line with the current total that expands into its lines and the
 * "Nanti, setiap pemakaman" note. On "Pilih petak" it also carries the
 * "Lanjut" button as `action`; on "Data & kirim" it has none, so a family can
 * always see what this will cost while filling in the form below it.
 */
export function TotalBarTerencana({
  denah,
  ringkasanText,
  ada,
  pesanBatas = null,
  action,
}: {
  denah: DenahView;
  /** "2 Petak · Blok A: A-09, A-10", or "Belum ada petak dipilih". */
  ringkasanText: string;
  /** Whether anything is chosen yet: false shows "Pilih petak di denah" instead of a total. */
  ada: boolean;
  /** What the read said about a total past the payment cap; shown above the bar's own row. */
  pesanBatas?: string | null;
  action?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const total = denah.total;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card shadow-[0_-8px_24px_-12px] shadow-primary/20">
      <div className="mx-auto max-w-5xl px-4">
        {pesanBatas ? (
          <p role="alert" className="border-b border-border bg-warning-soft px-3 py-2 text-small text-warning-soft-foreground">
            {pesanBatas}
          </p>
        ) : null}
        {open && ada ? (
          <div id="rincian-terencana" className="max-h-[50vh] overflow-y-auto border-b border-border py-4">
            <dl className="flex flex-col gap-2 text-body tabular-nums">
              {total.lines.map((baris, index) => (
                <div key={`${baris.label}-${index}`} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{baris.label}</dt>
                  <dd className="whitespace-nowrap">{formatRupiah(baris.amount)}</dd>
                </div>
              ))}
            </dl>
            {denah.nanti ? (
              <div className="mt-3 rounded-xl bg-muted px-3 py-2.5 text-small text-foreground">
                <p className="font-semibold">Nanti, setiap pemakaman</p>
                <p className="mt-0.5 text-muted-foreground">
                  Biaya Pemakaman + Biaya Layanan Platform, sesuai tarif saat pemakaman (saat ini{" "}
                  {formatRupiah(denah.nanti.total)}). Dibayar setelah pemakaman, bukan sekarang.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="flex items-center gap-3 py-3">
          <button
            type="button"
            disabled={!ada}
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls="rincian-terencana"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left disabled:cursor-default"
          >
            <span className="min-w-0">
              <span className="line-clamp-2 block text-caption text-muted-foreground">{ringkasanText}</span>
              <span className="block text-title-2 tabular-nums text-foreground">
                {ada ? formatRupiah(total.total) : "Pilih petak di denah"}
              </span>
              {ada ? (
                <span className="hidden text-caption text-muted-foreground sm:block">
                  Hak Pakai + Biaya Layanan Platform; biaya pemakaman nanti
                </span>
              ) : null}
            </span>
            {ada ? (
              <ChevronUp className={cn("size-5 shrink-0 text-primary transition-transform", !open && "rotate-180")} aria-hidden />
            ) : null}
          </button>
          {action}
        </div>
      </div>
    </div>
  );
}
