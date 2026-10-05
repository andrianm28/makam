"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UNGGAHAN_MAX_BYTES } from "@/lib/files/upload-check";
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

/**
 * The warning banner, the consent state, the forms to log verbal consent or heirship proof, and the confirmation (ticket 35).
 * An heirship proof is a file (PDF, JPG or PNG) the Admin Lokasi uploads, and a settled consent that carries one links to it
 * (ticket 125).
 */
export function TumpangPanelView({ lokasiId, nomor, panel, pemakamanAwal }: { lokasiId: string; nomor: string; panel: TumpangPanel; pemakamanAwal: string }) {
  const [konsenState, konsenAction, konsenPending] = useActionState(catatKonsenTumpangAction, idle);
  const [konfirmasiState, konfirmasiAction, konfirmasiPending] = useActionState(konfirmasiTumpangAction, idle);
  // The proof belongs to the heirship choice alone: a verbal consent has no file to give, so the field waits for the other choice.
  const [via, setVia] = useState<"verbal" | "ahli_waris">("verbal");
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
      {panel.buktiAhliWarisAda ? (
        <p data-testid="bukti-ahli-waris" className="text-body">
          <span className="font-medium">Bukti ahli waris:</span> terlampir.{" "}
          <a href={`/staf/admin-lokasi/${lokasiId}/pesanan/${nomor}/bukti-ahli-waris`} target="_blank" rel="noopener noreferrer" className="underline">
            Buka bukti
          </a>
        </p>
      ) : null}
      {panel.pengingatGanti ? <p className="rounded-lg bg-info-soft p-3 text-body text-info-soft-foreground">{panel.pengingatGanti}</p> : null}

      {panel.bisaCatatKonsen ? (
        <form action={konsenAction} className="flex flex-col gap-3">
          <input type="hidden" name="lokasiId" value={lokasiId} />
          <input type="hidden" name="nomor" value={nomor} />
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Catat persetujuan</legend>
            <label className="flex items-center gap-2 text-body">
              <input type="radio" name="via" value="verbal" checked={via === "verbal"} onChange={() => setVia("verbal")} /> Persetujuan lisan Pemegang Hak
            </label>
            <label className="flex items-center gap-2 text-body">
              <input type="radio" name="via" value="ahli_waris" checked={via === "ahli_waris"} onChange={() => setVia("ahli_waris")} /> Bukti ahli waris dibawa di hari-H
            </label>
          </fieldset>
          <div className="flex flex-col gap-2">
            <label htmlFor="catatan" className="text-sm font-medium">Catatan</label>
            <Input id="catatan" name="catatan" required maxLength={1000} />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="bukti" className="text-sm font-medium">Unggah bukti ahli waris (PDF, JPG atau PNG)</label>
            <Input id="bukti" name="bukti" type="file" accept="application/pdf,image/jpeg,image/png" disabled={via !== "ahli_waris"} required={via === "ahli_waris"} />
            <p className="text-small text-muted-foreground">
              {`Foto atau scan surat keterangan ahli waris. Wajib untuk bukti ahli waris; persetujuan lisan tidak memakainya. Paling besar ${UNGGAHAN_MAX_BYTES / (1024 * 1024)} MB. Berkas ini tersimpan di penyimpanan privat.`}
            </p>
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
