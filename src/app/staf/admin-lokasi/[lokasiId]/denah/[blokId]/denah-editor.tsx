"use client";

import { useMemo, useState, useTransition } from "react";
import { Hash, Layers, LogIn, MousePointerSquareDashed, Route, TreePine, Users, X } from "lucide-react";
import { DenahGrid, DenahLegend, type DenahCellStatus, type DenahEdge, type DenahGridCell } from "@/components/denah/grid";
import type { DenahCell, DenahKavling } from "@/domain/inventory";
import { cn } from "@/lib/utils";
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
  uploadBlokPhotoAction,
} from "./actions";

interface JenisMakamOption {
  id: string;
  name: string;
}

/** What a cell that is not a Petak Makam is called, in the editor's own words (CONTEXT.md). */
const namaJenisSel = {
  jalan: "Jalan",
  bukan_petak: "Bukan Petak",
  pintu_masuk: "Pintu Masuk",
} as const;

interface BlokInfo {
  id: string;
  name: string;
  rows: number;
  cols: number;
  numberPattern: string;
}

export function DenahEditor({
  lokasiId,
  blok,
  cells,
  kavling,
  jenisMakam,
  fileStoreConfigured,
  photoUrl,
}: {
  lokasiId: string;
  blok: BlokInfo;
  cells: DenahCell[];
  kavling: DenahKavling[];
  jenisMakam: JenisMakamOption[];
  fileStoreConfigured: boolean;
  photoUrl: string | null;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"jenisMakam" | "renumber" | "kavling" | "hapusBarisKolom" | "bersihkan" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

  function run<T>(action: () => Promise<{ ok: true; data: T } | { ok: false; message: string }>, onOk?: (data: T) => void) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setSelected(new Set());
      setDialog(null);
      onOk?.(result.data);
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
      <div className="flex flex-col gap-3">
        {message ? (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {message}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <ModeToggle mode={selectMode} onChange={setSelectMode} />
          <button
            type="button"
            onClick={() => setDialog(dialog === "hapusBarisKolom" ? null : "hapusBarisKolom")}
            className="inline-flex h-10 items-center rounded-lg border border-border-strong bg-card px-3 text-sm font-medium hover:bg-accent"
          >
            Hapus baris/kolom
          </button>
        </div>
        {dialog === "hapusBarisKolom" ? (
          <RemoveRowsOrColsPanel
            rows={blok.rows}
            cols={blok.cols}
            pending={pending}
            onSubmit={(axis, indices) =>
              run(() => removeRowsOrColsAction({ lokasiId, blokId: blok.id, axis, indices }))
            }
          />
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
        <PhotoSection lokasiId={lokasiId} blokId={blok.id} fileStoreConfigured={fileStoreConfigured} photoUrl={photoUrl} />
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-title-3 text-foreground">Legenda</p>
          <div className="mt-2">
            <DenahLegend />
          </div>
        </div>
        <DetailPanel
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

      {selected.size > 0 ? (
        <ActionBar
          jumlah={selected.size}
          onJadikan={(kind) => run(() => setCellKindAction({ lokasiId, blokId: blok.id, cellIds: [...selected], kind }))}
          onAturJenis={() => setDialog("jenisMakam")}
          onBuatKavling={() => setDialog("kavling")}
          onUbahNomor={() => setDialog("renumber")}
          onBatal={() => setSelected(new Set())}
        />
      ) : null}

      {dialog === "jenisMakam" ? (
        <JenisMakamDialog
          jenisMakam={jenisMakam}
          pending={pending}
          onCancel={() => setDialog(null)}
          onSubmit={(jenisMakamId) => run(() => setJenisMakamAction({ lokasiId, blokId: blok.id, cellIds: [...selected], jenisMakamId }))}
        />
      ) : null}
      {dialog === "renumber" ? (
        <RenumberDialog
          defaultPattern={blok.numberPattern}
          pending={pending}
          onCancel={() => setDialog(null)}
          onSubmit={(pattern, startAt) => run(() => renumberCellsAction({ lokasiId, blokId: blok.id, cellIds: [...selected], pattern, startAt }))}
        />
      ) : null}
      {dialog === "kavling" ? (
        <KavlingDialog
          jenisMakam={jenisMakam}
          pending={pending}
          onCancel={() => setDialog(null)}
          onSubmit={(jenisMakamId, nomorKavling) =>
            run(() => createKavlingAction({ lokasiId, blokId: blok.id, cellIds: [...selected], jenisMakamId, nomorKavling }))
          }
        />
      ) : null}
      {dialog === "bersihkan" && focused ? (
        <ClearingDialog
          isKavling={Boolean(focusedKavling)}
          pending={pending}
          onCancel={() => setDialog(null)}
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

function ModeToggle({ mode, onChange }: { mode: boolean; onChange: (mode: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!mode)}
      aria-pressed={mode}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium lg:hidden",
        mode ? "border-forest bg-forest text-primary-foreground" : "border-border-strong bg-card text-foreground hover:bg-accent",
      )}
    >
      <MousePointerSquareDashed className="size-4" aria-hidden />
      {mode ? "Mode pilih aktif" : "Pilih sel"}
    </button>
  );
}

function ActionBar({
  jumlah,
  onJadikan,
  onAturJenis,
  onBuatKavling,
  onUbahNomor,
  onBatal,
}: {
  jumlah: number;
  onJadikan: (kind: "petak" | "jalan" | "bukan_petak" | "pintu_masuk") => void;
  onAturJenis: () => void;
  onBuatKavling: () => void;
  onUbahNomor: () => void;
  onBatal: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 p-3 backdrop-blur-md lg:sticky lg:bottom-3 lg:rounded-2xl lg:border lg:shadow-lg">
      <div className="mx-auto flex max-w-(--page-max-width) flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground">{jumlah} sel dipilih</p>
          <button type="button" onClick={onBatal} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground hover:bg-accent">
            <X className="size-3.5" aria-hidden /> Batalkan pilihan
          </button>
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
          <ActionButton icon={Route} label="Jadikan Jalan" onClick={() => onJadikan("jalan")} />
          <ActionButton icon={TreePine} label="Jadikan Bukan Petak" onClick={() => onJadikan("bukan_petak")} />
          <ActionButton icon={LogIn} label="Jadikan Pintu Masuk" onClick={() => onJadikan("pintu_masuk")} />
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
      className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-border-strong bg-card px-3.5 text-sm font-medium text-foreground hover:border-forest hover:bg-brand-soft"
    >
      <Icon className="size-4" aria-hidden /> {label}
    </button>
  );
}

function DetailPanel({
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
      <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Ketuk satu sel untuk melihat detailnya.
      </div>
    );
  }
  if (cell.kind !== "petak") {
    return (
      <div className="relative rounded-2xl border border-border bg-card p-4">
        <button type="button" onClick={onClose} aria-label="Tutup detail" className="absolute top-2 right-2 inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent">
          <X className="size-4" />
        </button>
        <p className="text-title-3 text-foreground">{namaJenisSel[cell.kind]}</p>
        {cell.kind === "pintu_masuk" ? <p className="mt-1 text-sm text-muted-foreground">Petak yang belum dipakai bisa dijadikan Pintu Masuk, dan sebaliknya. Petak yang sedang dipesan tidak bisa, sampai pesanannya selesai atau tidak jadi.</p> : null}
      </div>
    );
  }
  return (
    <div className="relative flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <button type="button" onClick={onClose} aria-label="Tutup detail" className="absolute top-2 right-2 inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent">
        <X className="size-4" />
      </button>
      <div className="pr-8">
        <p className="font-mono text-title-2 text-foreground">{cell.nomorMakam}</p>
        <p className="text-sm text-muted-foreground">
          {jenisMakamName ?? "Jenis Makam belum diatur"}
          {kavlingOf ? ` · Kavling Keluarga ${kavlingOf.nomorKavling}` : ""}
        </p>
      </div>
      {needsClearing ? (
        <div className="flex flex-col gap-2 rounded-lg bg-warning-soft px-2.5 py-2 text-sm text-warning-soft-foreground">
          <p>Perlu Verifikasi: belum dibersihkan, jadi belum bisa ditugaskan atau dijual.</p>
          <button type="button" onClick={onBersihkan} className="self-start rounded-lg bg-forest px-3 py-1.5 text-xs font-semibold text-primary-foreground">
            Bersihkan {kavlingOf ? "Kavling Keluarga" : "Petak"}
          </button>
        </div>
      ) : null}
      {cell.usedForever ? (
        <p className="text-sm text-muted-foreground">Punya Hak Pakai atau Pemakaman: tidak bisa dihapus, dipindah, atau diganti jenisnya.</p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onRename(nomor);
          }}
          className="flex items-center gap-2"
        >
          <input value={nomor} onChange={(event) => setNomor(event.target.value)} className="h-9 w-32 rounded-lg border border-border-strong bg-card px-2 text-sm" />
          <button type="submit" disabled={pending} className="h-9 rounded-lg border border-border-strong px-3 text-sm hover:bg-accent">
            Simpan nomor
          </button>
        </form>
      )}
      {kavlingOf && !cell.usedForever ? (
        <button type="button" onClick={() => onSplitKavling(kavlingOf.id)} disabled={pending} className="self-start text-sm font-semibold text-forest underline underline-offset-2">
          Pisahkan dari Kavling Keluarga {kavlingOf.nomorKavling}
        </button>
      ) : null}
    </div>
  );
}

function JenisMakamDialog({
  jenisMakam,
  pending,
  onCancel,
  onSubmit,
}: {
  jenisMakam: JenisMakamOption[];
  pending: boolean;
  onCancel: () => void;
  onSubmit: (jenisMakamId: string) => void;
}) {
  const [value, setValue] = useState(jenisMakam[0]?.id ?? "");
  return (
    <DialogPanel title="Atur Jenis Makam" onCancel={onCancel}>
      <select value={value} onChange={(event) => setValue(event.target.value)} className="h-10 rounded-lg border border-border-strong bg-card px-3 text-sm">
        {jenisMakam.map((jenis) => (
          <option key={jenis.id} value={jenis.id}>
            {jenis.name}
          </option>
        ))}
      </select>
      <DialogActions pending={pending} onCancel={onCancel} onSubmit={() => onSubmit(value)} />
    </DialogPanel>
  );
}

function RenumberDialog({
  defaultPattern,
  pending,
  onCancel,
  onSubmit,
}: {
  defaultPattern: string;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (pattern: string, startAt: number) => void;
}) {
  const [pattern, setPattern] = useState(defaultPattern);
  const [startAt, setStartAt] = useState(1);
  return (
    <DialogPanel title="Ubah nomor" onCancel={onCancel}>
      <label className="flex flex-col gap-1 text-sm">
        Pola
        <input value={pattern} onChange={(event) => setPattern(event.target.value)} className="h-10 rounded-lg border border-border-strong bg-card px-3" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Mulai dari nomor
        <input type="number" min={1} value={startAt} onChange={(event) => setStartAt(Number(event.target.value))} className="h-10 rounded-lg border border-border-strong bg-card px-3" />
      </label>
      <DialogActions pending={pending} onCancel={onCancel} onSubmit={() => onSubmit(pattern, startAt)} />
    </DialogPanel>
  );
}

function KavlingDialog({
  jenisMakam,
  pending,
  onCancel,
  onSubmit,
}: {
  jenisMakam: JenisMakamOption[];
  pending: boolean;
  onCancel: () => void;
  onSubmit: (jenisMakamId: string, nomorKavling: string | undefined) => void;
}) {
  const [jenisMakamId, setJenisMakamId] = useState(jenisMakam[0]?.id ?? "");
  const [nomorKavling, setNomorKavling] = useState("");
  return (
    <DialogPanel title="Buat Kavling Keluarga" onCancel={onCancel}>
      <label className="flex flex-col gap-1 text-sm">
        Jenis Makam
        <select value={jenisMakamId} onChange={(event) => setJenisMakamId(event.target.value)} className="h-10 rounded-lg border border-border-strong bg-card px-3">
          {jenisMakam.map((jenis) => (
            <option key={jenis.id} value={jenis.id}>
              {jenis.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Nomor Kavling (kosongkan untuk otomatis)
        <input value={nomorKavling} onChange={(event) => setNomorKavling(event.target.value)} className="h-10 rounded-lg border border-border-strong bg-card px-3" />
      </label>
      <DialogActions pending={pending} onCancel={onCancel} onSubmit={() => onSubmit(jenisMakamId, nomorKavling || undefined)} />
    </DialogPanel>
  );
}

/** The clearing flow (story 128): Tersedia, Tidak Tersedia with a reason, or occupied (a minimal Hak Pakai / Almarhum, or "data menyusul"). */
function ClearingDialog({
  isKavling,
  pending,
  onCancel,
  onSubmit,
}: {
  isKavling: boolean;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (input: unknown) => void;
}) {
  const [mode, setMode] = useState<"tersedia" | "tidak_tersedia" | "terisi">("tersedia");
  const [reason, setReason] = useState("");
  const [dataMenyusul, setDataMenyusul] = useState(false);
  const [pemegangHakName, setPemegangHakName] = useState("");
  const [pemegangHakPhone, setPemegangHakPhone] = useState("");
  const [pemegangHakEmail, setPemegangHakEmail] = useState("");
  const [almarhumName, setAlmarhumName] = useState("");
  const [almarhumDate, setAlmarhumDate] = useState("");

  function submit() {
    if (mode === "tersedia") return onSubmit({ mode: "tersedia" });
    if (mode === "tidak_tersedia") return onSubmit({ mode: "tidak_tersedia", reason });
    const pemegangHak = dataMenyusul || !pemegangHakName ? undefined : { name: pemegangHakName, phoneNumber: pemegangHakPhone, email: pemegangHakEmail || undefined };
    // A Kavling's first Pemakaman must name which member Petak it is at; that picker isn't built here yet, so record it separately later.
    const pemakaman = !isKavling && almarhumName && almarhumDate ? { almarhumName, date: almarhumDate } : undefined;
    onSubmit({ mode: "terisi", dataMenyusul, pemegangHak, pemakaman });
  }

  return (
    <DialogPanel title="Bersihkan" onCancel={onCancel}>
      <div className="flex flex-col gap-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === "tersedia"} onChange={() => setMode("tersedia")} /> Tersedia
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === "tidak_tersedia"} onChange={() => setMode("tidak_tersedia")} /> Tidak Tersedia
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === "terisi"} onChange={() => setMode("terisi")} /> Sudah terisi (ada Hak Pakai)
        </label>
      </div>
      {mode === "tidak_tersedia" ? (
        <label className="flex flex-col gap-1 text-sm">
          Alasan
          <input value={reason} onChange={(event) => setReason(event.target.value)} className="h-10 rounded-lg border border-border-strong bg-card px-3" />
        </label>
      ) : null}
      {mode === "terisi" ? (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={dataMenyusul} onChange={(event) => setDataMenyusul(event.target.checked)} /> Perlu Verifikasi
          </label>
          {!dataMenyusul ? (
            <>
              <label className="flex flex-col gap-1 text-sm">
                Nama Pemegang Hak
                <input value={pemegangHakName} onChange={(event) => setPemegangHakName(event.target.value)} className="h-10 rounded-lg border border-border-strong bg-card px-3" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Nomor telepon Pemegang Hak
                <input value={pemegangHakPhone} onChange={(event) => setPemegangHakPhone(event.target.value)} className="h-10 rounded-lg border border-border-strong bg-card px-3" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Email Pemegang Hak (jika diketahui)
                <input value={pemegangHakEmail} onChange={(event) => setPemegangHakEmail(event.target.value)} className="h-10 rounded-lg border border-border-strong bg-card px-3" />
              </label>
            </>
          ) : null}
          {!isKavling ? (
            <>
              <p className="text-sm text-muted-foreground">Isi data Almarhum jika sudah diketahui (boleh dikosongkan).</p>
              <label className="flex flex-col gap-1 text-sm">
                Nama Almarhum
                <input value={almarhumName} onChange={(event) => setAlmarhumName(event.target.value)} className="h-10 rounded-lg border border-border-strong bg-card px-3" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Tanggal pemakaman
                <input type="date" value={almarhumDate} onChange={(event) => setAlmarhumDate(event.target.value)} className="h-10 rounded-lg border border-border-strong bg-card px-3" />
              </label>
            </>
          ) : null}
        </div>
      ) : null}
      <DialogActions pending={pending} onCancel={onCancel} onSubmit={submit} />
    </DialogPanel>
  );
}

function RemoveRowsOrColsPanel({
  rows,
  cols,
  pending,
  onSubmit,
}: {
  rows: number;
  cols: number;
  pending: boolean;
  onSubmit: (axis: "baris" | "kolom", indices: number[]) => void;
}) {
  const [axis, setAxis] = useState<"baris" | "kolom">("baris");
  const [indices, setIndices] = useState<number[]>([]);
  const count = axis === "baris" ? rows : cols;
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 text-sm">
      <p className="text-muted-foreground">Hapus hanya berhasil jika tidak ada Petak yang pernah dipakai atau bagian Kavling Keluarga di baris/kolom itu.</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          Arah
          <select
            value={axis}
            onChange={(event) => {
              setAxis(event.target.value as "baris" | "kolom");
              setIndices([]);
            }}
            className="h-9 rounded-lg border border-border-strong bg-card px-2"
          >
            <option value="baris">Baris</option>
            <option value="kolom">Kolom</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Nomor (bisa lebih dari satu)
          <select
            multiple
            value={indices.map(String)}
            onChange={(event) => setIndices([...event.target.selectedOptions].map((option) => Number(option.value)))}
            className="h-24 min-w-24 rounded-lg border border-border-strong bg-card px-2"
          >
            {Array.from({ length: count }, (_, i) => (
              <option key={i} value={i}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={pending || indices.length === 0}
          onClick={() => onSubmit(axis, indices)}
          className="h-9 rounded-lg bg-forest px-3 text-primary-foreground disabled:opacity-60"
        >
          Hapus
        </button>
      </div>
    </div>
  );
}

function DialogPanel({ title, onCancel, children }: { title: string; onCancel: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-overlay p-3 lg:items-center" role="dialog" aria-label={title}>
      <div className="flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <p className="text-title-3 text-foreground">{title}</p>
          <button type="button" onClick={onCancel} aria-label="Tutup" className="inline-flex size-8 items-center justify-center rounded-lg hover:bg-accent">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function DialogActions({ pending, onCancel, onSubmit }: { pending: boolean; onCancel: () => void; onSubmit: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <button type="button" onClick={onCancel} className="h-9 rounded-lg px-3 text-sm hover:bg-accent">
        Batal
      </button>
      <button type="button" disabled={pending} onClick={onSubmit} className="h-9 rounded-lg bg-forest px-3 text-sm text-primary-foreground disabled:opacity-60">
        {pending ? "Menyimpan…" : "Simpan"}
      </button>
    </div>
  );
}

function PhotoSection({
  lokasiId,
  blokId,
  fileStoreConfigured,
  photoUrl,
}: {
  lokasiId: string;
  blokId: string;
  fileStoreConfigured: boolean;
  photoUrl: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  if (!fileStoreConfigured) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border-strong bg-card p-6 text-center">
        <p className="text-sm font-medium text-foreground">Unggah foto belum tersedia</p>
        <p className="text-sm text-muted-foreground">Foto denah untuk Blok ini akan bisa diunggah setelah penyimpanan berkas siap.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
      <p className="text-title-3 text-foreground">Foto denah</p>
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt={`Foto denah Blok ${blokId}`} className="max-h-80 w-full rounded-lg object-contain" />
      ) : (
        <p className="text-sm text-muted-foreground">Belum ada foto.</p>
      )}
      {message ? <p className="text-sm text-destructive">{message}</p> : null}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setMessage(null);
          startTransition(async () => {
            const formData = new FormData();
            formData.set("lokasiId", lokasiId);
            formData.set("blokId", blokId);
            formData.set("file", file);
            const result = await uploadBlokPhotoAction(formData);
            if (!result.ok) setMessage(result.message);
          });
        }}
        disabled={pending}
        className="text-sm"
      />
    </div>
  );
}
