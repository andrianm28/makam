"use client";

import { TriangleAlertIcon } from "lucide-react";
import { unstable_isUnrecognizedActionError } from "next/navigation";
import { useEffect } from "react";
import { EmptyState } from "@/components/makam/empty-state";
import { Button } from "@/components/ui/button";

/** The Lokasi Mitra list failed to load: data is safe, only the read failed. */
export default function LokasiMitraListError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  // A form left open across a deploy: the page itself is old, so "Coba lagi" cannot help. Let the root error page
  // (app/error.tsx) say so and offer Muat ulang.
  if (unstable_isUnrecognizedActionError(error)) throw error;

  return (
    <EmptyState
      tone="error"
      icon={TriangleAlertIcon}
      title="Daftar Lokasi Mitra gagal dimuat"
      description="Datanya aman; hanya pemuatan halaman ini yang gagal."
      action={<Button onClick={retry}>Coba lagi</Button>}
    />
  );
}
