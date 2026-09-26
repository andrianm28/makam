"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createBlokAction } from "./actions";

export function NewBlokForm({ lokasiId, jenisMakam }: { lokasiId: string; jenisMakam: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(4);
  const [numberPattern, setNumberPattern] = useState("");
  const [jenisMakamId, setJenisMakamId] = useState(jenisMakam[0]?.id ?? "");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await createBlokAction({ lokasiId, name, rows, cols, numberPattern: numberPattern || undefined, jenisMakamId });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      router.push(`/staf/admin-lokasi/${lokasiId}/denah/${result.blokId}`);
    });
  }

  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-3">
      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Nama Blok
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="A"
            required
            maxLength={60}
            className="h-10 rounded-lg border border-border-strong bg-card px-3"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Jenis Makam awal
          <select
            value={jenisMakamId}
            onChange={(event) => setJenisMakamId(event.target.value)}
            required
            className="h-10 rounded-lg border border-border-strong bg-card px-3"
          >
            {jenisMakam.map((jenis) => (
              <option key={jenis.id} value={jenis.id}>
                {jenis.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Baris
          <input
            type="number"
            min={1}
            max={40}
            value={rows}
            onChange={(event) => setRows(Number(event.target.value))}
            className="h-10 rounded-lg border border-border-strong bg-card px-3"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Kolom
          <input
            type="number"
            min={1}
            max={40}
            value={cols}
            onChange={(event) => setCols(Number(event.target.value))}
            className="h-10 rounded-lg border border-border-strong bg-card px-3"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Pola Nomor Makam (opsional, mis. A-{"{nn}"})
          <input
            value={numberPattern}
            onChange={(event) => setNumberPattern(event.target.value)}
            placeholder={name ? `${name}-{nn}` : "A-{nn}"}
            className="h-10 rounded-lg border border-border-strong bg-card px-3"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 w-fit items-center rounded-lg bg-forest px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {pending ? "Membuat…" : "Buat Blok"}
      </button>
    </form>
  );
}
