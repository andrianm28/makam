"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ServerResult, idleFormState } from "../../../form-feedback";
import { putuskanKeluhanTpuAction, sesuaikanPencairanKeluhanTpuAction } from "./actions";

const labelClass = "flex flex-col gap-1 text-sm font-medium";

/**
 * The two decisions of a Keluhan on a TPU job, one form: reject it, or have the job redone by the Mitra Jasa
 * named here (the picker's list, the same Mitra Jasa or another). The note is read by staff only.
 */
export function PutuskanKeluhanTpuForm({ keluhanId, calon }: { keluhanId: string; calon: { id: string; namaLengkap: string }[] }) {
  const [state, action, mengirim] = useActionState(putuskanKeluhanTpuAction, idleFormState);
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="keluhanId" value={keluhanId} />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Keputusan</legend>
        <label className="flex items-start gap-2 text-body">
          <input type="radio" name="keputusan" value="kerjakan_ulang" className="mt-1" />
          <span>
            <strong>Kerjakan ulang</strong>: pekerjaan diberikan lagi ke Mitra Jasa yang dipilih di bawah. Mitra Jasa yang sama tidak dibayar lagi; Mitra Jasa lain dibayar tarif biasa.
          </span>
        </label>
        <label className="flex items-start gap-2 text-body">
          <input type="radio" name="keputusan" value="kembalikan_dana" className="mt-1" />
          <span>
            <strong>Kembalikan dana</strong>: harga layanan dikembalikan ke Pemesan lewat pengembalian dana. Pencairan Mitra Jasa tetap sebesar tarif penuh; turunkan lewat penyesuaian bila perlu.
          </span>
        </label>
        <label className="flex items-start gap-2 text-body">
          <input type="radio" name="keputusan" value="tolak" className="mt-1" />
          <span>
            <strong>Tolak keluhan</strong>: pekerjaan dianggap selesai dan pencairan jatuh tempo setelah masa keluhan berakhir.
          </span>
        </label>
      </fieldset>
      <label className={labelClass}>
        Mitra Jasa untuk pengerjaan ulang
        <select name="mitraJasaId" defaultValue="" className="h-10 rounded-lg border border-input bg-background px-3">
          <option value="">Tidak ada (hanya untuk menolak)</option>
          {calon.map((satu) => (
            <option key={satu.id} value={satu.id}>
              {satu.namaLengkap}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Catatan keputusan
        <textarea name="catatan" rows={3} maxLength={1000} className="rounded-lg border border-input bg-background px-3 py-2" />
      </label>
      <div>
        <Button type="submit" disabled={mengirim}>
          {mengirim ? "Menyimpan…" : "Simpan keputusan"}
        </Button>
      </div>
      <ServerResult state={state} />
    </form>
  );
}

/** Admin Platform's override of what the job pays the Mitra Jasa: a new amount, never above the rate, with a note. */
export function SesuaikanPencairanTpuForm({ keluhanId, tarif }: { keluhanId: string; tarif: number }) {
  const [state, action, mengirim] = useActionState(sesuaikanPencairanKeluhanTpuAction, idleFormState);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2" noValidate>
      <input type="hidden" name="keluhanId" value={keluhanId} />
      <label className={labelClass}>
        Jumlah baru (Rupiah)
        <input name="amount" type="number" min={1} max={tarif} step={1} required className="rounded-lg border border-border px-3 py-2 text-body font-normal" />
      </label>
      <label className={labelClass}>
        Catatan penyesuaian
        <input name="catatan" required maxLength={500} placeholder="Contoh: setengah karena bersih sebagian." className="rounded-lg border border-border px-3 py-2 text-body font-normal" />
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" variant="secondary" disabled={mengirim}>
          {mengirim ? "Menyimpan…" : "Sesuaikan pencairan"}
        </Button>
      </div>
      <div className="sm:col-span-2">
        <ServerResult state={state} />
      </div>
    </form>
  );
}
