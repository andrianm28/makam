"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ambilBerkasTertunda } from "@/components/makam/berkas-tertunda";
import { unggahDokumenAction } from "./actions";

type Hasil = { nama: string; berhasil: boolean; message: string };

/**
 * Uploads the documents the family attached on "Data & kirim" (rapat Ira, 6 Nov
 * 2026), right after the order was placed, one request per file through the same
 * action as the form below. Renders nothing when none is waiting.
 */
export function UnggahBerkasTertunda({ nomor }: { nomor: string }) {
  const router = useRouter();
  const mulai = useRef(false);
  const [sedang, setSedang] = useState<string | null>(null);
  const [hasil, setHasil] = useState<Hasil[]>([]);

  useEffect(() => {
    if (mulai.current) return;
    mulai.current = true;
    const berkas = ambilBerkasTertunda();
    if (berkas.length === 0) return;
    void (async () => {
      const semua: Hasil[] = [];
      for (const satu of berkas) {
        setSedang(satu.nama);
        const data = new FormData();
        data.set("nomor", nomor);
        data.set("nama", satu.nama);
        data.set("berkas", satu.file);
        const state = await unggahDokumenAction({ status: "idle" }, data);
        semua.push({ nama: satu.nama, berhasil: state.status === "berhasil", message: state.status === "idle" ? "" : state.message });
        setHasil([...semua]);
      }
      setSedang(null);
      router.refresh();
    })();
  }, [nomor, router]);

  if (sedang === null && hasil.length === 0) return null;
  return (
    <div role="status" className="rounded-xl border border-border bg-brand-soft p-4 text-body text-brand-soft-foreground">
      {sedang ? <p className="font-semibold">Mengunggah {sedang}…</p> : <p className="font-semibold">Dokumen dari formulir sudah diproses.</p>}
      {hasil.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1 text-small">
          {hasil.map((satu) => (
            <li key={satu.nama}>{satu.berhasil ? `${satu.nama}: terunggah.` : `${satu.nama}: ${satu.message} Silakan unggah lagi di bawah.`}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
