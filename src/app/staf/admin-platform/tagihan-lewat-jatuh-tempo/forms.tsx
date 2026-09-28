"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FormState } from "../../form-state";
import { catatPanggilanTagihan, nyatakanTidakTertagih } from "./actions";

const idle: FormState = { status: "idle" };

const HASIL_LABEL: Record<string, string> = {
  janji_bayar: "Janji bayar",
  tidak_diangkat: "Tidak diangkat",
  menolak: "Menolak",
  nomor_salah: "Nomor salah",
};

/** Logs one Chasing call on an open "Telepon Pemesan" row (spec, Billing > Chasing). */
export function CatatPanggilanTagihanForm({ teleponId }: { teleponId: string }) {
  const [state, action, pending] = useActionState(catatPanggilanTagihan, idle);
  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <input type="hidden" name="teleponId" value={teleponId} />
      <div className="flex items-end gap-2">
        <Select name="hasil" defaultValue="janji_bayar">
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(HASIL_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input name="catatan" placeholder="Catatan (opsional)" maxLength={500} className="w-56" />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Menyimpan…" : "Catat panggilan"}
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

/** Admin Platform gives up chasing this Tagihan; refused before H+30 or with no logged call (spec, Billing > Chasing). */
export function NyatakanTidakTertagihForm({ tagihanId }: { tagihanId: string }) {
  const [state, action, pending] = useActionState(nyatakanTidakTertagih, idle);
  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="tagihanId" value={tagihanId} />
      <Button type="submit" variant="destructive" size="sm" disabled={pending}>
        Nyatakan Tidak Tertagih
      </Button>
      {state.status !== "idle" ? (
        <p role={state.status === "gagal" ? "alert" : "status"} className="text-caption text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
