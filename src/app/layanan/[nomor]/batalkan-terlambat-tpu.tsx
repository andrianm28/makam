"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { batalkanPekerjaanTerlambatTpuPemesan, type PemesanActionState } from "./actions";

/**
 * The Pemesan's cancel control on a Terlambat TPU job (ticket 57). Shown only for a job the module calls Terlambat,
 * so the button is not a promise the domain may refuse; the module decides what comes back and the Mitra Jasa gets no Pencairan.
 */
export function BatalkanPekerjaanTerlambatTpu({ pekerjaanId, nomor }: { pekerjaanId: string; nomor: string }) {
  const [state, formAction, pending] = useActionState(batalkanPekerjaanTerlambatTpuPemesan, { status: "idle" } as PemesanActionState);

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-2" data-testid="batal-terlambat-tpu">
      <input type="hidden" name="pekerjaanId" value={pekerjaanId} />
      <input type="hidden" name="nomor" value={nomor} />
      <p className="text-small text-muted-foreground">Pekerjaan ini terlambat. Jika dibatalkan, harga pekerjaan ini kami kembalikan.</p>
      <Button type="submit" variant="outline" size="sm" disabled={pending} className="self-start">
        {pending ? "Membatalkan…" : "Batalkan pekerjaan terlambat ini"}
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
