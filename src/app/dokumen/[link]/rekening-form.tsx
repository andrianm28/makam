"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { isiRekeningPengembalian, type RekeningFormState } from "./actions";

const inputClass =
  "h-10 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const labelClass = "flex flex-col gap-1 text-sm font-medium";
const idle: RekeningFormState = { status: "idle" };

/**
 * The Pemesan enters the refund's destination bank account, on the Tagihan's
 * own unguessable link (ticket 31, AC 5). No sign-in: the link is the
 * permission, the same as Bayar's.
 */
export function RekeningPengembalianForm({ link }: { link: string }) {
  const [state, action, mengirim] = useActionState(isiRekeningPengembalian, idle);
  if (state.status === "berhasil") {
    return (
      <p role="status" className="mt-1 text-sm text-success-soft-foreground">
        {state.message}
      </p>
    );
  }
  return (
    <form action={action} className="mt-2 grid gap-3 sm:grid-cols-3">
      <input type="hidden" name="link" value={link} />
      <label className={labelClass}>
        Nama bank
        <input name="bank" required maxLength={100} className={inputClass} />
      </label>
      <label className={labelClass}>
        Nomor rekening
        <input name="nomor" required maxLength={50} className={inputClass} />
      </label>
      <label className={labelClass}>
        Nama pemilik rekening
        <input name="nama" required maxLength={200} className={inputClass} />
      </label>
      <div className="sm:col-span-3">
        <Button type="submit" size="sm" disabled={mengirim}>
          {mengirim ? "Menyimpan…" : "Simpan rekening"}
        </Button>
      </div>
      {state.status === "gagal" ? (
        <p role="alert" className="text-sm text-destructive sm:col-span-3">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
