"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ServerResult, idleFormState } from "../../form-feedback";
import { kirimBuktiTpu } from "./bukti-actions";

/** Sends the proof for Admin Platform's approval once every required shot is in. */
export function KirimBuktiForm({ pekerjaanId, siap }: { pekerjaanId: string; siap: boolean }) {
  const [state, submit, pending] = useActionState(kirimBuktiTpu, idleFormState);
  return (
    <form action={submit} noValidate className="flex flex-col gap-2">
      <input type="hidden" name="pekerjaanId" value={pekerjaanId} />
      <Button type="submit" size="lg" disabled={pending || !siap}>
        Kirim bukti
      </Button>
      {!siap ? <p className="text-small text-muted-foreground">Ambil semua foto yang diminta dulu.</p> : null}
      <ServerResult state={state} />
    </form>
  );
}
