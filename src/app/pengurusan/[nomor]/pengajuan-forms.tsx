"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "../../staf/form-state";
import { batalkanPengurusanAction, unggahDokumenAction } from "./pengajuan-actions";

const idle: FormState = { status: "idle" };
const inputClass = "h-10 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

function Feedback({ state }: { state: FormState }) {
  if (state.status === "idle") return null;
  return (
    <p role={state.status === "berhasil" ? "status" : "alert"} className={state.status === "berhasil" ? "text-small text-success-soft-foreground" : "text-small text-destructive"}>
      {state.message}
    </p>
  );
}

/** The Pemesan uploads one document of the filing checklist; the Surat Kuasa that was signed is one of them. */
export function UnggahDokumenForm({ nomor, nama }: { nomor: string; nama: string }) {
  const [state, action, pending] = useActionState(unggahDokumenAction, idle);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="nomor" value={nomor} />
      <input type="hidden" name="nama" value={nama} />
      <label className="flex flex-col gap-1 text-small font-medium">
        {nama}
        <input name="berkas" type="file" accept="image/jpeg,image/png,application/pdf" required className={inputClass} />
      </label>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Mengunggah…" : "Unggah"}
      </Button>
      <Feedback state={state} />
    </form>
  );
}

/** The Pemesan cancels before the IPTM is filed. */
export function BatalkanPengurusanForm({ nomor }: { nomor: string }) {
  const [state, action, pending] = useActionState(batalkanPengurusanAction, idle);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="nomor" value={nomor} />
      <label className="flex flex-col gap-1 text-small font-medium">
        Alasan (boleh dikosongkan)
        <input name="alasan" maxLength={500} className={inputClass} />
      </label>
      <Button type="submit" variant="secondary" disabled={pending} className="self-start">
        {pending ? "Membatalkan…" : "Batalkan pengurusan"}
      </Button>
      <Feedback state={state} />
    </form>
  );
}
