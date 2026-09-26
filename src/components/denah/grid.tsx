"use client";

/**
 * The shared Denah grid renderer and legend (ticket 13 comments: ticket 13's
 * Admin Lokasi editor and ticket 36's public Terencana picker share this one
 * component and colour scheme, so a Petak looks the same to both). Purely
 * presentational: it knows nothing about Server Actions or the Inventory
 * module, only this small view model, and reports interaction back through
 * callbacks.
 *
 * Interaction: click-drag on desktop selects a rectangle; Ctrl/Cmd or Shift
 * click adds one cell to the selection; a plain tap always calls `onTapCell`.
 * On a touch device (no drag-select) `selectMode` makes every tap toggle
 * selection instead. Pinch or the +/- buttons zoom.
 */
import { useRef, useState } from "react";
import { Minus, Plus, Users } from "lucide-react";
import { cn } from "@/lib/utils";

/** The four Petak Makam statuses (CONTEXT.md); only meaningful when `kind` is `"petak"`. */
export type DenahCellStatus = "tersedia" | "dipesan" | "terisi" | "tidak_tersedia";

export interface DenahGridCell {
  id: string;
  row: number;
  col: number;
  kind: "petak" | "jalan" | "bukan_petak";
  /** What the cell shows: usually the Nomor Makam with the Blok's prefix trimmed. */
  label: string;
  status?: DenahCellStatus;
  perluVerifikasi?: boolean;
  partOfKavling?: boolean;
}

export type DenahEdge = "atas" | "bawah" | "kiri" | "kanan";

function statusClass(status: DenahCellStatus | undefined) {
  if (status === "dipesan") return "bg-warning-soft text-warning-soft-foreground border border-warning/40";
  if (status === "terisi") return "bg-neutral-soft text-neutral-soft-foreground";
  if (status === "tidak_tersedia")
    return "bg-[repeating-linear-gradient(135deg,var(--muted)_0_4px,var(--border-strong)_4px_6px)] text-muted-foreground";
  return "border-2 border-sage bg-card text-foreground hover:bg-brand-soft cursor-pointer";
}

const cellBase =
  "relative flex items-center justify-center rounded-md text-[10px] leading-none font-semibold tabular-nums transition-colors select-none";

export function denahCellClass(cell: DenahGridCell, isSelected: boolean): string {
  if (cell.kind === "jalan") return cn(cellBase, isSelected ? "bg-forest text-primary-foreground" : "bg-highlight/35 hover:bg-highlight/55 cursor-pointer");
  if (cell.kind === "bukan_petak")
    return cn(
      cellBase,
      isSelected ? "bg-forest text-primary-foreground" : "border border-dashed border-border-strong bg-transparent text-muted-foreground hover:bg-accent cursor-pointer",
    );
  return cn(cellBase, isSelected ? "bg-forest text-primary-foreground" : statusClass(cell.status));
}

export function DenahLegend() {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-sm lg:grid-cols-1">
      <LegendItem swatch="border-2 border-sage bg-card" label="Petak Makam, Tersedia" />
      <LegendItem swatch="bg-warning-soft border border-warning/40" label="Petak Makam, Dipesan" />
      <LegendItem swatch="bg-neutral-soft" label="Petak Makam, Terisi" />
      <LegendItem swatch="bg-[repeating-linear-gradient(135deg,var(--muted)_0_4px,var(--border-strong)_4px_6px)]" label="Petak Makam, Tidak Tersedia" />
      <LegendItem swatch="bg-highlight/35" label="Jalan" />
      <LegendItem swatch="border border-dashed border-border-strong" label="Bukan Petak (pohon, bangunan, lahan)" />
      <LegendItem swatch="border-2 border-sage bg-card" kavling label="Bagian Kavling Keluarga (ikon keluarga)" />
      <LegendItem swatch="bg-forest" label="Dipilih" />
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

export interface DenahGridProps {
  title: string;
  rows: number;
  cols: number;
  cells: DenahGridCell[];
  selected: ReadonlySet<string>;
  onSelectedChange: (ids: Set<string>) => void;
  /** Phones have no drag-select: this mode makes every tap toggle selection. */
  selectMode: boolean;
  onTapCell: (cell: DenahGridCell) => void;
  onAddEdge?: (edge: DenahEdge) => void;
}

/** The Blok grid: drag-select or tap-select, zoom, edge "+" buttons, a Kavling Keluarga icon per member cell. */
export function DenahGrid({ title, rows, cols, cells, selected, onSelectedChange, selectMode, onTapCell, onAddEdge }: DenahGridProps) {
  const [size, setSize] = useState(40);
  const pinch = useRef<{ distance: number; size: number } | null>(null);
  const drag = useRef<{ row: number; col: number; moved: boolean } | null>(null);
  const gap = 4;

  const byPosition = new Map(cells.map((cell) => [`${cell.row}:${cell.col}`, cell]));

  function rectIds(a: { row: number; col: number }, b: { row: number; col: number }): string[] {
    const r0 = Math.min(a.row, b.row);
    const r1 = Math.max(a.row, b.row);
    const c0 = Math.min(a.col, b.col);
    const c1 = Math.max(a.col, b.col);
    const ids: string[] = [];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const cell = byPosition.get(`${r}:${c}`); if (cell) ids.push(cell.id); }
    return ids;
  }

  function toggle(cell: DenahGridCell) {
    const next = new Set(selected);
    if (next.has(cell.id)) next.delete(cell.id);
    else next.add(cell.id);
    onSelectedChange(next);
  }

  function tap(cell: DenahGridCell, event: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }) {
    if (selectMode || event.ctrlKey || event.metaKey || event.shiftKey) toggle(cell);
    onTapCell(cell);
  }

  function pointerDown(event: React.PointerEvent, row: number, col: number) {
    if (event.pointerType !== "mouse" || event.button !== 0 || selectMode) return;
    drag.current = { row, col, moved: false };
  }

  function pointerEnter(row: number, col: number) {
    if (!drag.current) return;
    if (drag.current.row !== row || drag.current.col !== col) drag.current.moved = true;
    if (drag.current.moved) onSelectedChange(new Set(rectIds({ row: drag.current.row, col: drag.current.col }, { row, col })));
  }

  function pointerUp(cell: DenahGridCell, event: React.PointerEvent) {
    if (drag.current && !drag.current.moved) tap(cell, event);
    else if (!drag.current) tap(cell, event);
    drag.current = null;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end gap-2">
        <div className="flex shrink-0 overflow-hidden rounded-lg border border-border bg-card">
          <button type="button" aria-label="Perkecil denah" onClick={() => setSize(Math.max(24, size - 8))} className="inline-flex size-10 items-center justify-center hover:bg-accent">
            <Minus className="size-4" />
          </button>
          <button type="button" aria-label="Perbesar denah" onClick={() => setSize(Math.min(64, size + 8))} className="inline-flex size-10 items-center justify-center border-l border-border hover:bg-accent">
            <Plus className="size-4" />
          </button>
        </div>
      </div>
      <div className="relative rounded-2xl border border-border bg-card">
        {onAddEdge ? (
          <>
            <EdgeButton edge="atas" label="Tambah baris di atas" className="top-1 left-1/2 -translate-x-1/2" onAddEdge={onAddEdge} />
            <EdgeButton edge="bawah" label="Tambah baris di bawah" className="bottom-1 left-1/2 -translate-x-1/2" onAddEdge={onAddEdge} />
            <EdgeButton edge="kiri" label="Tambah kolom di kiri" className="top-1/2 left-1 -translate-y-1/2" onAddEdge={onAddEdge} />
            <EdgeButton edge="kanan" label="Tambah kolom di kanan" className="top-1/2 right-1 -translate-y-1/2" onAddEdge={onAddEdge} />
          </>
        ) : null}
        <div
          className="max-h-[56vh] overflow-auto overscroll-contain lg:max-h-[32rem]"
          style={{ touchAction: "pan-x pan-y" }}
          onTouchStart={(event) => {
            if (event.touches.length === 2) {
              const [a, b] = [event.touches[0], event.touches[1]];
              pinch.current = { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), size };
            }
          }}
          onTouchMove={(event) => {
            if (event.touches.length === 2 && pinch.current) {
              const [a, b] = [event.touches[0], event.touches[1]];
              const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
              setSize(Math.round(Math.min(64, Math.max(24, (pinch.current.size * distance) / pinch.current.distance))));
            }
          }}
          onTouchEnd={() => (pinch.current = null)}
        >
          <div style={{ padding: 26, width: cols * size + (cols - 1) * gap + 52 }}>
            <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, ${size}px)`, gridAutoRows: `${size}px`, gap }} role="group" aria-label={`Denah ${title}`}>
              {Array.from({ length: rows }, (_, row) =>
                Array.from({ length: cols }, (_, col) => {
                  const cell = byPosition.get(`${row}:${col}`);
                  if (!cell) return <div key={`${row}:${col}`} />;
                  const isSelected = selected.has(cell.id);
                  const displayLabel = isSelected ? "✓" : cell.label;
                  return (
                    <button
                      key={cell.id}
                      type="button"
                      title={cell.label}
                      aria-label={cell.label}
                      aria-pressed={isSelected}
                      onPointerDown={(event) => pointerDown(event, row, col)}
                      onPointerEnter={() => pointerEnter(row, col)}
                      onPointerUp={(event) => pointerUp(cell, event)}
                      className={denahCellClass(cell, isSelected)}
                    >
                      {cell.kind === "petak" && cell.perluVerifikasi ? <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-warning" aria-hidden /> : null}
                      {cell.kind === "petak" && cell.partOfKavling && !isSelected ? <Users className="absolute bottom-0.5 left-0.5 size-2.5 text-sage-strong" aria-hidden /> : null}
                      {cell.kind === "petak" ? displayLabel : ""}
                    </button>
                  );
                }),
              )}
            </div>
          </div>
        </div>
      </div>
      <p className="text-sm text-muted-foreground lg:hidden">Geser untuk melihat seluruh blok; cubit atau pakai tombol +/− untuk memperbesar.</p>
    </div>
  );
}

function EdgeButton({ edge, className, label, onAddEdge }: { edge: DenahEdge; className: string; label: string; onAddEdge: (edge: DenahEdge) => void }) {
  return (
    <button
      type="button"
      onClick={() => onAddEdge(edge)}
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
