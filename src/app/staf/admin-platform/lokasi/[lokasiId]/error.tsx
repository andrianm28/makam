"use client";

import { TriangleAlertIcon } from "lucide-react";
import { useEffect } from "react";
import { EmptyState } from "@/components/makam/empty-state";
import { Button } from "@/components/ui/button";

/** A Lokasi Mitra's detail failed to load: data is safe, only the read failed. */
export default function LokasiMitraDetailError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      tone="error"
      icon={TriangleAlertIcon}
      title="Lokasi Mitra ini gagal dimuat"
      description="Datanya aman; hanya pemuatan halaman ini yang gagal."
      action={<Button onClick={retry}>Coba lagi</Button>}
    />
  );
}
