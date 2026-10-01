"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { PESAN_MAKS_PANJANG } from "@/domain/layanan/pesan-skema";

/** One message as the screen shows it: names already lowered by the domain to what the reader may see. */
export interface PesanTampil {
  id: string;
  pengirimNama: string;
  teks: string;
  waktu: string;
  /** Photos, each by a short-lived link; null when the FileStore could not sign it. */
  foto: (string | null)[];
}

/** One job's thread as the screen shows it. */
export interface ThreadTampil {
  pekerjaanId: string;
  pesan: PesanTampil[];
  readOnly: boolean;
}

/** What a message form's state carries back to the screen. */
export type KirimPesanState = { status: "idle" } | { status: "gagal"; message: string } | { status: "berhasil"; message: string };

/**
 * The message thread of one Pekerjaan Layanan (spec, Layanan > Pekerjaan Layanan;
 * ticket 52): the conversation between the Pemesan and the fulfiller, in the app.
 * Photos are shown by their short-lived links, and the box to write disappears once
 * the Keluhan window has closed the thread. Which names and photos a reader sees is
 * decided by the domain; this only draws them.
 */
export function ThreadPekerjaan({
  thread,
  kirim,
  hidden,
}: {
  thread: ThreadTampil;
  kirim: (previous: KirimPesanState, formData: FormData) => Promise<KirimPesanState>;
  /** The ids the action needs besides the message, e.g. the order number or the Lokasi. */
  hidden: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(kirim, { status: "idle" as const });
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4" aria-labelledby="pesan-heading">
      <h2 id="pesan-heading" className="text-body font-semibold">
        Pesan
      </h2>
      {thread.pesan.length === 0 ? <p className="text-small text-muted-foreground">Belum ada pesan. Tulis pesan pertama di bawah.</p> : null}
      <ul className="flex flex-col gap-3">
        {thread.pesan.map((satu) => (
          <li key={satu.id} className="flex flex-col gap-1 rounded-lg bg-muted p-3">
            <p className="text-small text-muted-foreground">
              <span className="font-medium text-foreground">{satu.pengirimNama}</span> · {satu.waktu}
            </p>
            <p className="whitespace-pre-wrap text-body">{satu.teks}</p>
            {satu.foto.filter((url): url is string => url !== null).length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {satu.foto
                  .filter((url): url is string => url !== null)
                  .map((url, index) => (
                    <li key={index}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="Foto pada pesan" className="h-24 w-24 rounded-lg border border-border object-cover" />
                    </li>
                  ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>

      {thread.readOnly ? (
        <p className="text-small text-muted-foreground">Percakapan ini ditutup karena masa keluhan sudah berakhir.</p>
      ) : (
        <form action={formAction} className="flex flex-col gap-2" encType="multipart/form-data">
          <input type="hidden" name="pekerjaanId" value={thread.pekerjaanId} />
          {Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <label className="text-small font-medium" htmlFor={`pesan-${thread.pekerjaanId}`}>
            Tulis pesan
          </label>
          <textarea
            id={`pesan-${thread.pekerjaanId}`}
            name="teks"
            rows={2}
            maxLength={PESAN_MAKS_PANJANG}
            required
            placeholder="Tulis pesan untuk pelaksana pekerjaan."
            className="rounded-lg border border-input bg-background px-3 py-2 text-body"
          />
          <input type="file" name="lampiran" accept="image/jpeg,image/png,image/webp" multiple className="text-small" />
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
      )}
    </section>
  );
}
