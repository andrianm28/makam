"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "../../form-state";
import { aktifkanBertugas, matikanBertugas } from "./actions";

const idle: FormState = { status: "idle" };

function Umpan({ state }: { state: FormState }) {
  if (state.status === "idle") return null;
  return (
    <p role={state.status === "gagal" ? "alert" : "status"} className="text-caption text-muted-foreground">
      {state.message}
    </p>
  );
}

/** Switches Bertugas on; the domain refuses it without an active Perangkat Push and the message says where to turn push on (ADR 0004). */
export function AktifkanBertugasForm() {
  const [state, action, pending] = useActionState(aktifkanBertugas, idle);
  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <Button type="submit" size="sm" disabled={pending}>
        Nyalakan Bertugas
      </Button>
      <Umpan state={state} />
    </form>
  );
}

export interface BarisDipegang {
  type: string;
  subjectId: string;
  label: string;
  subjectLabel: string;
}

/**
 * Switches Bertugas off. Every row the staff member holds (Ambil) is released or
 * kept with a Catatan Internal for whoever takes it next; nothing is chosen for them.
 */
export function MatikanBertugasForm({ baris }: { baris: BarisDipegang[] }) {
  const [state, action, pending] = useActionState(matikanBertugas, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      {baris.length > 0 ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="text-small font-medium text-foreground">
            Baris yang Anda ambil: lepas, atau tinggalkan Catatan Internal untuk serah terima
          </legend>
          {baris.map((row, index) => (
            <div key={`${row.type}:${row.subjectId}`} className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
              <input type="hidden" name="type" value={row.type} />
              <input type="hidden" name="subjectId" value={row.subjectId} />
              <p className="text-small text-foreground">
                <span className="text-muted-foreground">{row.label}: </span>
                {row.subjectLabel}
              </p>
              <label className="flex items-center gap-2 text-small">
                <input type="radio" name={`aksi-${index}`} value="lepas" defaultChecked />
                Lepas (siapa pun boleh mengambil)
              </label>
              <label className="flex items-center gap-2 text-small">
                <input type="radio" name={`aksi-${index}`} value="catatan" />
                Tetap saya ambil, dengan Catatan Internal
              </label>
              <textarea
                name={`catatan-${index}`}
                maxLength={2000}
                rows={2}
                aria-label={`Catatan Internal untuk ${row.subjectLabel}`}
                placeholder="Apa yang sudah dilakukan dan apa yang menunggu…"
                className="rounded-lg border border-input bg-background p-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
          ))}
        </fieldset>
      ) : null}
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          Matikan Bertugas
        </Button>
        <Umpan state={state} />
      </div>
    </form>
  );
}
