"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ServerResult, idleFormState } from "../../form-feedback";
import { aturTampilInfoMakamSwasta } from "./actions";

/** Shows an entry on the public pages again, or hides it. */
export function TampilInfoMakamSwastaForm({ id, tampil }: { id: string; tampil: boolean }) {
  const [state, submit, pending] = useActionState(aturTampilInfoMakamSwasta, idleFormState);
  return (
    <form action={submit} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="tampil" value={tampil ? "tidak" : "ya"} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {tampil ? "Sembunyikan dari situs" : "Tampilkan di situs"}
      </Button>
      <ServerResult state={state} />
    </form>
  );
}
