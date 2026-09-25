"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { nonaktifkanStaf, undangStaf, type FormState } from "./actions";

const inputClass =
  "h-10 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const idle: FormState = { status: "idle" };

function Feedback({ state }: { state: FormState }) {
  if (state.status === "idle") return null;
  return state.status === "berhasil" ? (
    <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
      {state.message}
    </p>
  ) : (
    <p role="alert" className="text-sm text-destructive">
      {state.message}
    </p>
  );
}

/** Undangan Staf: WhatsApp number, required email, one role. */
export function InviteForm({ roles }: { roles: { value: string; label: string }[] }) {
  const [state, action, pending] = useActionState(undangStaf, idle);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Nomor WhatsApp
        <input name="phoneNumber" type="tel" inputMode="tel" required placeholder="0812 3456 7890" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Email
        <input name="email" type="email" required placeholder="nama@contoh.id" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Peran
        <select name="role" required defaultValue="admin_lokasi" className={inputClass}>
          {roles.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Catatan (opsional)
        <input name="reason" maxLength={500} className={inputClass} />
      </label>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending} className="self-start">
          Kirim undangan
        </Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

/** Deactivates one Akun Staf, with a reason. */
export function DeactivateForm({ accountId }: { accountId: string }) {
  const [state, action, pending] = useActionState(nonaktifkanStaf, idle);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="accountId" value={accountId} />
      <label className="sr-only" htmlFor={`alasan-${accountId}`}>
        Alasan
      </label>
      <input id={`alasan-${accountId}`} name="reason" required maxLength={500} placeholder="Alasan" className={inputClass} />
      <Button type="submit" variant="destructive" size="sm" disabled={pending}>
        Nonaktifkan
      </Button>
      <Feedback state={state} />
    </form>
  );
}
