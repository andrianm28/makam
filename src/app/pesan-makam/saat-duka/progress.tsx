"use client";

import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The wizard's progress bar with a way back (spec, Booking wizards: one
 * decision per screen, a progress bar with back). "Langkah 1 dari 2".
 */
export function Progress({
  langkah,
  total,
  onBack,
  backLabel,
}: {
  langkah: 1 | 2;
  total: 2;
  onBack: () => void;
  backLabel: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={onBack} className="-ml-2 text-body font-medium text-primary">
          <ArrowLeft aria-hidden /> {backLabel}
        </Button>
        <span className="text-small text-muted-foreground">
          Langkah {langkah} dari {total}
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={langkah}
        aria-label="Langkah pemesanan"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${(langkah / total) * 100}%` }} />
      </div>
    </div>
  );
}
