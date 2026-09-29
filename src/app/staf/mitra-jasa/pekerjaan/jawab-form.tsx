"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ServerResult, idleFormState } from "../../form-feedback";
import { jawabPenugasan } from "./actions";

/**
 * Terima or Tolak one job. Two big buttons, because a Mitra Jasa answers from a phone
 * and possibly at the gate of a TPU: the choice is the submit button's own value, so
 * there is no field to fill and nothing to mistype.
 */
export function JawabForm({ pekerjaanId }: { pekerjaanId: string }) {
  const [state, submit, pending] = useActionState(jawabPenugasan, idleFormState);
  return (
    <form action={submit} noValidate className="flex flex-col gap-3">
      <input type="hidden" name="pekerjaanId" value={pekerjaanId} />
      <div className="grid grid-cols-2 gap-3">
        <Button type="submit" name="jawaban" value="terima" size="lg" disabled={pending}>
          Terima
        </Button>
        <Button type="submit" name="jawaban" value="tolak" variant="outline" size="lg" disabled={pending}>
          Tolak
        </Button>
      </div>
      <ServerResult state={state} />
    </form>
  );
}
