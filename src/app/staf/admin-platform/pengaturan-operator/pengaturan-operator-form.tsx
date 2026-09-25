"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { OperatorSettingsEntry } from "@/domain/operator-settings";
import { simpanPengaturanOperator, type PengaturanOperatorFormState } from "./actions";

const inputClass =
  "h-10 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** `values`: what the form starts with, those in force or empty before the first entry. */
export function PengaturanOperatorForm({ values }: { values: OperatorSettingsEntry }) {
  const [state, action, pending] = useActionState<PengaturanOperatorFormState, FormData>(simpanPengaturanOperator, {
    status: "idle",
  });
  // After a refusal the form shows what was typed, not the values in force.
  const shown = state.typed ?? { ...values, reason: "" };
  return (
    <form action={action} data-testid="pengaturan-operator-form" className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Nama resmi Operator
        <input name="legalName" required maxLength={200} defaultValue={shown.legalName} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Alamat terdaftar
        <textarea
          name="address"
          required
          maxLength={500}
          rows={3}
          defaultValue={shown.address}
          className="rounded-lg border border-input bg-background px-3 py-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Telepon Operator
          <input name="phone" type="tel" required maxLength={32} defaultValue={shown.phone} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Email Operator
          <input name="email" type="email" required maxLength={254} defaultValue={shown.email} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Nomor WhatsApp CS
          <input
            name="csWhatsApp"
            type="tel"
            inputMode="tel"
            required
            maxLength={32}
            defaultValue={shown.csWhatsApp}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Jam balas CS
          <input
            name="csReplyHours"
            required
            maxLength={200}
            placeholder="dibalas mulai pukul 06:00"
            defaultValue={shown.csReplyHours}
            className={inputClass}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Alasan perubahan (opsional)
        <input name="reason" maxLength={500} defaultValue={shown.reason} className={inputClass} />
      </label>
      <Button type="submit" disabled={pending} className="self-start">
        Simpan
      </Button>
      {state.status === "berhasil" ? (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
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
