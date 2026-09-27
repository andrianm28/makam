"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { catatPanggilanLokasi, type PesananActionState } from "../pesanan/[nomor]/actions";

const idle: PesananActionState = { status: "idle" };

/** A failed Lokasi-work message, called and logged: the row closes itself (spec, story 136). */
export function CatatPanggilanForm({ lokasiId, teleponId }: { lokasiId: string; teleponId: string }) {
  const [state, action, pending] = useActionState(catatPanggilanLokasi, idle);
  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="teleponId" value={teleponId} />
      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="sr-only" htmlFor={`hasil-${teleponId}`}>
            Hasil panggilan
          </label>
          <Select name="hasil" defaultValue="sudah_dihubungi">
            <SelectTrigger id={`hasil-${teleponId}`} className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sudah_dihubungi">Sudah dihubungi</SelectItem>
              <SelectItem value="tidak_diangkat">Tidak diangkat</SelectItem>
              <SelectItem value="nomor_salah">Nomor salah</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="sr-only" htmlFor={`catatan-${teleponId}`}>
            Catatan panggilan
          </label>
          <Input id={`catatan-${teleponId}`} name="catatan" placeholder="Catatan (opsional)" maxLength={500} className="w-56" />
        </div>
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
