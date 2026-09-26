"use client";

/*
 * PROTOTYPE, throwaway. The bulk-edit bar: sticky at the bottom on phones
 * (where a "Pilih sel" mode toggle stands in for drag-select), inline on
 * desktop where dragging a rectangle selects directly. Same five actions
 * either way, per ticket 13's acceptance criteria.
 */
import { Hash, Layers, MousePointerSquareDashed, Route, TreePine, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function ModeToggle({ mode, onChange }: { mode: "lihat" | "pilih"; onChange: (m: "lihat" | "pilih") => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(mode === "pilih" ? "lihat" : "pilih")}
      aria-pressed={mode === "pilih"}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-small font-medium lg:hidden",
        mode === "pilih" ? "border-forest bg-forest text-primary-foreground" : "border-border-strong bg-card text-foreground hover:bg-accent",
      )}
    >
      <MousePointerSquareDashed className="size-4" aria-hidden />
      {mode === "pilih" ? "Mode pilih aktif" : "Pilih sel"}
    </button>
  );
}

export function ActionBar({
  jumlah,
  onJadikan,
  onAturJenis,
  onBuatKavling,
  onUbahNomor,
  onBatal,
}: {
  jumlah: number;
  onJadikan: (jenis: "petak" | "jalan" | "bukan") => void;
  onAturJenis: () => void;
  onBuatKavling: () => void;
  onUbahNomor: () => void;
  onBatal: () => void;
}) {
  if (jumlah === 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 p-3 backdrop-blur-md supports-backdrop-filter:bg-card/80 lg:sticky lg:bottom-3 lg:rounded-2xl lg:border lg:shadow-lg">
      <div className="mx-auto flex max-w-(--page-max-width) flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-small font-medium text-foreground">{jumlah} sel dipilih</p>
          <button type="button" onClick={onBatal} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-small text-muted-foreground hover:bg-accent">
            <X className="size-3.5" aria-hidden /> Batalkan pilihan
          </button>
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
          <ActionButton icon={Route} label="Jadikan Jalan" onClick={() => onJadikan("jalan")} />
          <ActionButton icon={TreePine} label="Jadikan Bukan Petak" onClick={() => onJadikan("bukan")} />
          <ActionButton icon={Layers} label="Jadikan Petak Makam" onClick={() => onJadikan("petak")} />
          <ActionButton icon={Layers} label="Atur Jenis Makam" onClick={onAturJenis} />
          <ActionButton icon={Users} label="Buat Kavling" onClick={onBuatKavling} />
          <ActionButton icon={Hash} label="Ubah nomor" onClick={onUbahNomor} />
        </div>
      </div>
    </div>
  );
}

function ActionButton({ icon: Icon, label, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-border-strong bg-card px-3.5 text-small font-medium text-foreground hover:border-forest hover:bg-brand-soft hover:text-brand-soft-foreground"
    >
      <Icon className="size-4" aria-hidden /> {label}
    </button>
  );
}
