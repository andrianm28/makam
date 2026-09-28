"use client";

/** Ticket 13's prototype empty state, 1:1: shown only while a Lokasi has no Blok yet. */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Images, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewBlokDialog } from "./blok-dialogs";

export function DenahEmptyState({ lokasiId, jenisMakam }: { lokasiId: string; jenisMakam: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border-strong bg-card px-6 py-16 text-center">
      <Images className="size-8 text-muted-foreground" aria-hidden />
      <div>
        <p className="text-title-3 text-foreground">Belum ada Blok di Lokasi ini</p>
        <p className="mt-1 max-w-sm text-body text-muted-foreground">
          Buat Blok pertama untuk mulai menggambar Denah: Petak Makam, Jalan, Bukan Petak, dan Kavling Keluarga.
        </p>
      </div>
      {jenisMakam.length ? (
        <>
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" aria-hidden /> Buat Blok
          </Button>
          <NewBlokDialog
            open={open}
            onOpenChange={setOpen}
            lokasiId={lokasiId}
            jenisMakam={jenisMakam}
            onCreated={(blokId) => router.push(`/staf/admin-lokasi/${lokasiId}/denah/${blokId}`)}
          />
        </>
      ) : (
        <p className="text-body text-muted-foreground">
          Belum ada Jenis Makam di Lokasi ini. Admin Platform perlu menambahkan Jenis Makam dulu di halaman Tarif sebelum Blok bisa dibuat.
        </p>
      )}
    </div>
  );
}
