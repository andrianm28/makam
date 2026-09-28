"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "../../form-state";
import { catatSetorRetribusiAction, tugaskanSetorRetribusi } from "./actions";

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

/**
 * Dua cara menutup satu baris Setor Retribusi: catat setoran ke Pemda di sini
 * dengan bukti, atau tugaskan ke satu Petugas Lapangan sebagai Tugas "Setor
 * Retribusi" yang bukti unggahannya menutup baris ini. Keduanya satu Server
 * Action masing-masing, masing-masing memanggil satu fungsi domain.
 */
export function SetorRetribusiForms({
  setor,
  petugas,
}: {
  setor: { tagihanId: string; nomorTagihan: string; sudahDitugaskan: boolean };
  petugas: { accountId: string; name: string }[];
}) {
  const [catatState, catatAction, mencatat] = useActionState(catatSetorRetribusiAction, idle);
  const [tugasState, tugasAction, menugaskan] = useActionState(tugaskanSetorRetribusi, idle);

  return (
    <div className="flex flex-col gap-4">
      <form action={catatAction} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="tagihanId" value={setor.tagihanId} />
        <label className={labelClass}>
          Tanggal disetor ke Pemda
          <input name="dibayarkanPada" type="date" required className={inputClass} />
        </label>
        <label className={labelClass}>
          Nomor bukti (opsional)
          <input name="catatan" maxLength={2000} className={inputClass} />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          Foto atau scan bukti setor
          <input name="bukti" type="file" required accept="image/jpeg,image/png,image/webp,application/pdf" />
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={mencatat}>
            {mencatat ? "Mencatat…" : "Catat setoran"}
          </Button>
        </div>
        <div className="sm:col-span-2">
          <Feedback state={catatState} />
        </div>
      </form>

      <form action={tugasAction} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="tagihanId" value={setor.tagihanId} />
        <input type="hidden" name="nomorTagihan" value={setor.nomorTagihan} />
        <label className={labelClass}>
          Petugas Lapangan
          <select name="assigneeAccountId" required defaultValue="" className={inputClass} disabled={!petugas.length}>
            <option value="" disabled>
              Pilih Petugas Lapangan
            </option>
            {petugas.map((account) => (
              <option key={account.accountId} value={account.accountId}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Tanggal rencana
          <input name="plannedDate" type="date" required className={inputClass} />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          Alamat kantor yang tercatat
          <input name="address" required maxLength={500} className={inputClass} />
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" variant="secondary" disabled={menugaskan || !petugas.length}>
            {menugaskan ? "Menugaskan…" : "Tugaskan ke Petugas Lapangan"}
          </Button>
        </div>
        <div className="sm:col-span-2">
          <Feedback state={tugasState} />
        </div>
      </form>
    </div>
  );
}
