"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { batalkanPekerjaanLayanan, type BatalActionState } from "./actions";

/**
 * The Pemesan's cancel control on one job. It is shown only while the module
 * would accept it — the job is Dijadwalkan and H-1 has not passed — so the
 * button is not a promise the domain may refuse; the reason is still required
 * because a cancellation on an order is a statement the Lokasi reads.
 */
export function BatalkanPekerjaan({ pekerjaanId, nomor }: { pekerjaanId: string; nomor: string }) {
  const [state, formAction, pending] = useActionState(batalkanPekerjaanLayanan, { status: "idle" } as BatalActionState);

  return (
    <form action={formAction} className="mt-1 flex flex-col gap-2">
      <input type="hidden" name="pekerjaanId" value={pekerjaanId} />
      <input type="hidden" name="nomor" value={nomor} />
      <label className="text-small font-medium" htmlFor={`alasan-${pekerjaanId}`}>
        Alasan pembatalan
      </label>
      <textarea
        id={`alasan-${pekerjaanId}`}
        name="alasan"
        rows={2}
        required
        placeholder="Contoh: rencana berubah, tolong dibatalkan."
        className="rounded-lg border border-input bg-background px-3 py-2 text-body"
      />
      <Button type="submit" variant="outline" size="sm" disabled={pending} className="self-start">
        {pending ? "Membatalkan…" : "Batalkan pekerjaan ini"}
      </Button>
      {state.status === "gagal" ? (
        <p role="alert" className="text-small text-destructive">
          {state.message}
        </p>
      ) : null}
      {state.status === "berhasil" ? (
        <p role="status" className="text-small text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
