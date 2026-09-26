"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "../../form-state";
import { hapusHariLibur, tambahHariLibur } from "./actions";

const inputClass =
  "h-10 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const idle: FormState = { status: "idle" };

function Feedback({ state }: { state: FormState }) {
  if (state.status === "idle") return null;
  return state.status === "berhasil" ? (
    <p role="status" className="text-sm text-success-soft-foreground">
      {state.message}
    </p>
  ) : (
    <p role="alert" className="text-sm text-destructive">
      {state.message}
    </p>
  );
}

/** Adds one Hari Libur Nasional to the list. */
export function AddHariLiburForm() {
  const [state, action, pending] = useActionState(tambahHariLibur, idle);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Tanggal
        <input className={inputClass} type="date" name="date" required />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Nama hari libur
        <input className={inputClass} name="name" required maxLength={120} placeholder="Hari Raya Natal" />
      </label>
      <Button type="submit" disabled={pending}>
        Tambah
      </Button>
      <div className="basis-full">
        <Feedback state={state} />
      </div>
    </form>
  );
}

/** Removes one Hari Libur Nasional from the list. */
export function RemoveHariLiburForm({ date }: { date: string }) {
  const [state, action, pending] = useActionState(hapusHariLibur, idle);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="date" value={date} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        Hapus
      </Button>
      <Feedback state={state} />
    </form>
  );
}
