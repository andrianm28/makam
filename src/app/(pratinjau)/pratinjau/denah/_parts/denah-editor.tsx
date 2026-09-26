"use client";

/*
 * PROTOTYPE, throwaway. Wires the Denah editor together: Blok tabs, the
 * grid, bulk actions, dialogs, the detail panel and the per-Blok summary.
 * Mock data lives in client state only (`./model`); nothing is saved.
 */
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Images, PencilLine, Plus, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/makam/page-header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ActionBar, ModeToggle } from "./action-bar";
import { AturJenisMakamDialog, KavlingDialog, NewBlokDialog, UbahNomorDialog } from "./dialogs";
import { BlokGrid, Legend } from "./grid";
import {
  type Blok,
  type BlokBaruInput,
  type JenisSel,
  type Lokasi,
  type Sel,
  type Tepi,
  aturJenisMakam,
  buatBlok,
  buatKavling,
  gantiNamaBlok,
  hapusBarisKolom,
  lokasiBerisi,
  lokasiKosong,
  namaBlok,
  pisahkanKavling,
  tambahTepi,
  ubahJenisSel,
  ubahNomor,
} from "./model";
import { DetailPanel, FotoStub, Summary } from "./panels";

type Pesan = { kind: "info" | "error"; teks: string } | null;

export function DenahEditor() {
  const [contoh, setContoh] = useState<"kosong" | "berisi">("berisi");
  const [lokasi, setLokasi] = useState<Lokasi>(() => lokasiBerisi());
  const [blokId, setBlokId] = useState<string | null>(lokasi.bloks[0]?.id ?? null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"lihat" | "pilih">("lihat");
  const [fokusId, setFokusId] = useState<string | null>(null);
  const [pesan, setPesan] = useState<Pesan>(null);
  const [dialog, setDialog] = useState<null | "blok" | "jenis" | "kavling" | "nomor">(null);
  const [renameOpen, setRenameOpen] = useState(false);

  const blok = lokasi.bloks.find((b) => b.id === blokId) ?? null;

  function gantiContoh(v: "kosong" | "berisi") {
    setContoh(v);
    const l = v === "kosong" ? lokasiKosong() : lokasiBerisi();
    setLokasi(l);
    setBlokId(l.bloks[0]?.id ?? null);
    setSelected(new Set());
    setFokusId(null);
    setPesan(null);
    setMode("lihat");
  }

  function updateBlok(next: Blok) {
    setLokasi((l) => ({ ...l, bloks: l.bloks.map((b) => (b.id === next.id ? next : b)) }));
  }

  function hasil<T>(r: { ok: true; nilai: T; catatan?: string } | { ok: false; alasan: string }, onOk: (nilai: T) => void) {
    if (r.ok) {
      onOk(r.nilai);
      setSelected(new Set());
      setPesan(r.catatan ? { kind: "info", teks: r.catatan } : null);
    } else {
      setPesan({ kind: "error", teks: r.alasan });
    }
  }

  function handleCreateBlok(input: BlokBaruInput) {
    const b = buatBlok(lokasi, input);
    setLokasi((l) => ({ ...l, bloks: [...l.bloks, b] }));
    setBlokId(b.id);
    setSelected(new Set());
    setPesan(null);
  }

  function handleJadikan(jenis: JenisSel) {
    if (!blok) return;
    hasil(ubahJenisSel(lokasi, blok, [...selected], jenis), updateBlok);
  }

  function handleAturJenis(jenisMakam: string) {
    if (!blok) return;
    hasil(aturJenisMakam(blok, [...selected], jenisMakam), updateBlok);
  }

  function handleBuatKavling(nomor: string, jenisMakam: string) {
    if (!blok) return;
    hasil(buatKavling(lokasi, blok, [...selected], nomor, jenisMakam), updateBlok);
  }

  function handleUbahNomor(pola: string, mulai: number) {
    if (!blok) return;
    hasil(ubahNomor(lokasi, blok, [...selected], pola, mulai), updateBlok);
  }

  function handleAddEdge(tepi: Tepi) {
    if (!blok) return;
    const r = tambahTepi(lokasi, blok, tepi);
    if (r.ok) updateBlok(r.nilai);
  }

  function handleHapus(arah: "baris" | "kolom", indeks: number) {
    if (!blok) return;
    const r = hapusBarisKolom(blok, arah, [indeks]);
    if (r.ok) {
      updateBlok(r.nilai);
      setSelected(new Set());
      setPesan(null);
    } else {
      setPesan({ kind: "error", teks: r.alasan });
    }
  }

  function handlePisahkanKavling(nomor: string) {
    if (!blok) return;
    const r = pisahkanKavling(blok, nomor);
    if (r.ok) {
      updateBlok(r.nilai);
      setPesan(null);
    } else {
      setPesan({ kind: "error", teks: r.alasan });
    }
  }

  const fokusSel: Sel | null = blok && fokusId ? (blok.grid.flat().find((s) => s.id === fokusId) ?? null) : null;

  return (
    <div className="flex flex-col gap-6 pb-24">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Denah" description="Susun Blok, Petak Makam, Jalan, Bukan Petak dan Kavling Keluarga sesuai kondisi di lapangan." />
        <label className="flex items-center gap-2 text-small text-muted-foreground">
          Contoh
          <select
            value={contoh}
            onChange={(e) => gantiContoh(e.target.value as "kosong" | "berisi")}
            className="h-9 rounded-lg border border-input bg-card px-2 text-small text-foreground"
          >
            <option value="berisi">Lokasi berisi</option>
            <option value="kosong">Lokasi kosong</option>
          </select>
        </label>
      </div>

      {lokasi.bloks.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border-strong bg-card px-6 py-16 text-center">
          <Images className="size-8 text-muted-foreground" aria-hidden />
          <div>
            <p className="text-title-3 text-foreground">Belum ada Blok di Lokasi ini</p>
            <p className="mt-1 max-w-sm text-body text-muted-foreground">Buat Blok pertama untuk mulai menggambar Denah: Petak Makam, Jalan, Bukan Petak, dan Kavling Keluarga.</p>
          </div>
          <Button onClick={() => setDialog("blok")}>
            <Plus className="size-4" aria-hidden /> Buat Blok
          </Button>
        </div>
      ) : (
        <>
          <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Blok">
            {lokasi.bloks.map((b) => (
              <button
                key={b.id}
                type="button"
                role="tab"
                aria-selected={b.id === blokId}
                onClick={() => {
                  setBlokId(b.id);
                  setSelected(new Set());
                  setFokusId(null);
                  setPesan(null);
                }}
                className={cn(
                  "inline-flex h-11 shrink-0 items-center rounded-xl border px-4 text-body font-medium",
                  b.id === blokId ? "border-forest bg-forest text-primary-foreground" : "border-border-strong bg-card hover:bg-accent",
                )}
              >
                {namaBlok(b)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setDialog("blok")}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-dashed border-border-strong px-4 text-body font-medium text-muted-foreground hover:border-forest hover:text-forest"
            >
              <Plus className="size-4" aria-hidden /> Blok baru
            </button>
          </div>

          {blok ? (
            <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
              <div className="flex min-w-0 flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <p className="text-title-3 text-foreground">{namaBlok(blok)}</p>
                    <button type="button" onClick={() => setRenameOpen(true)} aria-label="Ganti nama Blok" className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent">
                      <PencilLine className="size-3.5" aria-hidden />
                    </button>
                  </div>
                  <ModeToggle mode={mode} onChange={setMode} />
                </div>

                {renameOpen ? <RenameBlok lokasi={lokasi} blok={blok} onClose={() => setRenameOpen(false)} onSave={updateBlok} /> : null}

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

                <BlokGrid
                  blok={blok}
                  selected={selected}
                  onSelectedChange={setSelected}
                  mode={mode}
                  onTapCell={(s) => setFokusId(s.id)}
                  fokusId={fokusId}
                  onAddEdge={(tepi) => handleAddEdge(tepi)}
                />

                <div className="lg:hidden">
                  <DetailPanel lokasi={lokasi} blok={blok} sel={fokusSel} onClose={() => setFokusId(null)} onPisahkanKavling={handlePisahkanKavling} />
                </div>

                <details className="rounded-2xl border border-border bg-card p-4">
                  <summary className="cursor-pointer text-title-3 text-foreground marker:text-muted-foreground">Hapus baris atau kolom</summary>
                  <p className="mt-1 text-small text-muted-foreground">Hanya baris atau kolom yang tak satu pun Petaknya pernah dipakai bisa dihapus.</p>
                  <div className="mt-3 flex flex-col gap-3">
                    <div>
                      <p className="text-small font-medium text-foreground">Baris</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {blok.grid.map((_, r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => handleHapus("baris", r)}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-border-strong bg-card px-2 text-caption text-muted-foreground hover:border-danger hover:text-danger"
                          >
                            <Trash2 className="size-3" aria-hidden /> {r + 1}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-small font-medium text-foreground">Kolom</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {(blok.grid[0] ?? []).map((_, c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => handleHapus("kolom", c)}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-border-strong bg-card px-2 text-caption text-muted-foreground hover:border-danger hover:text-danger"
                          >
                            <Trash2 className="size-3" aria-hidden /> {c + 1}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </details>

                <FotoStub blok={blok} />
              </div>

              <aside className="flex flex-col gap-4">
                <div className="hidden lg:block">
                  <DetailPanel lokasi={lokasi} blok={blok} sel={fokusSel} onClose={() => setFokusId(null)} onPisahkanKavling={handlePisahkanKavling} />
                </div>
                <Summary lokasi={lokasi} blok={blok} />
                <details className="rounded-2xl border border-border bg-card p-4">
                  <summary className="cursor-pointer text-title-3 text-foreground marker:text-muted-foreground">Keterangan</summary>
                  <div className="mt-3">
                    <Legend />
                  </div>
                </details>
              </aside>
            </div>
          ) : null}
        </>
      )}

      <ActionBar
        jumlah={selected.size}
        onJadikan={handleJadikan}
        onAturJenis={() => setDialog("jenis")}
        onBuatKavling={() => setDialog("kavling")}
        onUbahNomor={() => setDialog("nomor")}
        onBatal={() => setSelected(new Set())}
      />

      <NewBlokDialog open={dialog === "blok"} onOpenChange={(v) => setDialog(v ? "blok" : null)} lokasi={lokasi} onCreate={handleCreateBlok} />
      {blok ? (
        <>
          <AturJenisMakamDialog open={dialog === "jenis"} onOpenChange={(v) => setDialog(v ? "jenis" : null)} lokasi={lokasi} jumlah={selected.size} onSubmit={handleAturJenis} />
          <KavlingDialog open={dialog === "kavling"} onOpenChange={(v) => setDialog(v ? "kavling" : null)} lokasi={lokasi} blok={blok} ids={[...selected]} onSubmit={handleBuatKavling} />
          <UbahNomorDialog open={dialog === "nomor"} onOpenChange={(v) => setDialog(v ? "nomor" : null)} blok={blok} jumlah={selected.size} onSubmit={handleUbahNomor} />
        </>
      ) : null}
    </div>
  );
}

function RenameBlok({ lokasi, blok, onClose, onSave }: { lokasi: Lokasi; blok: Blok; onClose: () => void; onSave: (b: Blok) => void }) {
  const [nama, setNama] = useState(blok.nama);
  const [err, setErr] = useState<string | undefined>();
  return (
    <form
      className="flex items-center gap-2 rounded-xl border border-border bg-card p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        const r = gantiNamaBlok(lokasi, blok, nama);
        if (r.ok) {
          onSave(r.nilai);
          onClose();
        } else setErr(r.alasan);
      }}
    >
      <input autoFocus value={nama} onChange={(e) => setNama(e.target.value)} className="h-9 flex-1 rounded-lg border border-input bg-card px-2.5 text-body text-foreground" />
      <button type="submit" className="h-9 rounded-lg bg-forest px-3 text-small font-medium text-primary-foreground">
        Simpan
      </button>
      <button type="button" onClick={onClose} className="h-9 rounded-lg px-3 text-small text-muted-foreground hover:bg-accent">
        Batal
      </button>
      {err ? <p className="text-small text-danger">{err}</p> : null}
    </form>
  );
}
