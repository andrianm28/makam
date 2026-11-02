"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ServerResult, idleFormState } from "@/app/staf/form-feedback";
import { pindahStatusKedukaan } from "./actions";

/** The moves Admin Platform may make from the Permintaan's status, with a note (required to cancel) the family reads. */
export function StatusKedukaanForm({ permintaanId, pilihan }: { permintaanId: string; pilihan: { status: string; label: string }[] }) {
  const [state, action, pending] = useActionState(pindahStatusKedukaan, idleFormState);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="permintaanId" value={permintaanId} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        Catatan untuk keluarga (wajib bila dibatalkan)
        <textarea name="catatan" maxLength={1000} rows={2} className="rounded-lg border border-input bg-background px-3 py-2" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        {pilihan.map((satu) => (
          <Button key={satu.status} type="submit" name="status" value={satu.status} variant={satu.status === "dibatalkan" ? "outline" : "default"} disabled={pending}>
            {satu.label}
          </Button>
        ))}
        <ServerResult state={state} />
      </div>
    </form>
  );
}
