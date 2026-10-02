"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isiRekeningPengembalianAction, type PesananActionState } from "./actions";

const idle: PesananActionState = { status: "idle" };

/**
 * Where the refund on this order goes (ticket 31, AC 5). Only the Pemesan of the
 * order reaches this page, and the account can be changed only until Admin
 * Platform approves the refund.
 */
export function RekeningPengembalianForm({
  nomor,
  jumlahLabel,
  rekeningTercatat,
  simpan = isiRekeningPengembalianAction,
}: {
  nomor: string;
  jumlahLabel: string;
  rekeningTercatat: string | null;
  /** The Server Action that saves it; a TPU order's page passes its own, which refreshes that page. */
  simpan?: (previous: PesananActionState, formData: FormData) => Promise<PesananActionState>;
}) {
  const [state, action, mengirim] = useActionState(simpan, idle);
  return (
    <section className="flex flex-col gap-3" data-testid="rekening-pengembalian">
      <h2 className="text-title-3 text-foreground">Pengembalian dana</h2>
      <p className="text-body text-muted-foreground">
        Dana sebesar {jumlahLabel} akan dikembalikan. Isi rekening tujuannya; setelah disetujui Admin Platform, rekening tidak bisa diubah di sini.
        {rekeningTercatat ? ` Rekening tercatat: ${rekeningTercatat}.` : ""}
      </p>
      <form action={action} className="grid gap-3 sm:grid-cols-3">
        <input type="hidden" name="nomor" value={nomor} />
        <label className="flex flex-col gap-1 text-small font-medium">
          Nama bank
          <Input name="bank" required maxLength={100} />
        </label>
        <label className="flex flex-col gap-1 text-small font-medium">
          Nomor rekening
          <Input name="nomorRekening" required maxLength={50} inputMode="numeric" />
        </label>
        <label className="flex flex-col gap-1 text-small font-medium">
          Nama pemilik rekening
          <Input name="nama" required maxLength={200} />
        </label>
        <div className="sm:col-span-3">
          <Button type="submit" disabled={mengirim}>
            {mengirim ? "Menyimpan…" : "Simpan rekening"}
          </Button>
        </div>
        {state.status !== "idle" ? (
          <p role={state.status === "gagal" ? "alert" : "status"} className={state.status === "gagal" ? "text-small text-destructive sm:col-span-3" : "text-small sm:col-span-3"}>
            {state.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
