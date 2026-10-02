"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { FormState } from "../../../form-state";
import { koreksiIptmBerakhirAction, mintaPerbaikanAction, putuskanCekTpuAction } from "./perpanjangan-actions";

const inputClass = "h-10 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const labelClass = "flex flex-col gap-1 text-sm font-medium";
const idle: FormState = { status: "idle" };

function Feedback({ state }: { state: FormState }) {
  if (state.status === "idle") return null;
  return (
    <p role={state.status === "berhasil" ? "status" : "alert"} className={state.status === "berhasil" ? "text-sm text-success-soft-foreground" : "text-sm text-destructive"}>
      {state.message}
    </p>
  );
}

/** A request past the masa tenggang: the Operator has asked the TPU, without charge, and records its answer. */
export function CekTpuForm({ nomor, tanggal }: { nomor: string; tanggal: string }) {
  const [state, action, pending] = useActionState(putuskanCekTpuAction, idle);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cek TPU (lewat masa tenggang)</CardTitle>
        <CardDescription>
          IPTM ini sudah lewat masa tenggang ({tanggal}). Tanyakan dulu ke TPU, tanpa biaya. Tagihan baru terbit setelah dokumen diperiksa dan jawaban TPU dicatat.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="nomor" value={nomor} />
          <label className={labelClass}>
            Jawaban TPU
            <select name="putusan" defaultValue="lanjut" className={inputClass}>
              <option value="lanjut">TPU bersedia memperpanjang</option>
              <option value="tolak">TPU tidak memperpanjang (Ditolak, tanpa biaya)</option>
            </select>
          </label>
          <label className={labelClass}>
            Alasan (wajib bila ditolak, dibaca keluarga)
            <textarea name="alasan" maxLength={500} rows={2} className="rounded-lg border border-input bg-background px-3 py-2" />
          </label>
          <Button type="submit" disabled={pending} className="self-start">{pending ? "Menyimpan…" : "Catat jawaban TPU"}</Button>
          <Feedback state={state} />
        </form>
      </CardContent>
    </Card>
  );
}

/** A document needs fixing before any Tagihan: back to the Pemegang Hak, no charge. */
export function MintaPerbaikanForm({ nomor, dokumen }: { nomor: string; dokumen: string[] }) {
  const [state, action, pending] = useActionState(mintaPerbaikanAction, idle);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Minta perbaikan dokumen</CardTitle>
        <CardDescription>Kembalikan dokumen yang perlu diperbaiki ke keluarga. Tagihan baru terbit setelah dokumen diperiksa lagi.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="nomor" value={nomor} />
          <label className={labelClass}>
            Yang perlu diperbaiki (dibaca keluarga)
            <textarea name="alasan" required maxLength={500} rows={2} className="rounded-lg border border-input bg-background px-3 py-2" />
          </label>
          <fieldset className="flex flex-col gap-1 text-sm">
            <legend className="font-medium">Dokumen yang harus diunggah ulang</legend>
            {dokumen.map((nama) => (
              <label key={nama} className="flex items-center gap-2">
                <input type="checkbox" name="dokumen" value={nama} /> {nama}
              </label>
            ))}
          </fieldset>
          <Button type="submit" disabled={pending} className="self-start">{pending ? "Menyimpan…" : "Minta perbaikan"}</Button>
          <Feedback state={state} />
        </form>
      </CardContent>
    </Card>
  );
}

/** The IPTM expiry date the Pemegang Hak read off the photo, corrected by Admin Platform before the Tagihan. */
export function KoreksiIptmBerakhirForm({ nomor, berlakuSampai }: { nomor: string; berlakuSampai: string }) {
  const [state, action, pending] = useActionState(koreksiIptmBerakhirAction, idle);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Koreksi tanggal berakhir IPTM</CardTitle>
        <CardDescription>Tanggal dari keluarga: {berlakuSampai}. Samakan dengan foto IPTM; koreksi dicatat di Entri Audit dengan alasannya.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="nomor" value={nomor} />
          <label className={labelClass}>Berlaku sampai<input name="berlakuSampai" type="date" required defaultValue={berlakuSampai} className={inputClass} /></label>
          <label className={labelClass}>Alasan<input name="alasan" required maxLength={500} className={inputClass} /></label>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Button type="submit" disabled={pending} className="self-start">{pending ? "Menyimpan…" : "Simpan koreksi"}</Button>
            <Feedback state={state} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
