"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FormState } from "../../form-state";
import { pulihkanAkun } from "./actions";

export function PemulihanAkunForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(pulihkanAkun, { status: "idle" });
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Email Akun sekarang
          <Input name="currentEmail" type="email" required placeholder="nama@contoh.id" className="h-10 px-3" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Email baru
          <Input name="newEmail" type="email" required placeholder="nama.baru@contoh.id" className="h-10 px-3" />
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
        KTP sudah dicek: cocok dengan data Akun
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Alasan
        <Input name="reason" required maxLength={500} className="h-10 px-3" />
      </label>
      <Button type="submit" disabled={pending} className="self-start">
        Pulihkan Akun
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
