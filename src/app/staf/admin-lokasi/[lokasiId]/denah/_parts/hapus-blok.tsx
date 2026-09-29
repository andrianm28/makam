"use client";

/**
 * "Hapus Blok": shown by the Denah editor only when Inventory says the Blok is
 * empty of history (`bolehHapusBlok`), behind a confirmation that asks for the
 * reason the Audit Log keeps. The rule itself lives in Inventory; the Server
 * Action re-checks it and the dialog shows whatever it refuses with.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, Field } from "./dialog";
import { hapusBlokAction } from "../actions";

export function HapusBlokButton({ lokasiId, blokId, blokName }: { lokasiId: string; blokId: string; blokName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [alasan, setAlasan] = useState("Blok diganti denah baru");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="size-4" aria-hidden /> Hapus Blok
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setMessage(null);
        }}
      >
        <DialogContent title={`Hapus Blok ${blokName}?`} description="Semua Petak Makam dan Kavling Keluarga di Blok ini ikut terhapus. Ini tidak bisa dibatalkan.">
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              setMessage(null);
              startTransition(async () => {
                const result = await hapusBlokAction({ lokasiId, blokId, alasan });
                if (!result.ok) {
                  setMessage(result.message);
                  return;
                }
                setOpen(false);
                router.push(result.berikutnya);
              });
            }}
          >
            {message ? (
              <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2.5 text-body text-danger-soft-foreground">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {message}
              </p>
            ) : null}
            <Field id="hapus-blok-alasan" label="Alasan" hint="Tersimpan di Log Audit Lokasi ini.">
              <Input id="hapus-blok-alasan" value={alasan} onChange={(event) => setAlasan(event.target.value)} required maxLength={300} />
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" size="lg" onClick={() => setOpen(false)}>
                Batal
              </Button>
              <Button type="submit" size="lg" variant="destructive" disabled={pending || !alasan.trim()}>
                {pending ? "Menghapus…" : "Hapus Blok"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
