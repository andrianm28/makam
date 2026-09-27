"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "../../form-state";
import { ambilAntreanRow, konfirmasiSyaratTayangMasihTerpenuhi, tambahCatatanInternalAntrean } from "./actions";

const idle: FormState = { status: "idle" };

/** Any Admin Platform takes (Ambil) this row, replacing any earlier claim (spec, story 141). */
export function AmbilForm({ type, subjectId, sudahDiambil }: { type: string; subjectId: string; sudahDiambil: boolean }) {
  const [state, action, pending] = useActionState(ambilAntreanRow, idle);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="subjectId" value={subjectId} />
      <Button type="submit" variant={sudahDiambil ? "outline" : "default"} size="sm" disabled={pending}>
        {sudahDiambil ? "Ambil ulang" : "Ambil"}
      </Button>
      {state.status !== "idle" ? (
        <p role={state.status === "gagal" ? "alert" : "status"} className="text-caption text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

/** Closes a "Cek ulang syarat tayang" row: Admin Platform confirms the Lokasi Mitra still meets the publish gate. */
export function KonfirmasiSyaratTayangForm({ lokasiId }: { lokasiId: string }) {
  const [state, action, pending] = useActionState(konfirmasiSyaratTayangMasihTerpenuhi, idle);
  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        Konfirmasi masih memenuhi syarat tayang
      </Button>
      {state.status !== "idle" ? (
        <p role={state.status === "gagal" ? "alert" : "status"} className="text-caption text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

/** Adds a Catatan Internal on this row or order; never shown to the Pemesan, Mitra Jasa or Admin Lokasi (spec, story 143). */
export function CatatanInternalForm({ subjectKind, subjectId }: { subjectKind: string; subjectId: string }) {
  const [state, action, pending] = useActionState(tambahCatatanInternalAntrean, idle);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="subjectKind" value={subjectKind} />
      <input type="hidden" name="subjectId" value={subjectId} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        <span className="sr-only">Catatan Internal baru</span>
        <textarea
          name="body"
          required
          maxLength={2000}
          rows={2}
          placeholder="Catatan untuk serah terima…"
          className="rounded-lg border border-input bg-background p-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          Tambah catatan
        </Button>
        {state.status !== "idle" ? (
          <p role={state.status === "gagal" ? "alert" : "status"} className="text-caption text-muted-foreground">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
