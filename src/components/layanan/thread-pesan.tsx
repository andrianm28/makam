"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { PesanThreadState } from "@/lib/thread-labels";

const idle: PesanThreadState = { status: "idle" };

/**
 * The write box of a Pekerjaan Layanan's thread: text and up to three photos. It takes its Server Action as a
 * prop, so the Pemesan, the Admin Lokasi and Admin Platform each post through their own guarded action. A thread
 * the module has closed shows no box at all, only the reason.
 */
export function FormPesanThread({
  pekerjaanId,
  action,
  hidden = {},
}: {
  pekerjaanId: string;
  action: (previous: PesanThreadState, formData: FormData) => Promise<PesanThreadState>;
  hidden?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="pekerjaanId" value={pekerjaanId} />
      {Object.entries(hidden).map(([nama, nilai]) => (
        <input key={nama} type="hidden" name={nama} value={nilai} />
      ))}
      <label className="text-small font-medium" htmlFor={`pesan-${pekerjaanId}`}>
        Tulis pesan
      </label>
      <textarea id={`pesan-${pekerjaanId}`} name="teks" rows={3} maxLength={1000} className="rounded-lg border border-input bg-background px-3 py-2 text-body" />
      <label className="text-small font-medium" htmlFor={`foto-${pekerjaanId}`}>
        Foto (tidak wajib, paling banyak tiga)
      </label>
      <input id={`foto-${pekerjaanId}`} type="file" name="foto" accept="image/jpeg,image/png,image/webp" multiple className="text-small" />
      <p className="text-small text-muted-foreground">Jangan menulis nomor telepon atau email di sini. Percakapan ini hanya bisa dibaca oleh pihak yang mengerjakan pekerjaan ini dan Admin Platform.</p>
      <Button type="submit" variant="outline" size="sm" disabled={pending} className="self-start">
        {pending ? "Mengirim…" : "Kirim pesan"}
      </Button>
      {state.status === "gagal" ? (
        <p role="alert" className="text-small text-destructive">
          {state.message}
        </p>
      ) : null}
      {state.status === "berhasil" ? (
        <p role="status" className="text-small text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
