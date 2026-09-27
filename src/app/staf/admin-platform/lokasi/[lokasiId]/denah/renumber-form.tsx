"use client";

import { useState, useTransition } from "react";
import { findPetakAction, renumberPetakAction } from "./actions";

/** Admin Platform renumbers a Petak Makam: find it by its current (or an earlier) Nomor Makam, then give it a new one (spec, story 169). */
export function RenumberPetakForm({ lokasiId }: { lokasiId: string }) {
  const [nomorMakam, setNomorMakam] = useState("");
  const [found, setFound] = useState<{ petakId: string; nomorMakam: string } | null>(null);
  const [nomorMakamBaru, setNomorMakamBaru] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function cari() {
    setMessage(null);
    setFound(null);
    startTransition(async () => {
      const result = await findPetakAction({ lokasiId, nomorMakam });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setFound({ petakId: result.petakId, nomorMakam: result.nomorMakam });
      setNomorMakamBaru(result.nomorMakam);
    });
  }

  function simpan() {
    if (!found) return;
    setMessage(null);
    startTransition(async () => {
      const result = await renumberPetakAction({ lokasiId, petakId: found.petakId, nomorMakamBaru });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setMessage(`Nomor diubah menjadi ${result.nomorMakam}.`);
      setFound({ petakId: found.petakId, nomorMakam: result.nomorMakam });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-small text-muted-foreground">
        Cari Petak dengan nomor sekarang (nomor lama yang pernah diganti juga tetap ditemukan, tapi tidak pernah
        ditampilkan).
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          Nomor Makam
          <input value={nomorMakam} onChange={(event) => setNomorMakam(event.target.value)} className="h-10 w-40 rounded-lg border border-border-strong bg-card px-3" />
        </label>
        <button type="button" disabled={pending || !nomorMakam.trim()} onClick={cari} className="h-10 rounded-lg border border-border-strong px-3 text-sm hover:bg-accent">
          Cari
        </button>
      </div>
      {found ? (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3">
          <p className="w-full text-sm text-muted-foreground">Nomor sekarang: {found.nomorMakam}</p>
          <label className="flex flex-col gap-1 text-sm">
            Nomor Makam baru
            <input value={nomorMakamBaru} onChange={(event) => setNomorMakamBaru(event.target.value)} className="h-10 w-40 rounded-lg border border-border-strong bg-card px-3" />
          </label>
          <button
            type="button"
            disabled={pending || !nomorMakamBaru.trim()}
            onClick={simpan}
            className="h-10 rounded-lg bg-forest px-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            Simpan nomor baru
          </button>
        </div>
      ) : null}
      {message ? <p className="text-sm text-destructive">{message}</p> : null}
    </div>
  );
}
