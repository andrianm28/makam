"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TumpangPanel } from "@/lib/tumpang-panel";
import { catatKonsenTumpangAction, konfirmasiTumpangAction, type TumpangActionState } from "./tumpang-actions";

const idle: TumpangActionState = { status: "idle" };

function Pesan({ state }: { state: TumpangActionState }) {
  if (state.status === "idle") return null;
  return (
    <p role={state.status === "gagal" ? "alert" : "status"} className="text-caption text-muted-foreground">
      {state.message}
    </p>
  );
}

/** The warning banner, the consent state, the forms to log verbal consent or heirship proof, and the confirmation (ticket 35). */
export function TumpangPanelView({ lokasiId, nomor, panel, pemakamanAwal }: { lokasiId: string; nomor: string; panel: TumpangPanel; pemakamanAwal: string }) {
  const [konsenState, konsenAction, konsenPending] = useActionState(catatKonsenTumpangAction, idle);
  const [konfirmasiState, konfirmasiAction, konfirmasiPending] = useActionState(konfirmasiTumpangAction, idle);
  return (
    <div className="flex flex-col gap-4">
      {panel.peringatan.map((teks) => (
        <p key={teks} role="alert" className="rounded-lg bg-warning-soft p-3 text-body text-warning-soft-foreground">
          {teks}
        </p>
      ))}
      <p data-testid="konsen-tumpang" className="text-body">
        <span className="font-medium">Persetujuan Pemegang Hak:</span> {panel.konsenLabel}
      </p>
      {panel.pengingatGanti ? <p className="rounded-lg bg-info-soft p-3 text-body text-info-soft-foreground">{panel.pengingatGanti}</p> : null}

      {panel.bisaCatatKonsen ? (
        <form action={konsenAction} className="flex flex-col gap-3">
          <input type="hidden" name="lokasiId" value={lokasiId} />
          <input type="hidden" name="nomor" value={nomor} />
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Catat persetujuan</legend>
            <label className="flex items-center gap-2 text-body">
              <input type="radio" name="via" value="verbal" defaultChecked /> Persetujuan lisan Pemegang Hak
            </label>
            <label className="flex items-center gap-2 text-body">
              <input type="radio" name="via" value="ahli_waris" /> Bukti ahli waris dibawa di hari-H
            </label>
          </fieldset>
          <div className="flex flex-col gap-2">
            <label htmlFor="catatan" className="text-sm font-medium">Catatan</label>
            <Input id="catatan" name="catatan" required maxLength={1000} />
          </div>
          <div className="flex flex-col items-start gap-2">
            <Button type="submit" variant="outline" disabled={konsenPending}>
              {konsenPending ? "Mencatat…" : "Catat persetujuan"}
            </Button>
            <Pesan state={konsenState} />
          </div>
        </form>
      ) : null}

      <form action={konfirmasiAction} className="flex flex-col gap-3">
        <input type="hidden" name="lokasiId" value={lokasiId} />
        <input type="hidden" name="nomor" value={nomor} />
        <div className="flex flex-col gap-2">
          <label htmlFor="pemakamanAt" className="text-sm font-medium">Pemakaman</label>
          <Input id="pemakamanAt" name="pemakamanAt" type="datetime-local" defaultValue={pemakamanAwal} required />
        </div>
        <div className="flex flex-col items-start gap-2">
          <Button type="submit" disabled={konfirmasiPending || !panel.bisaKonfirmasi}>
            {konfirmasiPending ? "Mengonfirmasi…" : "Konfirmasi pemakaman"}
          </Button>
          {panel.blokKonfirmasi ? <p role="alert" className="text-small text-danger-soft-foreground">{panel.blokKonfirmasi}</p> : null}
          <Pesan state={konfirmasiState} />
        </div>
      </form>
    </div>
  );
}
