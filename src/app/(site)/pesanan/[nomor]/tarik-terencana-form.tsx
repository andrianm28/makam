"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { tarikTerencanaAction, type PesananActionState } from "./actions";

const idle: PesananActionState = { status: "idle" };

/**
 * Withdrawing a Pemesanan Terencana before paying (spec, Pemesanan > Terencana): one
 * button, no reason to give and nothing to lose, because nothing has been charged. The
 * screen never promises a refund — a paid order is cancelled another way, and the module
 * refuses this one for it.
 */
export function TarikTerencanaForm({ nomor }: { nomor: string }) {
  const [state, action, pending] = useActionState(tarikTerencanaAction, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="nomor" value={nomor} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="outline" disabled={pending} data-testid="tarik-terencana">
          {pending ? "Membatalkan…" : "Batalkan pesanan ini"}
        </Button>
        {state.status !== "idle" ? (
          <p role={state.status === "gagal" ? "alert" : "status"} className="text-small text-muted-foreground">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
