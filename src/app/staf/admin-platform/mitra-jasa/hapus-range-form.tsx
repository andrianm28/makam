"use client";

import { startTransition, useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ServerResult, idleFormState } from "../../form-feedback";
import { hapusTidakTersedia } from "./actions";

/**
 * Takes one of a Mitra Jasa's own "Tidak tersedia" ranges off. It has no field of
 * its own, so it is not a form on the Form pattern: a button that carries a hidden
 * id and clears the row it was on.
 */
export function HapusRangeForm({ rangeId }: { rangeId: string }) {
  const [state, submit, pending] = useActionState(hapusTidakTersedia, idleFormState);
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData();
        data.set("rangeId", rangeId);
        startTransition(() => submit(data));
      }}
    >
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        Hapus
      </Button>
      <ServerResult state={state} />
    </form>
  );
}
