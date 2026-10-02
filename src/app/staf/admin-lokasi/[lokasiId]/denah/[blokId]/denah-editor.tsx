"use client";

/**
 * Wires one Blok's Denah editor together: Blok tabs, the grid, bulk actions,
 * dialogs, the detail panel and the per-Blok summary. Ported 1:1 (layout and
 * copy) from ticket 13's prototype (`pratinjau/denah/_parts/denah-editor.tsx`)
 * onto the real Inventory reads and Server Actions; see this folder's
 * `page.tsx` and `panels.tsx`/`action-bar.tsx`/`photo-section.tsx` for where
 * the prototype's pieces landed, and `../_parts/blok-dialogs.tsx` for the
 * dialogs shared with the Blok tabs' "Blok baru".
 */
import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, PencilLine, X } from "lucide-react";
import { PageHeader } from "@/components/makam/page-header";
import { DenahGrid, DenahLegend, type DenahCellStatus, type DenahEdge, type DenahGridCell } from "@/components/denah/grid";
import type { DenahCell, DenahKavling } from "@/domain/inventory/reads";
import { cn } from "@/lib/utils";
import { AturJenisMakamDialog, KavlingDialog, UbahNomorDialog } from "../_parts/blok-dialogs";
import { BlokTabs } from "../_parts/blok-tabs";
import { HapusBlokButton } from "../_parts/hapus-blok";
import {
  addEdgeAction,
  clearKavlingAction,
  clearPetakAction,
  createKavlingAction,
  removeRowsOrColsAction,
  renumberCellsAction,
  setCellKindAction,
  setJenisMakamAction,
  setSingleNumberAction,
  splitKavlingAction,
} from "./actions";
import { ClearingDialog } from "./clearing-dialog";
import { ActionBar, ModeToggle } from "./action-bar";
import { DetailPanel, RemoveRowsOrColsPanel, Summary } from "./panels";
import { PhotoSection } from "./photo-section";

interface JenisMakamOption {
  id: string;
  name: string;
}

interface BlokInfo {
  id: string;
  name: string;
  rows: number;
  cols: number;
  numberPattern: string;
}

interface BlokTab {
  id: string;
  name: string;
}

const namaJenisSel = { jalan: "Jalan", bukan_petak: "Bukan Petak", pintu_masuk: "Pintu Masuk" } as const;

type Pesan = { kind: "info" | "error"; teks: string } | null;

/** Skip counts a bulk edit's `ok: true` result can carry (some cells locked): the same note the prototype's `catatan` showed. */
function skipNote(data: unknown): string | null {
  const outcome = (data as { outcome?: { skippedUsed?: string[]; skippedKavling?: string[] } } | null)?.outcome;
  if (!outcome) return null;
  const parts: string[] = [];
  if (outcome.skippedUsed?.length) parts.push(`${outcome.skippedUsed.length} sel dilewati karena punya Hak Pakai`);
  if (outcome.skippedKavling?.length) parts.push(`${outcome.skippedKavling.length} sel dilewati karena bagian dari Kavling Keluarga`);
  return parts.length ? `${parts.join("; ")}.` : null;
}

export function DenahEditor({
  lokasiId,
  bloks,
  blok,
  cells,
  kavling,
  jenisMakam,
  fileStoreConfigured,
  photoUrl,
  bolehHapus,
  alasanHapusMax,
}: {
  lokasiId: string;
  bloks: BlokTab[];
  blok: BlokInfo;
  cells: DenahCell[];
  kavling: DenahKavling[];
  jenisMakam: JenisMakamOption[];
  fileStoreConfigured: boolean;
  photoUrl: string | null;
  /** Inventory says this Blok is empty of history, so "Hapus Blok" is offered. */
  bolehHapus: boolean;
  /** The longest reason the Audit Log keeps for a removed Blok. */
  alasanHapusMax: number;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"jenisMakam" | "renumber" | "kavling" | "bersihkan" | null>(null);
  const [pesan, setPesan] = useState<Pesan>(null);
  const [pending, startTransition] = useTransition();
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);

  const cellsById = useMemo(() => new Map(cells.map((cell) => [cell.id, cell])), [cells]);
  const kavlingById = useMemo(() => new Map(kavling.map((k) => [k.id, k])), [kavling]);
  const jenisMakamById = useMemo(() => new Map(jenisMakam.map((j) => [j.id, j])), [jenisMakam]);

  const gridCells: DenahGridCell[] = useMemo(
    () =>
      cells.map((cell) => ({
        id: cell.id,
        row: cell.row,
        col: cell.col,
        kind: cell.kind,
        label: cell.kind === "petak" ? shortLabel(cell.nomorMakam, blok.name) : namaJenisSel[cell.kind],
        status: cell.kind === "petak" ? gridStatus(cell.status) : undefined,
        perluVerifikasi: cell.perluVerifikasi,
        partOfKavling: Boolean(cell.kavlingId),
      })),
    [cells, blok.name],
  );

  const focused = focusedId ? (cellsById.get(focusedId) ?? null) : null;
  const focusedKavling = focused?.kavlingId ? kavlingById.get(focused.kavlingId) : undefined;
  /** A member of a Kavling Keluarga is "belum dibersihkan" the same way a lone Petak is: some cell of it is still Perlu Verifikasi. */
  const kavlingNeedsClearing = focusedKavling ? focusedKavling.cellIds.some((id) => cellsById.get(id)?.perluVerifikasi) : false;
  const needsClearing = focused?.kind === "petak" && (focusedKavling ? kavlingNeedsClearing : focused.perluVerifikasi);

  function run(action: () => Promise<{ ok: true; data: unknown } | { ok: false; message: string }>) {
    setPesan(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setPesan({ kind: "error", teks: result.message });
        return;
      }
      setSelected(new Set());
      setDialog(null);
      const note = skipNote(result.data);
      setPesan(note ? { kind: "info", teks: note } : null);
    });
  }

  return (
    <div className="flex flex-col gap-6 pb-24">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Denah" description="Susun Blok, Petak Makam, Jalan, Bukan Petak dan Kavling Keluarga sesuai kondisi di lapangan." />
      </div>

      <BlokTabs lokasiId={lokasiId} bloks={bloks} activeBlokId={blok.id} jenisMakam={jenisMakam} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <p className="text-title-3 text-foreground">Blok {blok.name}</p>
              <span title="Ganti nama Blok belum tersedia" className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground/50">
                <PencilLine className="size-3.5" aria-hidden />
              </span>
            </div>
            <div className="flex items-center gap-2">
              {bolehHapus ? <HapusBlokButton lokasiId={lokasiId} blokId={blok.id} blokName={blok.name} alasanMax={alasanHapusMax} /> : null}
              <ModeToggle mode={selectMode} onChange={setSelectMode} />
            </div>
          </div>

          {pesan ? (
            <div
              role="status"
              className={cn(
                "flex items-start gap-2 rounded-xl px-3 py-2.5 text-body",
                pesan.kind === "error" ? "bg-danger-soft text-danger-soft-foreground" : "bg-info-soft text-info-soft-foreground",
              )}
            >
              {pesan.kind === "error" ? <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />}
              <p className="flex-1">{pesan.teks}</p>
              <button type="button" onClick={() => setPesan(null)} aria-label="Tutup pesan" className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
          ) : null}

          <DenahGrid
            title={blok.name}
            rows={blok.rows}
            cols={blok.cols}
            cells={gridCells}
            selected={selected}
            onSelectedChange={setSelected}
            selectMode={selectMode}
            onTapCell={(cell) => setFocusedId(cell.id)}
            onAddEdge={(edge: DenahEdge) => run(() => addEdgeAction({ lokasiId, blokId: blok.id, edge }))}
          />

          <div className="lg:hidden">
            <DetailPanel
              blokName={blok.name}
              lokasiId={lokasiId}
              cell={focused}
              kavlingOf={focusedKavling}
              jenisMakamName={focused?.jenisMakamId ? jenisMakamById.get(focused.jenisMakamId)?.name : undefined}
              needsClearing={needsClearing}
              onClose={() => setFocusedId(null)}
              pending={pending}
              onRename={(nomor) => run(() => setSingleNumberAction({ lokasiId, blokId: blok.id, cellId: focused!.id, nomorMakam: nomor }))}
              onSplitKavling={(kavlingId) => run(() => splitKavlingAction({ lokasiId, blokId: blok.id, kavlingId }))}
              onBersihkan={() => setDialog("bersihkan")}
            />
          </div>

          <RemoveRowsOrColsPanel
            rows={blok.rows}
            cols={blok.cols}
            pending={pending}
            onRemove={(axis, index) => run(() => removeRowsOrColsAction({ lokasiId, blokId: blok.id, axis, indices: [index] }))}
          />

          <PhotoSection
            lokasiId={lokasiId}
            blokId={blok.id}
            blokName={blok.name}
            fileStoreConfigured={fileStoreConfigured}
            photoUrl={photoUrl}
            message={photoMessage}
            onMessage={setPhotoMessage}
          />
        </div>

        <aside className="flex flex-col gap-4">
          <div className="hidden lg:block">
            <DetailPanel
              blokName={blok.name}
              lokasiId={lokasiId}
              cell={focused}
              kavlingOf={focusedKavling}
              jenisMakamName={focused?.jenisMakamId ? jenisMakamById.get(focused.jenisMakamId)?.name : undefined}
              needsClearing={needsClearing}
              onClose={() => setFocusedId(null)}
              pending={pending}
              onRename={(nomor) => run(() => setSingleNumberAction({ lokasiId, blokId: blok.id, cellId: focused!.id, nomorMakam: nomor }))}
              onSplitKavling={(kavlingId) => run(() => splitKavlingAction({ lokasiId, blokId: blok.id, kavlingId }))}
              onBersihkan={() => setDialog("bersihkan")}
            />
          </div>
          <Summary blokName={blok.name} cells={cells} kavling={kavling} jenisMakam={jenisMakam} />
          <details className="rounded-2xl border border-border bg-card p-4">
            <summary className="cursor-pointer text-title-3 text-foreground marker:text-muted-foreground">Keterangan</summary>
            <div className="mt-3">
              <DenahLegend />
            </div>
          </details>
        </aside>
      </div>

      <ActionBar
        jumlah={selected.size}
        onJadikan={(kind) => run(() => setCellKindAction({ lokasiId, blokId: blok.id, cellIds: [...selected], kind }))}
        onAturJenis={() => setDialog("jenisMakam")}
        onBuatKavling={() => setDialog("kavling")}
        onUbahNomor={() => setDialog("renumber")}
        onBatal={() => setSelected(new Set())}
      />

      <AturJenisMakamDialog
        open={dialog === "jenisMakam"}
        onOpenChange={(open) => setDialog(open ? "jenisMakam" : null)}
        jenisMakam={jenisMakam}
        jumlah={selected.size}
        pending={pending}
        message={dialog === "jenisMakam" && pesan?.kind === "error" ? pesan.teks : null}
        onSubmit={(jenisMakamId) => run(() => setJenisMakamAction({ lokasiId, blokId: blok.id, cellIds: [...selected], jenisMakamId }))}
      />
      <KavlingDialog
        open={dialog === "kavling"}
        onOpenChange={(open) => setDialog(open ? "kavling" : null)}
        blokName={blok.name}
        jenisMakam={jenisMakam}
        jumlah={selected.size}
        pending={pending}
        message={dialog === "kavling" && pesan?.kind === "error" ? pesan.teks : null}
        onSubmit={(jenisMakamId, nomorKavling) => run(() => createKavlingAction({ lokasiId, blokId: blok.id, cellIds: [...selected], jenisMakamId, nomorKavling }))}
      />
      <UbahNomorDialog
        open={dialog === "renumber"}
        onOpenChange={(open) => setDialog(open ? "renumber" : null)}
        defaultPattern={blok.numberPattern}
        jumlah={selected.size}
        pending={pending}
        message={dialog === "renumber" && pesan?.kind === "error" ? pesan.teks : null}
        onSubmit={(pattern, startAt) => run(() => renumberCellsAction({ lokasiId, blokId: blok.id, cellIds: [...selected], pattern, startAt }))}
      />
      {focused ? (
        <ClearingDialog
          open={dialog === "bersihkan"}
          onOpenChange={(open) => setDialog(open ? "bersihkan" : null)}
          isKavling={Boolean(focusedKavling)}
          pending={pending}
          message={dialog === "bersihkan" && pesan?.kind === "error" ? pesan.teks : null}
          onSubmit={(clearingInput) =>
            focusedKavling
              ? run(() => clearKavlingAction({ lokasiId, blokId: blok.id, kavlingId: focusedKavling.id, input: clearingInput as never }))
              : run(() => clearPetakAction({ lokasiId, blokId: blok.id, petakId: focused.id, input: clearingInput as never }))
          }
        />
      ) : null}
    </div>
  );
}

/** The shared Denah grid only colours the four statuses CONTEXT.md lists; Masa Berlaku Habis reads as Terisi there until it gets its own colour. */
function gridStatus(status: DenahCell["status"]): DenahCellStatus {
  return status === "masa_berlaku_habis" ? "terisi" : status;
}

/** The Nomor Makam without the Blok's name prefix, so a cell's label stays short. */
function shortLabel(nomorMakam: string | null, blokName: string): string {
  if (!nomorMakam) return "";
  const withoutPrefix = nomorMakam.slice(blokName.length).replace(/^-/, "");
  return withoutPrefix || nomorMakam;
}
