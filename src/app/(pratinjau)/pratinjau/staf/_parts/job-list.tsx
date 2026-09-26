"use client";

import { CalendarIcon, CameraIcon, MapPinIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/makam/empty-state";
import { StatusBadge } from "@/components/makam/status-badge";
import { Button } from "@/components/ui/button";
import type { PekerjaanRow } from "../_mock/data";

/**
 * PROTOTYPE phone-first job list for Mitra Jasa (Pekerjaan Layanan) and
 * Petugas Lapangan (Tugas Lapangan): one card per job, the next step as a
 * full-width 44px button, a segmented filter on top.
 */
export function JobList({ rows, noun }: { rows: PekerjaanRow[]; noun: string }) {
  const [filter, setFilter] = useState<"perlu" | "baru" | "semua">("perlu");
  const shown = rows.filter((row) =>
    filter === "semua" ? true : filter === "baru" ? row.status === "diajukan" : row.status !== "diajukan",
  );
  const counts = {
    perlu: rows.filter((row) => row.status !== "diajukan").length,
    baru: rows.filter((row) => row.status === "diajukan").length,
    semua: rows.length,
  };
  const labels = { perlu: "Dikerjakan", baru: "Tawaran baru", semua: "Semua" } as const;

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label={`Saring ${noun}`} className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        {(Object.keys(labels) as (keyof typeof labels)[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            onClick={() => setFilter(key)}
            className={cn(
              "flex min-h-10 items-center justify-center gap-1.5 rounded-md text-small font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
              filter === key ? "bg-background text-foreground shadow-xs" : "text-muted-foreground",
            )}
          >
            {labels[key]}
            <span className="tabular-nums text-muted-foreground">{counts[key]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={CalendarIcon} title={`Tidak ada ${noun} di sini`} description="Tawaran baru masuk lewat WhatsApp dan muncul di sini." />
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((row) => (
            <li
              key={row.id}
              className={cn(
                "flex flex-col gap-3 rounded-xl border bg-card p-4",
                row.status === "terlambat" ? "border-danger/40" : "border-border",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-title-3">{row.layanan}</p>
                <StatusBadge status={row.status} />
              </div>
              <div className="flex flex-col gap-1.5 text-small text-muted-foreground">
                <p className="flex items-center gap-2">
                  <MapPinIcon className="size-4 shrink-0" aria-hidden />
                  <span>
                    <span className="text-foreground">{row.tempat}</span>, {row.nomorMakam}
                  </span>
                </p>
                <p className={cn("flex items-center gap-2", row.status === "terlambat" && "font-medium text-danger-soft-foreground")}>
                  <CalendarIcon className="size-4 shrink-0" aria-hidden />
                  {row.tanggal}
                </p>
                {row.catatan ? <p className="pl-6">{row.catatan}</p> : null}
              </div>
              {row.status === "diajukan" ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="lg" className="h-11" onClick={() => toast("Tawaran ditolak", { description: "Admin Platform mencari pengganti." })}>
                    Tolak
                  </Button>
                  <Button size="lg" className="h-11" onClick={() => toast.success("Tawaran diterima", { description: `${row.layanan} masuk ke daftar Dikerjakan.` })}>
                    Terima
                  </Button>
                </div>
              ) : (
                <Button
                  size="lg"
                  variant={row.status === "terlambat" ? "default" : "outline"}
                  className="h-11 w-full"
                  onClick={() => toast("Pratinjau: kamera tidak dibuka", { description: "Di aplikasi nyata ini membuka kamera untuk foto bukti." })}
                >
                  <CameraIcon aria-hidden /> Unggah foto bukti
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
