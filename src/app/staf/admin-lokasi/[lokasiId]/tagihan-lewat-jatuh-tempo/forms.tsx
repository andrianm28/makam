"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "../../../form-state";
import { akhiriHakPakaiTidakTertagih, tambahCatatanTagihanLokasi } from "./actions";
import { Input } from "@/components/ui/input";

const idle: FormState = { status: "idle" };

/** A standalone note on this Tagihan's call log: closes no call row and is never counted as a call. */
export function CatatanTagihanLokasiForm({ lokasiId, tagihanId }: { lokasiId: string; tagihanId: string }) {
  const [state, action, pending] = useActionState(tambahCatatanTagihanLokasi, idle);
  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="tagihanId" value={tagihanId} />
      <div className="flex items-end gap-2">
        <Input name="catatan" placeholder="Tambah catatan" required maxLength={500} className="w-64" />
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          Tambah catatan
        </Button>
      </div>
      {state.status !== "idle" ? (
        <p role={state.status === "gagal" ? "alert" : "status"} className="text-caption text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

/** Ends a Hak Pakai once its Saat Duka Tagihan is Tidak Tertagih (spec, Billing > Chasing). */
export function AkhiriHakPakaiForm({ lokasiId, hakPakaiId }: { lokasiId: string; hakPakaiId: string }) {
  const [state, action, pending] = useActionState(akhiriHakPakaiTidakTertagih, idle);
  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="hakPakaiId" value={hakPakaiId} />
      <Button type="submit" variant="destructive" size="sm" disabled={pending}>
        Akhiri Hak Pakai
      </Button>
      {state.status !== "idle" ? (
        <p role={state.status === "gagal" ? "alert" : "status"} className="text-caption text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
