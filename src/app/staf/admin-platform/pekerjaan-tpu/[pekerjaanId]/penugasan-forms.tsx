"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ServerResult, idleFormState } from "../../../form-feedback";
import { lepasPenugasan, tugaskanMitraJasa } from "./actions";

const label = "flex flex-col gap-1 text-sm font-medium";

/**
 * Hands the job to one Mitra Jasa from the picker's list. The list is the module's own
 * hard filter (Aktif, covering, free on the date), so nothing is filtered here; the
 * module checks the choice again when it is sent.
 */
export function TugaskanForm({ pekerjaanId, calon }: { pekerjaanId: string; calon: { id: string; namaLengkap: string; selesai: number; baru: boolean }[] }) {
  const [state, submit, pending] = useActionState(tugaskanMitraJasa, idleFormState);
  return (
    <form action={submit} noValidate className="flex flex-col gap-3">
      <input type="hidden" name="pekerjaanId" value={pekerjaanId} />
      <label className={label}>
        Mitra Jasa
        <select name="mitraJasaId" defaultValue="" className="h-10 rounded-lg border border-input bg-background px-3">
          <option value="" disabled>
            Pilih Mitra Jasa
          </option>
          {calon.map((satu) => (
            <option key={satu.id} value={satu.id}>
              {satu.namaLengkap} ({satu.selesai} selesai{satu.baru ? ", Baru" : ""})
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" disabled={pending || calon.length === 0}>
        {pending ? "Menugaskan…" : "Tugaskan"}
      </Button>
      <ServerResult state={state} />
    </form>
  );
}

/** Takes the job off the Mitra Jasa who holds it, with the reason, so it can go to another. */
export function LepasForm({ pekerjaanId }: { pekerjaanId: string }) {
  const [state, submit, pending] = useActionState(lepasPenugasan, idleFormState);
  return (
    <form action={submit} noValidate className="flex flex-col gap-3">
      <input type="hidden" name="pekerjaanId" value={pekerjaanId} />
      <label className={label}>
        Alasan penugasan ulang
        <Input name="alasan" />
      </label>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Melepas…" : "Lepas untuk ditugaskan ulang"}
      </Button>
      <ServerResult state={state} />
    </form>
  );
}
