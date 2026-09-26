"use client";

/*
 * PROTOTYPE, throwaway. The Blok grid: Petak Makam / Jalan / Bukan Petak
 * cells, drag-select on desktop, tap-select mode on phones, zoom, edge "+"
 * buttons, and a Kavling Keluarga outline. Cell colours and the legend copy
 * the public Denah picker (`git show worktree-agent-ab5e1eadecba063e3:src/app/(pratinjau)/pratinjau/publik/_parts/denah-picker.tsx`)
 * so a Petak looks the same whether an Admin Lokasi or a Pemesan sees it.
 *
 * A fourth cell type, Pintu Masuk (ticket 84), is not built here. `JenisSel`
 * and `cellClass` below are written as one case per type so adding it later
 * is one more branch, not a redesign; see the layout's open questions.
 */
import { useRef, useState } from "react";
import { Minus, Plus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Blok, type Sel, type StatusPetak, type Tepi, statusPetak } from "./model";

const cellBase =
  "relative flex items-center justify-center rounded-md text-[10px] leading-none font-semibold tabular-nums transition-colors select-none";

function pendekNomor(nomor: string | null, prefix: string) {
  if (!nomor) return "";
  const tanpaPrefix = nomor.slice(prefix.length).replace(/^-/, "");
  return tanpaPrefix || nomor;
}

function statusClass(status: StatusPetak) {
  if (status === "Tersedia") return "border-2 border-sage bg-card text-foreground hover:bg-brand-soft cursor-pointer";
  if (status === "Dipesan") return "bg-warning-soft text-warning-soft-foreground border border-warning/40";
  if (status === "Terisi") return "bg-neutral-soft text-neutral-soft-foreground";
  return "bg-[repeating-linear-gradient(135deg,var(--muted)_0_4px,var(--border-strong)_4px_6px)] text-muted-foreground";
}

export function cellClass(sel: Sel, blok: Blok, isSelected: boolean) {
  if (sel.jenis === "jalan") return cn(cellBase, isSelected ? "bg-forest text-primary-foreground" : "bg-highlight/35 hover:bg-highlight/55 cursor-pointer");
  if (sel.jenis === "bukan")
    return cn(cellBase, isSelected ? "bg-forest text-primary-foreground" : "border border-dashed border-border-strong bg-transparent text-muted-foreground hover:bg-accent cursor-pointer");
  const status = statusPetak(sel, blok);
  return cn(cellBase, isSelected ? "bg-forest text-primary-foreground" : statusClass(status));
}

export function Legend() {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-small lg:grid-cols-1">
      <LegendItem swatch="border-2 border-sage bg-card" label="Petak Makam, Tersedia" />
      <LegendItem swatch="bg-warning-soft border border-warning/40" label="Petak Makam, Dipesan" />
      <LegendItem swatch="bg-neutral-soft" label="Petak Makam, Terisi" />
      <LegendItem swatch="bg-[repeating-linear-gradient(135deg,var(--muted)_0_4px,var(--border-strong)_4px_6px)]" label="Petak Makam, Tidak Tersedia" />
      <LegendItem swatch="bg-highlight/35" label="Jalan" />
      <LegendItem swatch="border border-dashed border-border-strong" label="Bukan Petak (pohon, bangunan, lahan)" />
      <LegendItem swatch="border-2 border-sage bg-card" kavling label="Bagian Kavling Keluarga (ikon keluarga)" />
      <LegendItem swatch="bg-forest" label="Dipilih untuk diubah" />
      <LegendItem swatch="bg-card" dot label="Perlu Verifikasi" />
    </ul>
  );
}

function LegendItem({ swatch, label, dot, kavling }: { swatch: string; label: string; dot?: boolean; kavling?: boolean }) {
  return (
    <li className="flex items-center gap-2 text-foreground">
      <span className={cn("relative size-4 shrink-0 rounded", swatch)} aria-hidden>
        {dot ? <span className="absolute -top-1 -right-1 size-2 rounded-full bg-warning" /> : null}
        {kavling ? <Users className="absolute -bottom-0.5 -left-0.5 size-2.5 text-sage-strong" /> : null}
      </span>
      {label}
    </li>
  );
}

function EdgeButton({ tepi, className, label, onAddEdge }: { tepi: Tepi; className: string; label: string; onAddEdge: (tepi: Tepi) => void }) {
  return (
    <button
      type="button"
      onClick={() => onAddEdge(tepi)}
      aria-label={label}
      title={label}
      className={cn(
        "absolute z-10 inline-flex size-6 items-center justify-center rounded-full border border-border-strong bg-card text-muted-foreground shadow-xs hover:border-forest hover:text-forest",
        className,
      )}
    >
      <Plus className="size-3.5" aria-hidden />
    </button>
  );
}

type Props = {
  blok: Blok;
  selected: Set<string>;
  onSelectedChange: (ids: Set<string>) => void;
  mode: "lihat" | "pilih";
  onTapCell: (sel: Sel) => void;
  fokusId?: string | null;
  onAddEdge: (tepi: Tepi) => void;
};

export function BlokGrid({ blok, selected, onSelectedChange, mode, onTapCell, fokusId, onAddEdge }: Props) {
  const [ukuran, setUkuran] = useState(40);
  const pinch = useRef<{ d: number; u: number } | null>(null);
  const drag = useRef<{ r: number; c: number; moved: boolean } | null>(null);
  const gap = 4;
  const pad = 10;
  const cols = blok.grid[0]?.length ?? 0;

  function rectIds(a: { r: number; c: number }, b: { r: number; c: number }) {
    const r0 = Math.min(a.r, b.r);
    const r1 = Math.max(a.r, b.r);
    const c0 = Math.min(a.c, b.c);
    const c1 = Math.max(a.c, b.c);
    const ids: string[] = [];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) ids.push(blok.grid[r][c].id);
    return ids;
  }

  function tap(sel: Sel) {
    if (mode === "pilih") {
      const next = new Set(selected);
      if (next.has(sel.id)) next.delete(sel.id);
      else next.add(sel.id);
      onSelectedChange(next);
    }
    onTapCell(sel);
  }

  function pointerDown(e: React.PointerEvent, r: number, c: number) {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    drag.current = { r, c, moved: false };
  }

  function pointerEnter(r: number, c: number) {
    if (!drag.current) return;
    if (drag.current.r !== r || drag.current.c !== c) drag.current.moved = true;
    if (drag.current.moved) onSelectedChange(new Set(rectIds({ r: drag.current.r, c: drag.current.c }, { r, c })));
  }

  function pointerUp(sel: Sel) {
    if (!drag.current) return;
    if (!drag.current.moved) tap(sel);
    drag.current = null;
  }
  // A release past the grid edge never reaches a cell's onPointerUp, so the
  // anchor can stay set; the next pointerDown always overwrites it, so a
  // stray one is harmless and never shows a wrong selection.

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end gap-2">
        <div className="flex shrink-0 overflow-hidden rounded-lg border border-border bg-card">
          <button type="button" aria-label="Perkecil denah" onClick={() => setUkuran(Math.max(24, ukuran - 8))} className="inline-flex size-10 items-center justify-center hover:bg-accent">
            <Minus className="size-4" />
          </button>
          <button type="button" aria-label="Perbesar denah" onClick={() => setUkuran(Math.min(64, ukuran + 8))} className="inline-flex size-10 items-center justify-center border-l border-border hover:bg-accent">
            <Plus className="size-4" />
          </button>
        </div>
      </div>

      <div className="relative rounded-2xl border border-border bg-card">
        <EdgeButton tepi="atas" label="Tambah baris di atas" className="top-1 left-1/2 -translate-x-1/2" onAddEdge={onAddEdge} />
        <EdgeButton tepi="bawah" label="Tambah baris di bawah" className="bottom-1 left-1/2 -translate-x-1/2" onAddEdge={onAddEdge} />
        <EdgeButton tepi="kiri" label="Tambah kolom di kiri" className="top-1/2 left-1 -translate-y-1/2" onAddEdge={onAddEdge} />
        <EdgeButton tepi="kanan" label="Tambah kolom di kanan" className="top-1/2 right-1 -translate-y-1/2" onAddEdge={onAddEdge} />
        <div
          className="max-h-[56vh] overflow-auto overscroll-contain lg:max-h-[32rem]"
          style={{ touchAction: "pan-x pan-y" }}
          onTouchStart={(e) => {
            if (e.touches.length === 2) {
              const [a, b] = [e.touches[0], e.touches[1]];
              pinch.current = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), u: ukuran };
            }
          }}
          onTouchMove={(e) => {
            if (e.touches.length === 2 && pinch.current) {
              const [a, b] = [e.touches[0], e.touches[1]];
              const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
              setUkuran(Math.round(Math.min(64, Math.max(24, (pinch.current.u * d) / pinch.current.d))));
            }
          }}
          onTouchEnd={() => (pinch.current = null)}
        >
          <div style={{ padding: pad + 16, width: cols * ukuran + (cols - 1) * gap + (pad + 16) * 2 }}>
            <div
              className="grid"
              style={{ gridTemplateColumns: `repeat(${cols}, ${ukuran}px)`, gridAutoRows: `${ukuran}px`, gap }}
              role="group"
              aria-label={`Denah ${blok.nama}`}
            >
              {blok.grid.flatMap((row, r) =>
                row.map((sel, c) => {
                  const isSelected = selected.has(sel.id);
                  const isFokus = fokusId === sel.id;
                  const status = sel.jenis === "petak" ? statusPetak(sel, blok) : null;
                  const label =
                    sel.jenis === "petak"
                      ? isSelected
                        ? "✓"
                        : pendekNomor(sel.nomor, blok.nama)
                      : "";
                  const title =
                    sel.jenis === "petak"
                      ? `${sel.nomor} · ${sel.kavling ? `Kavling ${sel.kavling}` : "Petak Makam"} · ${status}`
                      : sel.jenis === "jalan"
                        ? "Jalan"
                        : "Bukan Petak";
                  return (
                    <button
                      key={sel.id}
                      type="button"
                      title={title}
                      aria-label={title}
                      aria-pressed={isSelected}
                      onPointerDown={(e) => pointerDown(e, r, c)}
                      onPointerEnter={() => pointerEnter(r, c)}
                      onPointerUp={() => pointerUp(sel)}
                      className={cn(cellClass(sel, blok, isSelected), isFokus && "ring-2 ring-info ring-offset-2 ring-offset-card")}
                    >
                      {sel.jenis === "petak" && sel.perluVerifikasi ? <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-warning" aria-hidden /> : null}
                      {sel.jenis === "petak" && sel.kavling && !isSelected ? (
                        <Users className="absolute bottom-0.5 left-0.5 size-2.5 text-sage-strong" aria-hidden />
                      ) : null}
                      {label}
                    </button>
                  );
                }),
              )}
            </div>
          </div>
        </div>
      </div>
      <p className="text-small text-muted-foreground lg:hidden">Geser untuk melihat seluruh blok; cubit atau pakai tombol +/− untuk memperbesar.</p>
    </div>
  );
}
