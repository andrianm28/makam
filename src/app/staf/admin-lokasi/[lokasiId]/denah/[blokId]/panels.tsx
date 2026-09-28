"use client";

/**
 * The Denah editor's side panels: the tapped cell's detail (ported 1:1 from
 * ticket 13's prototype, `pratinjau/denah/_parts/panels.tsx`, kept to what
 * the real Inventory read (`DenahCell`/`DenahKavling`) actually carries: a
 * Hak Pakai's Pemegang Hak and Pemakaman are not part of that read, so unlike
 * the prototype's mock this panel only says a Petak "punya Hak Pakai", not
 * who holds it) and the per-Blok summary (computed here from the same cells
 * and kavling the grid already has, the same counts `ringkasan()` computed in
 * the prototype).
 */
import { useState } from "react";
import { Lock, LogIn, Route, ScanLine, Square, TreePine, Trash2, X } from "lucide-react";
import type { DenahCell, DenahKavling } from "@/domain/inventory/reads";
import { cn } from "@/lib/utils";

interface JenisMakamOption {
  id: string;
  name: string;
}

const namaJenisSel = { jalan: "Jalan", bukan_petak: "Bukan Petak", pintu_masuk: "Pintu Masuk" } as const;

const petakStatusLabel: Record<DenahCell["status"], string> = {
  tersedia: "Tersedia",
  dipesan: "Dipesan",
  terisi: "Terisi",
  masa_berlaku_habis: "Terisi",
  tidak_tersedia: "Tidak Tersedia",
};

const kavlingStatusLabel: Record<DenahKavling["status"], string> = {
  tersedia: "Tersedia",
  dipesan: "Dipesan",
  terpakai_sebagian: "Terpakai Sebagian",
  penuh: "Penuh",
};

function statusBadgeClass(status: string) {
  if (status === "Tersedia") return "bg-success-soft text-success-soft-foreground";
  if (status === "Dipesan") return "bg-warning-soft text-warning-soft-foreground";
  if (status === "Tidak Tersedia") return "bg-muted text-muted-foreground";
  return "bg-neutral-soft text-neutral-soft-foreground";
}

/** The Nomor Makam without the Blok's name prefix, so it reads the same as the grid's own label. */
function shortLabel(nomorMakam: string | null, blokName: string): string {
  if (!nomorMakam) return "";
  const withoutPrefix = nomorMakam.slice(blokName.length).replace(/^-/, "");
  return withoutPrefix || nomorMakam;
}

export function DetailPanel({
  blokName,
  cell,
  kavlingOf,
  jenisMakamName,
  needsClearing,
  onClose,
  onRename,
  onSplitKavling,
  onBersihkan,
  pending,
}: {
  blokName: string;
  cell: DenahCell | null;
  kavlingOf?: DenahKavling;
  jenisMakamName?: string;
  needsClearing?: boolean;
  onClose: () => void;
  onRename: (nomor: string) => void;
  onSplitKavling: (kavlingId: string) => void;
  onBersihkan: () => void;
  pending: boolean;
}) {
  const [nomor, setNomor] = useState(cell?.nomorMakam ?? "");

  if (!cell) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-body text-muted-foreground">
        Ketuk satu sel untuk melihat detailnya: Nomor Makam, Jenis Makam, atau kenapa sel itu tidak bisa diubah.
      </div>
    );
  }

  if (cell.kind !== "petak") {
    const Icon = cell.kind === "jalan" ? Route : cell.kind === "pintu_masuk" ? LogIn : TreePine;
    return (
      <div className="relative flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
        <button type="button" onClick={onClose} aria-label="Tutup detail" className="absolute top-2 right-2 inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent lg:hidden">
          <X className="size-4" />
        </button>
        <div className="flex items-center gap-2 text-foreground">
          <Icon className="size-4 text-muted-foreground" aria-hidden />
          <p className="text-title-3">{namaJenisSel[cell.kind]}</p>
        </div>
        <p className="text-body text-muted-foreground">
          {cell.kind === "jalan"
            ? "Jalur antar makam, bukan Petak Makam."
            : cell.kind === "pintu_masuk"
              ? "Petak yang belum dipakai bisa dijadikan Pintu Masuk, dan sebaliknya. Petak yang sedang dipesan tidak bisa, sampai pesanannya selesai atau tidak jadi."
              : "Bukan Petak Makam maupun Jalan (pohon, bangunan, atau lahan yang belum dibuka)."}{" "}
          Pilih lalu gunakan bilah aksi untuk menjadikannya Petak Makam.
        </p>
      </div>
    );
  }

  const status = kavlingOf ? kavlingStatusLabel[kavlingOf.status] : petakStatusLabel[cell.status];

  return (
    <div className="relative flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <button type="button" onClick={onClose} aria-label="Tutup detail" className="absolute top-2 right-2 inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent lg:hidden">
        <X className="size-4" />
      </button>
      <div className="flex items-start justify-between gap-3 pr-8 lg:pr-0">
        <div>
          <p className="font-mono text-title-2 text-foreground">{cell.nomorMakam}</p>
          <p className="text-small text-muted-foreground">
            {jenisMakamName ?? "Jenis Makam belum diatur"}
            {kavlingOf ? ` · Kavling Keluarga ${kavlingOf.nomorKavling}` : ""}
          </p>
        </div>
        <span className={cn("rounded-full px-2.5 py-1 text-caption font-semibold", statusBadgeClass(status))}>{status}</span>
      </div>

      {needsClearing ? (
        <div className="flex flex-col gap-2 rounded-lg bg-warning-soft px-2.5 py-2 text-small text-warning-soft-foreground">
          <p className="flex items-center gap-1.5">
            <ScanLine className="size-3.5 shrink-0" aria-hidden /> Perlu Verifikasi: belum dibersihkan, jadi belum bisa ditugaskan atau dijual.
          </p>
          <button type="button" onClick={onBersihkan} className="self-start rounded-lg bg-forest px-3 py-1.5 text-caption font-semibold text-primary-foreground">
            Bersihkan {kavlingOf ? "Kavling Keluarga" : "Petak"}
          </button>
        </div>
      ) : null}

      {cell.usedForever ? (
        <div className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2.5 text-body text-foreground">
          <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /> Punya Hak Pakai atau Pemakaman: tidak bisa dihapus, dipindah, atau diganti jenisnya.
        </div>
      ) : (
        <>
          <p className="flex items-center gap-1.5 text-body text-muted-foreground">
            <Square className="size-3.5 shrink-0" aria-hidden /> Belum pernah dipakai: bisa dihapus, dipindah baris/kolomnya, atau diganti jenis selnya.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onRename(nomor);
            }}
            className="flex items-center gap-2"
          >
            <input value={nomor} onChange={(event) => setNomor(event.target.value)} className="h-9 w-32 rounded-lg border border-input bg-card px-2 text-body" />
            <button type="submit" disabled={pending} className="h-9 rounded-lg border border-border-strong px-3 text-small hover:bg-accent disabled:opacity-60">
              Simpan nomor
            </button>
          </form>
        </>
      )}

      {kavlingOf && !cell.usedForever ? (
        <button type="button" onClick={() => onSplitKavling(kavlingOf.id)} disabled={pending} className="self-start text-small font-semibold text-forest underline underline-offset-2">
          Pisahkan dari Kavling Keluarga {kavlingOf.nomorKavling}
        </button>
      ) : null}

      <p className="sr-only">{shortLabel(cell.nomorMakam, blokName)}</p>
    </div>
  );
}

export function Summary({
  blokName,
  cells,
  kavling,
  jenisMakam,
}: {
  blokName: string;
  cells: DenahCell[];
  kavling: DenahKavling[];
  jenisMakam: JenisMakamOption[];
}) {
  const petak = cells.filter((cell) => cell.kind === "petak");
  const perJenis = new Map<string, number>();
  for (const cell of petak) if (!cell.kavlingId && cell.jenisMakamId) perJenis.set(cell.jenisMakamId, (perJenis.get(cell.jenisMakamId) ?? 0) + 1);
  for (const k of kavling) perJenis.set(k.jenisMakamId, (perJenis.get(k.jenisMakamId) ?? 0) + 1);
  const perJenisRows = jenisMakam.filter((jenis) => perJenis.has(jenis.id)).map((jenis) => ({ jenis, jumlah: perJenis.get(jenis.id)! }));

  const ringkasan = {
    petak: petak.length,
    jalan: cells.filter((cell) => cell.kind === "jalan").length,
    bukanPetak: cells.filter((cell) => cell.kind === "bukan_petak").length,
    pintuMasuk: cells.filter((cell) => cell.kind === "pintu_masuk").length,
    kavling: kavling.length,
    perluVerifikasi: petak.filter((cell) => cell.perluVerifikasi).length,
    dipakai: petak.filter((cell) => cell.usedForever).length,
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-title-3 text-foreground">Ringkasan Blok {blokName}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-small">
        <Row label="Petak Makam" value={ringkasan.petak} />
        <Row label="Jalan" value={ringkasan.jalan} />
        <Row label="Bukan Petak" value={ringkasan.bukanPetak} />
        <Row label="Pintu Masuk" value={ringkasan.pintuMasuk} />
        <Row label="Kavling Keluarga" value={ringkasan.kavling} />
        <Row label="Perlu Verifikasi" value={ringkasan.perluVerifikasi} warn={ringkasan.perluVerifikasi > 0} />
        <Row label="Sudah dipakai" value={ringkasan.dipakai} />
      </dl>
      {perJenisRows.length ? (
        <>
          <p className="mt-3 text-small font-medium text-foreground">Per Jenis Makam</p>
          <ul className="mt-1 flex flex-col gap-1 text-small text-muted-foreground">
            {perJenisRows.map(({ jenis, jumlah }) => (
              <li key={jenis.id} className="flex items-center justify-between">
                <span>{jenis.name}</span>
                <span className="font-medium text-foreground tabular-nums">{jumlah}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function Row({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("font-medium tabular-nums", warn ? "text-warning-soft-foreground" : "text-foreground")}>{value}</dd>
    </div>
  );
}

export function RemoveRowsOrColsPanel({
  rows,
  cols,
  pending,
  onRemove,
}: {
  rows: number;
  cols: number;
  pending: boolean;
  onRemove: (axis: "baris" | "kolom", index: number) => void;
}) {
  return (
    <details className="rounded-2xl border border-border bg-card p-4">
      <summary className="cursor-pointer text-title-3 text-foreground marker:text-muted-foreground">Hapus baris atau kolom</summary>
      <p className="mt-1 text-small text-muted-foreground">Hanya baris atau kolom yang tak satu pun Petaknya pernah dipakai bisa dihapus.</p>
      <div className="mt-3 flex flex-col gap-3">
        <div>
          <p className="text-small font-medium text-foreground">Baris</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {Array.from({ length: rows }, (_, r) => (
              <button
                key={r}
                type="button"
                disabled={pending}
                onClick={() => onRemove("baris", r)}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-border-strong bg-card px-2 text-caption text-muted-foreground hover:border-danger hover:text-danger disabled:opacity-60"
              >
                <Trash2 className="size-3" aria-hidden /> {r + 1}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-small font-medium text-foreground">Kolom</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {Array.from({ length: cols }, (_, c) => (
              <button
                key={c}
                type="button"
                disabled={pending}
                onClick={() => onRemove("kolom", c)}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-border-strong bg-card px-2 text-caption text-muted-foreground hover:border-danger hover:text-danger disabled:opacity-60"
              >
                <Trash2 className="size-3" aria-hidden /> {c + 1}
              </button>
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}
