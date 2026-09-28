"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "../../staf/form-state";
import { jawabTpuLain } from "./actions";

const idle: FormState = { status: "idle" };

/**
 * The family's answer to Admin Platform's offer of another TPU: one tap to
 * accept, one to decline, exactly as with a Lokasi Mitra alternative. Declining
 * is a Tolak, so the copy says what it does rather than calling it a "no".
 */
export function JawabTpuLainForm({ nomor, namaTpu }: { nomor: string; namaTpu: string }) {
  const [state, action, pending] = useActionState(jawabTpuLain, idle);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="nomor" value={nomor} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="diterima" value="ya" disabled={pending}>
          {pending ? "Mengirim…" : `Terima, pakai ${namaTpu}`}
        </Button>
        <Button type="submit" name="diterima" value="tidak" variant="secondary" disabled={pending}>
          {pending ? "Mengirim…" : "Tolak, cari TPU lain"}
        </Button>
      </div>
      {state.status === "idle" ? null : state.status === "berhasil" ? (
        <p role="status" className="text-small text-success-soft-foreground">
          {state.message}
        </p>
      ) : (
        <p role="alert" className="text-small text-destructive">
          {state.message}
        </p>
      )}
    </form>
  );
}
