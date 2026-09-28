"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { FormState } from "../../../form-state";
import { konfirmasiPengurusan, tawarkanTpuLain } from "./actions";

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
 * The two things Admin Platform can do with a Saat Duka TPU order: confirm the
 * burial it arranged with the TPU, or offer the family another TPU for the same
 * burial. Both are one Server Action each, each calling one domain function.
 */
export function ConfirmTpuForms({
  nomor,
  petugas,
  tpuLain,
  tawaran,
}: {
  nomor: string;
  petugas: { accountId: string; name: string }[];
  tpuLain: { id: string; name: string }[];
  tawaran: { tpu: { name: string }; alasan: string } | null;
}) {
  const [confirmState, confirmAction, confirming] = useActionState(konfirmasiPengurusan, idle);
  const [offerState, offerAction, offering] = useActionState(tawarkanTpuLain, idle);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Konfirmasi pemakaman</CardTitle>
          <CardDescription>
            Terbitkan Tagihan pay-after (jatuh tempo 3×24 jam setelah pemakaman) dan membuat Tugas &#34;Ambil surat pengantar&#34;
            dalam satu langkah. Rugi ditanggung Operator kalau keluarga tidak membayar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={confirmAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="nomor" value={nomor} />
            <label className={labelClass}>
              Waktu pemakaman disepakati (WIB)
              <input name="pemakamanAt" type="datetime-local" required className={inputClass} />
            </label>
            <label className={labelClass}>
              Petugas Lapangan ambil surat pengantar
              <select name="petugasAccountId" required defaultValue="" className={inputClass}>
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
              Nama kontak di TPU
              <input name="kontakTpuName" required maxLength={200} className={inputClass} />
            </label>
            <label className={labelClass}>
              Nomor telepon TPU
              <input name="kontakTpuPhone" required maxLength={30} className={inputClass} />
            </label>
            <label className={`${labelClass} sm:col-span-2`}>
              Catatan untuk keluarga (opsional)
              <input name="catatan" maxLength={500} className={inputClass} />
            </label>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={confirming}>
                {confirming ? "Mengonfirmasi…" : "Konfirmasi pemakaman"}
              </Button>
            </div>
            <div className="sm:col-span-2">
              <Feedback state={confirmState} />
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tawarkan TPU lain</CardTitle>
          <CardDescription>
            Untuk pemakaman yang sama. Order tetap menunjuk TPU yang dipilih keluarga sampai mereka menjawab:
            diterima membuat order pindah ke TPU itu dan tenggat konfirmasi dihitung ulang, ditolak membuat order Ditolak.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tawaran ? (
            <p className="mb-3 text-body text-muted-foreground">
              Sedang ditawarkan: {tawaran.tpu.name} — {tawaran.alasan}. Menunggu jawaban keluarga.
            </p>
          ) : null}
          <form action={offerAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="nomor" value={nomor} />
            <label className={labelClass}>
              TPU lain
              <select name="tpuId" required defaultValue="" className={inputClass}>
                <option value="" disabled>
                  Pilih TPU
                </option>
                {tpuLain.map((satu) => (
                  <option key={satu.id} value={satu.id}>
                    {satu.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Alasan (dibaca keluarga)
              <input name="alasan" required maxLength={300} className={inputClass} />
            </label>
            <div className="sm:col-span-2">
              <Button type="submit" variant="secondary" disabled={offering}>
                {offering ? "Mengirim…" : "Tawarkan TPU lain"}
              </Button>
            </div>
            <div className="sm:col-span-2">
              <Feedback state={offerState} />
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
