"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ServerResult, idleFormState } from "@/app/staf/form-feedback";
import { batalkanKedukaanSaya } from "./actions";

/** The family cancels a Permintaan Kedukaan (offered only while Diajukan). */
export function BatalkanKedukaanForm({ permintaanId }: { permintaanId: string }) {
  const [state, action, pending] = useActionState(batalkanKedukaanSaya, idleFormState);
  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="permintaanId" value={permintaanId} />
      <Button type="submit" variant="outline" disabled={pending}>
        Batalkan permintaan
      </Button>
      <ServerResult state={state} />
    </form>
  );
}
