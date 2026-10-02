"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FormState } from "../../../../form-state";
import { mintaPerbaikanPermintaanAction, setujuiPermintaanAction, tolakPermintaanAction } from "./actions";

const idle: FormState = { status: "idle" };

function Umpanbalik({ state }: { state: FormState }) {
  if (state.status === "idle") return null;
  return (
    <p role={state.status === "gagal" ? "alert" : "status"} className="text-caption text-muted-foreground">
      {state.message}
    </p>
  );
}

/** Setuju. A Ganti notes the fee the Lokasi collected offline (empty = the Lokasi's own fee). */
export function SetujuiForm({ lokasiId, id, ganti, biayaBawaan }: { lokasiId: string; id: string; ganti: boolean; biayaBawaan: number }) {
  const [state, action, pending] = useActionState(setujuiPermintaanAction, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="id" value={id} />
      {ganti ? (
        <label className="flex flex-col gap-1 text-sm font-medium">
          Biaya Ganti Pemegang Hak yang dipungut di luar sistem (Rp)
          <Input name="biayaGantiOffline" inputMode="numeric" defaultValue={String(biayaBawaan)} />
        </label>
      ) : null}
      <Button type="submit" disabled={pending} className="self-start" data-testid="setujui-permintaan">
        Setujui
      </Button>
      <Umpanbalik state={state} />
    </form>
  );
}

export function TolakForm({ lokasiId, id }: { lokasiId: string; id: string }) {
  const [state, action, pending] = useActionState(tolakPermintaanAction, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="id" value={id} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        Alasan penolakan (dibaca Pemegang Hak)
        <Input name="alasan" required maxLength={500} />
      </label>
      <Button type="submit" variant="destructive" disabled={pending} className="self-start" data-testid="tolak-permintaan">
        Tolak
      </Button>
      <Umpanbalik state={state} />
    </form>
  );
}

export function PerbaikanForm({ lokasiId, id }: { lokasiId: string; id: string }) {
  const [state, action, pending] = useActionState(mintaPerbaikanPermintaanAction, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="id" value={id} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        Yang perlu diperbaiki
        <Input name="catatan" required maxLength={500} />
      </label>
      <Button type="submit" variant="outline" disabled={pending} className="self-start" data-testid="perbaikan-permintaan">
        Kirim kembali untuk diperbaiki
      </Button>
      <Umpanbalik state={state} />
    </form>
  );
}
