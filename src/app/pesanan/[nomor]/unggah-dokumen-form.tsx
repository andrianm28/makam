"use client";

import { useActionState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { unggahDokumenAction, type DokumenActionState } from "./actions";

const idle: DokumenActionState = { status: "idle" };

/**
 * One document the family adds to its own order (spec, story 30). Nothing here
 * is required: the papers may follow after the burial, or come by hand.
 */
export function UnggahDokumenForm({ nomor, nama }: { nomor: string; nama: string[] }) {
  const [state, action, pending] = useActionState(unggahDokumenAction, idle);
  const form = useRef<HTMLFormElement>(null);
  if (nama.length === 0) return null;
  return (
    <form
      ref={form}
      action={action}
      className="flex flex-col gap-3"
      onSubmit={() => {
        // The form clears itself once the document is in; the list below re-renders with it.
        form.current?.reset();
      }}
    >
      <input type="hidden" name="nomor" value={nomor} />
      <div className="flex flex-col gap-2">
        <label htmlFor="nama-dokumen" className="text-sm font-medium">Dokumen</label>
        <Select name="nama" defaultValue={nama[0]}>
          <SelectTrigger id="nama-dokumen">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {nama.map((satu) => (
              <SelectItem key={satu} value={satu}>
                {satu}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="berkas" className="text-sm font-medium">Berkas</label>
        <Input id="berkas" name="berkas" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required />
        <p className="text-small text-muted-foreground">Foto atau pindai. Maksimal 10 MB.</p>
      </div>
      <div className="flex flex-col items-start gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Mengunggah…" : "Unggah dokumen"}
        </Button>
        {state.status !== "idle" ? (
          <p role={state.status === "gagal" ? "alert" : "status"} className="text-caption text-muted-foreground">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
