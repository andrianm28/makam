"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "../../../form-state";
import { ServerResult } from "../../../form-feedback";
import { putuskanKeluhanAction, sesuaikanPencairanKeluhanAction } from "./actions";

const inputClass = "h-10 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const labelClass = "flex flex-col gap-1 text-sm font-medium";
const idle: FormState = { status: "idle" };

/**
 * The three decisions of a Keluhan, one form: what to do (rejected, a redo, a refund) and the note that goes
 * with it. The note is read by the Admin Lokasi who has to do a redo, and by nobody outside the staff.
 */
export function PutuskanKeluhanForm({ keluhanId }: { keluhanId: string }) {
  const [state, action, mengirim] = useActionState(putuskanKeluhanAction, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="keluhanId" value={keluhanId} />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Keputusan</legend>
        <label className="flex items-start gap-2 text-body">
          <input type="radio" name="keputusan" value="kerjakan_ulang" required className="mt-1" />
          <span>
            <strong>Kerjakan ulang</strong>: Admin Lokasi mengambil bukti baru; pencairan dilepas setelah bukti baru ditunjukkan.
          </span>
        </label>
        <label className="flex items-start gap-2 text-body">
          <input type="radio" name="keputusan" value="kembalikan_dana" className="mt-1" />
          <span>
            <strong>Kembalikan dana</strong>: mengajukan pengembalian untuk pekerjaan ini; biaya layanan platform ikut kembali karena kesalahan ada di pihak pelaksana.
          </span>
        </label>
        <label className="flex items-start gap-2 text-body">
          <input type="radio" name="keputusan" value="tolak" className="mt-1" />
          <span>
            <strong>Tolak keluhan</strong>: pekerjaan dianggap selesai dan pencairan jatuh tempo.
          </span>
        </label>
      </fieldset>
      <label className={labelClass}>
        Catatan keputusan
        <textarea name="catatan" rows={3} maxLength={500} required className="rounded-lg border border-input bg-background px-3 py-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />
        <span className="text-small font-normal text-muted-foreground">Dibaca Admin Lokasi yang mengerjakan ulang, tidak oleh pemesan.</span>
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

/** Admin Platform's override of what the job pays: a new amount, never above the tariff, with a note. */
export function SesuaikanPencairanForm({ keluhanId, tarif }: { keluhanId: string; tarif: number }) {
  const [state, action, mengirim] = useActionState(sesuaikanPencairanKeluhanAction, idle);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="keluhanId" value={keluhanId} />
      <label className={labelClass}>
        Jumlah baru (Rupiah)
        <input name="amount" type="number" min={1} max={tarif} step={1} required className={inputClass} />
      </label>
      <label className={labelClass}>
        Catatan penyesuaian
        <input name="catatan" required maxLength={500} placeholder="Contoh: setengah karena bersih sebagian." className={inputClass} />
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
