"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "../../../form-state";
import { akhiriHakPakaiTidakTertagih } from "./actions";

const idle: FormState = { status: "idle" };

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
