"use client";

/**
 * A Blok's site-plan photo. While no FileStore is configured this reads
 * exactly as ticket 13's prototype `FotoStub` (an unggah-belum-tersedia
 * card); once one is, it also serves the real upload the prototype never
 * needed to build (`uploadBlokPhotoAction`).
 */
import { useTransition } from "react";
import { ImageOff } from "lucide-react";
import { uploadBlokPhotoAction } from "./actions";

export function PhotoSection({
  lokasiId,
  blokId,
  blokName,
  fileStoreConfigured,
  photoUrl,
  message,
  onMessage,
}: {
  lokasiId: string;
  blokId: string;
  blokName: string;
  fileStoreConfigured: boolean;
  photoUrl: string | null;
  message: string | null;
  onMessage: (message: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();

  if (!fileStoreConfigured) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border-strong bg-card p-6 text-center">
        <ImageOff className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-body font-medium text-foreground">Unggah foto belum tersedia</p>
        <p className="text-small text-muted-foreground">
          Foto denah lokasi untuk Blok {blokName} akan bisa diunggah setelah penyimpanan berkas siap. Sementara ini gunakan grid di atas sebagai acuan.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
      <p className="text-title-3 text-foreground">Foto denah</p>
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt={`Foto denah Blok ${blokName}`} className="max-h-80 w-full rounded-lg object-contain" />
      ) : (
        <p className="text-small text-muted-foreground">Belum ada foto.</p>
      )}
      {message ? <p className="text-small text-danger">{message}</p> : null}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          onMessage(null);
          startTransition(async () => {
            const formData = new FormData();
            formData.set("lokasiId", lokasiId);
            formData.set("blokId", blokId);
            formData.set("file", file);
            const result = await uploadBlokPhotoAction(formData);
            if (!result.ok) onMessage(result.message);
          });
        }}
        disabled={pending}
        className="text-small"
      />
    </div>
  );
}
