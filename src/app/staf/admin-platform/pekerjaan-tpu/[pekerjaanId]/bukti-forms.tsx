"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ServerResult, idleFormState } from "../../../form-feedback";
import { batalkanPekerjaanTerlambat, setujuiBukti, tolakBukti } from "./actions";

/** Admin Platform approves the proof of one job. */
export function SetujuiBuktiForm({ pekerjaanId }: { pekerjaanId: string }) {
  const [state, submit, pending] = useActionState(setujuiBukti, idleFormState);
  return (
    <form action={submit} noValidate className="flex flex-col gap-2">
      <input type="hidden" name="pekerjaanId" value={pekerjaanId} />
      <Button type="submit" disabled={pending}>
        {pending ? "Menyetujui…" : "Setujui bukti"}
      </Button>
      <ServerResult state={state} />
    </form>
  );
}

/** Admin Platform sends the proof back, with the reason the Mitra Jasa will read. */
export function TolakBuktiForm({ pekerjaanId }: { pekerjaanId: string }) {
  const [state, submit, pending] = useActionState(tolakBukti, idleFormState);
  return (
    <form action={submit} noValidate className="flex flex-col gap-2">
      <input type="hidden" name="pekerjaanId" value={pekerjaanId} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        Alasan penolakan
        <textarea name="alasan" rows={2} maxLength={500} className="rounded-lg border border-input bg-background p-3" />
      </label>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Menolak…" : "Tolak, minta ulang"}
      </Button>
      <ServerResult state={state} />
    </form>
  );
}

/** Admin Platform cancels a Terlambat job on the family's behalf, with the reason. */
export function BatalkanTerlambatForm({ pekerjaanId }: { pekerjaanId: string }) {
  const [state, submit, pending] = useActionState(batalkanPekerjaanTerlambat, idleFormState);
  return (
    <form action={submit} noValidate className="flex flex-col gap-2">
      <input type="hidden" name="pekerjaanId" value={pekerjaanId} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        Alasan pembatalan
        <textarea name="catatan" rows={2} maxLength={500} className="rounded-lg border border-input bg-background p-3" />
      </label>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Membatalkan…" : "Batalkan pekerjaan dan kembalikan dana"}
      </Button>
      <ServerResult state={state} />
    </form>
  );
}
