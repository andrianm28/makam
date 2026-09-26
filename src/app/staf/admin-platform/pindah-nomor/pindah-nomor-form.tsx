"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "../../form-state";
import { pindahNomor } from "./actions";

const inputClass =
  "h-10 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export function PindahNomorForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(pindahNomor, { status: "idle" });
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Nomor lama
          <input name="currentPhoneNumber" type="tel" inputMode="tel" required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Nomor baru
          <input name="newPhoneNumber" type="tel" inputMode="tel" required className={inputClass} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Foto atau scan KTP
        <input
          name="ktpCheck"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          required
          className="text-sm"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input name="ktpChecked" type="checkbox" value="ya" required />
        Saya sudah mencocokkan KTP dengan data Akun
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Alasan
        <input name="reason" required maxLength={500} className={inputClass} />
      </label>
      <Button type="submit" disabled={pending} className="self-start">
        Pindahkan nomor
      </Button>
      {state.status === "berhasil" ? (
        <p role="status" className="text-sm text-success-soft-foreground">
          {state.message}
        </p>
      ) : state.status === "gagal" ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
