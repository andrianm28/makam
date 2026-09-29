"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ajukanPermohonanAction, type BerkasActionState } from "./actions";

const idle: BerkasActionState = { status: "idle" };

/**
 * One manual Perpanjangan request: who is asking, and the documents its path
 * collects. The list of documents comes from the Perpanjangan module through the
 * page, so the form and the domain never disagree about what a path needs.
 */
export function BerkasForm({
  hakPakaiId,
  jalur,
  berkas,
  batasMb,
  catatanLabel,
  namaAwal,
}: {
  hakPakaiId: string;
  jalur: string;
  berkas: { kunci: string; label: string; wajib: boolean }[];
  batasMb: number;
  /** What the free-text note asks for on this path (the relationship to the Almarhum, say). */
  catatanLabel: string;
  namaAwal: string;
}) {
  const [state, action, pending] = useActionState(ajukanPermohonanAction, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="hakPakaiId" value={hakPakaiId} />
      <input type="hidden" name="jalur" value={jalur} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        Nama lengkap Anda
        <Input name="nama" autoComplete="name" defaultValue={namaAwal} maxLength={200} className="h-11 px-3" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Nomor telepon (WhatsApp)
        <Input name="nomorTelepon" type="tel" inputMode="tel" autoComplete="tel" placeholder="0812…" maxLength={30} className="h-11 px-3" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {catatanLabel}
        <textarea
          name="catatan"
          rows={3}
          maxLength={1000}
          className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
        />
      </label>
      {berkas.map((satu) => (
        <label key={satu.kunci} className="flex flex-col gap-1 text-sm font-medium">
          {satu.label}
          <Input name={`berkas_${satu.kunci}`} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="h-auto py-2" />
          <span className="text-small font-normal text-muted-foreground">
            {satu.wajib ? "Wajib." : "Boleh dikosongkan."} Foto atau PDF, paling besar {batasMb} MB.
          </span>
        </label>
      ))}
      <p className="text-small text-muted-foreground">Berkas disimpan tertutup dan hanya dilihat Admin Lokasi. Admin Lokasi memeriksanya dalam 2 hari kerja.</p>
      <div className="flex flex-col items-start gap-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Mengirim…" : "Ajukan permohonan"}
        </Button>
        {state.status === "gagal" ? (
          <p role="alert" className="text-body text-destructive">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
