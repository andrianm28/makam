"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ServerResult, idleFormState } from "@/app/staf/form-feedback";
import { batalkanWakafSaya, tambahBerkasSaya } from "./actions";

/** The Wakif cancels a Pengajuan (offered only until Menunggu Ikrar). */
export function BatalkanWakafForm({ pengajuanId }: { pengajuanId: string }) {
  const [state, action, pending] = useActionState(batalkanWakafSaya, idleFormState);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="pengajuanId" value={pengajuanId} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        Alasan (opsional)
        <input name="alasan" maxLength={500} className="h-10 rounded-lg border border-input bg-background px-3" />
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" disabled={pending}>
          Batalkan pengajuan
        </Button>
        <ServerResult state={state} />
      </div>
    </form>
  );
}

/** The Wakif adds a document after filing. */
export function TambahBerkasForm({ pengajuanId }: { pengajuanId: string }) {
  const [state, action, pending] = useActionState(tambahBerkasSaya, idleFormState);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="pengajuanId" value={pengajuanId} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        Jenis
        <select name="kunci" defaultValue="bukti_kepemilikan" className="h-10 rounded-lg border border-input bg-background px-3">
          <option value="bukti_kepemilikan">Bukti kepemilikan</option>
          <option value="ktp_wakif">KTP Wakif</option>
          <option value="lainnya">Lainnya</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Berkas (PDF, JPG atau PNG, maks. 8 MB)
        <input name="berkas" type="file" accept="application/pdf,image/jpeg,image/png" required className="text-sm" />
      </label>
      <Button type="submit" disabled={pending}>
        Unggah
      </Button>
      <ServerResult state={state} />
    </form>
  );
}
