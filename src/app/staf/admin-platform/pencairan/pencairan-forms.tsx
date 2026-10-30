"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "../../form-state";
import { lepaskanItemAction, tahanItemAction, terbitkanBuktiPencairanAction } from "./actions";

const inputClass =
  "h-10 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const labelClass = "flex flex-col gap-1 text-sm font-medium";
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

/** Holds one due item out of the run, with the reason the spec requires. */
export function TahanItemForm({ itemId }: { itemId: string }) {
  const [state, action, menahan] = useActionState(tahanItemAction, idle);
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="itemId" value={itemId} />
      <div className="flex gap-2">
        <input name="alasan" required maxLength={500} placeholder="Alasan menahan" aria-label="Alasan menahan" className={`${inputClass} min-w-0 flex-1`} />
        <Button type="submit" variant="secondary" disabled={menahan}>
          {menahan ? "Menahan…" : "Tahan"}
        </Button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

/** Puts a held item back into the run. */
export function LepaskanItemForm({ itemId }: { itemId: string }) {
  const [state, action, melepas] = useActionState(lepaskanItemAction, idle);
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="itemId" value={itemId} />
      <Button type="submit" variant="secondary" disabled={melepas}>
        {melepas ? "Melepaskan…" : "Lepaskan"}
      </Button>
      <Feedback state={state} />
    </form>
  );
}

/**
 * The transfer of one recipient's row: the items and Potongan the run lists,
 * the date and the proof. The ids are exactly the row's, so the Bukti
 * Pencairan records the same net amount the page told Admin Platform to send.
 */
export function TerbitkanBuktiForm({ itemIds, potonganIds, hariIni }: { itemIds: string[]; potonganIds: string[]; hariIni: string }) {
  const [state, action, mencatat] = useActionState(terbitkanBuktiPencairanAction, idle);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      {itemIds.map((id) => (
        <input key={id} type="hidden" name="itemIds" value={id} />
      ))}
      {potonganIds.map((id) => (
        <input key={id} type="hidden" name="potonganIds" value={id} />
      ))}
      <label className={labelClass}>
        Tanggal transfer
        <input name="ditransferPada" type="date" required max={hariIni} defaultValue={hariIni} className={inputClass} />
      </label>
      <label className={labelClass}>
        Foto atau scan bukti transfer
        <input name="bukti" type="file" required accept="image/jpeg,image/png,application/pdf" />
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={mencatat || state.status === "berhasil"}>
          {mencatat ? "Mencatat…" : "Catat transfer dan terbitkan Bukti Pencairan"}
        </Button>
      </div>
      <div className="sm:col-span-2">
        <Feedback state={state} />
      </div>
    </form>
  );
}
