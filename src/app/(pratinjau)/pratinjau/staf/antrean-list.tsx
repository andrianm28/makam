"use client";

import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { AntreanRow } from "./_mock/data";

/** How long is left, in words staff read at a glance. */
function sisa(menit: number) {
  if (menit < 0) return `Lewat ${Math.abs(menit)} menit`;
  if (menit < 60) return `${menit} menit lagi`;
  if (menit < 24 * 60) {
    const jam = Math.floor(menit / 60);
    const m = menit % 60;
    return m ? `${jam} j ${m} m lagi` : `${jam} jam lagi`;
  }
  return `${Math.round(menit / (24 * 60))} hari lagi`;
}

function tone(row: AntreanRow) {
  if (row.sisaMenit < 0) return "danger" as const;
  if (row.sisaMenit / row.jendelaMenit < 0.25) return "warning" as const;
  return "calm" as const;
}

/**
 * PROTOTYPE task list for the Admin Platform dashboard: the first rows of the
 * Antrean, most urgent first. Each row carries a tenggat bar, the share of its
 * window already used, so the one about to run out stands out without reading.
 */
export function AntreanList({ rows }: { rows: AntreanRow[] }) {
  return (
    <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {rows.map((row) => {
        const t = tone(row);
        const used = Math.min(1, Math.max(0, 1 - row.sisaMenit / row.jendelaMenit));
        return (
          <li key={row.id} className="relative flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-6">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-body font-medium text-foreground">{row.title}</p>
              <p className="flex flex-wrap gap-x-3 text-small text-muted-foreground">
                <span className={row.subject.startsWith("MKM-") ? "font-mono text-caption leading-[1.125rem]" : undefined}>{row.subject}</span>
                <span>{row.lokasi}</span>
              </p>
            </div>
            <div className="flex w-full shrink-0 flex-col gap-1.5 sm:w-44">
              <p
                className={cn(
                  "text-small tabular-nums",
                  t === "danger" && "font-medium text-danger-soft-foreground",
                  t === "warning" && "font-medium text-warning-soft-foreground",
                  t === "calm" && "text-muted-foreground",
                )}
              >
                {sisa(row.sisaMenit)}
              </p>
              <div
                className="h-1 w-full overflow-hidden rounded-full bg-muted"
                role="meter"
                aria-label="Tenggat terpakai"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(used * 100)}
              >
                <div
                  className={cn(
                    "h-full rounded-full",
                    t === "danger" && "bg-danger",
                    t === "warning" && "bg-warning",
                    t === "calm" && "bg-brand",
                  )}
                  style={{ width: `${Math.max(used * 100, 4)}%` }}
                />
              </div>
            </div>
            <div className="flex w-28 shrink-0 items-center justify-end">
              {row.diambil ? (
                <span className="flex items-center gap-2 text-small text-muted-foreground">
                  <Avatar className="size-6">
                    <AvatarFallback className="text-[0.625rem]">{row.diambil.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  {row.diambil}
                </span>
              ) : (
                <Button
                  variant={t === "danger" ? "default" : "outline"}
                  onClick={() => toast.success("Baris Antrean diambil", { description: `${row.subject} sekarang atas nama Anda.` })}
                >
                  Ambil
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
