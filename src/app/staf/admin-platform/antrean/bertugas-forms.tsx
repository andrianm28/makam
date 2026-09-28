"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "../../form-state";
import { matikanBertugas, nyalakanBertugas } from "./actions";

const idle: FormState = { status: "idle" };

/** One Antrean row this staff member holds (Ambil), as the hand-over names it. */
export interface KlaimSaya {
  type: string;
  subjectId: string;
  label: string;
  subjectLabel: string;
}

/**
 * Switches Bertugas on for the signed-in Admin Platform. A form with nothing to
 * fill in, so it posts plainly and the page comes back saying what happened
 * (refused without a Perangkat Push, ADR 0004).
 */
export function NyalakanBertugasForm() {
  return (
    <form action={nyalakanBertugas} className="flex flex-col items-start gap-1">
      <Button type="submit" size="sm">
        Nyalakan Bertugas
      </Button>
    </form>
  );
}

/**
 * Coming off duty by hand, asked about every claim still held: release it, or
 * hand the work over in a Catatan Internal. A claim nobody answered refuses the
 * whole switch-off, so the form asks a choice for each of them.
 */
export function TurunDariBertugasForm({ klaim }: { klaim: KlaimSaya[] }) {
  const [state, action, pending] = useActionState(matikanBertugas, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <p className="text-small text-muted-foreground">
        {klaim.length > 0
          ? "Baris berikut masih Anda pegang (Ambil). Pilih satu untuk tiap baris: dilepas, atau diserahkan lewat Catatan Internal."
          : "Tidak ada baris Antrean yang Anda pegang."}
      </p>
      {klaim.map((satu) => (
        <KlaimBaris key={`${satu.type}:${satu.subjectId}`} klaim={satu} />
      ))}
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          Turun dari Bertugas
        </Button>
        <Pesan state={state} />
      </div>
    </form>
  );
}

function KlaimBaris({ klaim }: { klaim: KlaimSaya }) {
  const [lepas, setLepas] = useState(true);
  const rowKey = `${klaim.type}:${klaim.subjectId}`;
  return (
    <fieldset className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <legend className="text-caption text-muted-foreground">{klaim.label}</legend>
      <p className="text-small text-foreground">{klaim.subjectLabel}</p>
      <label className="flex items-center gap-2 text-small">
        <input type="radio" name={`lepas:${rowKey}`} value="true" checked={lepas} onChange={() => setLepas(true)} />
        Lepas baris ini, supaya bisa diambil orang lain
      </label>
      <label className="flex items-center gap-2 text-small">
        <input type="radio" name={`lepas:${rowKey}`} value="false" checked={!lepas} onChange={() => setLepas(false)} />
        Tetap saya pegang, diserahkan lewat Catatan Internal
      </label>
      {!lepas ? (
        <label className="flex flex-col gap-1 text-small font-medium">
          <span className="sr-only">Catatan Internal serah terima</span>
          <textarea
            name={`catatan:${rowKey}`}
            required
            rows={2}
            maxLength={2000}
            placeholder="Serah terima: sudah menghubungi siapa, apa yang tersisa…"
            className="rounded-lg border border-input bg-background p-2 text-sm font-normal outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>
      ) : null}
      <input type="hidden" name="klaim" value={rowKey} />
    </fieldset>
  );
}

function Pesan({ state }: { state: FormState }) {
  if (state.status === "idle") return null;
  return (
    <p role={state.status === "gagal" ? "alert" : "status"} className="text-caption text-muted-foreground">
      {state.message}
    </p>
  );
}
