"use client";

import { useActionState } from "react";
import { jawabKonsenAction, type KonsenActionState } from "./actions";

const awal: KonsenActionState = { status: "idle" };

export function KonsenForm({ nomor }: { nomor: string }) {
  const [state, action, pending] = useActionState(jawabKonsenAction, awal);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="nomor" value={nomor} />
      <div className="flex gap-3">
        <button type="submit" name="jawaban" value="setuju" disabled={pending} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">
          Setujui
        </button>
        <button type="submit" name="jawaban" value="tolak" disabled={pending} className="rounded-lg border px-4 py-2">
          Tolak
        </button>
      </div>
      {state.status !== "idle" ? <p role="status">{state.message}</p> : null}
    </form>
  );
}
