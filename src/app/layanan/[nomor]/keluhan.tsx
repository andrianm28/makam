"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ajukanKeluhanLayanan, beriPenilaianLayanan, type PemesanActionState } from "./actions";

const idle: PemesanActionState = { status: "idle" };

function Hasil({ state }: { state: PemesanActionState }) {
  if (state.status === "idle") return null;
  return state.status === "gagal" ? (
    <p role="alert" className="text-small text-destructive">
      {state.message}
    </p>
  ) : (
    <p role="status" className="text-small text-muted-foreground">
      {state.message}
    </p>
  );
}

/**
 * The Pemesan's Keluhan on one finished job. It is shown only while the module would accept it: the job
 * is Selesai, has no Keluhan yet and the 3×24 h window since its proof was shown is still open, so the
 * button is not a promise the domain may refuse. The deadline is the page's, computed by the domain.
 */
export function AjukanKeluhan({ pekerjaanId, nomor, berakhirPada }: { pekerjaanId: string; nomor: string; berakhirPada: string }) {
  const [state, formAction, pending] = useActionState(ajukanKeluhanLayanan, idle);
  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-lg bg-muted p-3">
      <input type="hidden" name="pekerjaanId" value={pekerjaanId} />
      <input type="hidden" name="nomor" value={nomor} />
      <label className="text-small font-medium" htmlFor={`keluhan-${pekerjaanId}`}>
        Ada yang belum sesuai?
      </label>
      <p className="text-small text-muted-foreground">Ajukan keluhan sampai {berakhirPada}. Admin Platform akan memutuskan pengerjaan ulang atau pengembalian dana.</p>
      <textarea
        id={`keluhan-${pekerjaanId}`}
        name="alasan"
        rows={3}
        maxLength={1000}
        required
        placeholder="Contoh: nisannya masih kotor di sisi kiri."
        className="rounded-lg border border-input bg-background px-3 py-2 text-body"
      />
      <Button type="submit" variant="outline" size="sm" disabled={pending} className="self-start">
        {pending ? "Mengirim…" : "Ajukan keluhan"}
      </Button>
      <Hasil state={state} />
    </form>
  );
}

/** The Pemesan's optional Penilaian of one finished job: 1 to 5 stars and a comment. */
export function BeriPenilaian({ pekerjaanId, nomor }: { pekerjaanId: string; nomor: string }) {
  const [state, formAction, pending] = useActionState(beriPenilaianLayanan, idle);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="pekerjaanId" value={pekerjaanId} />
      <input type="hidden" name="nomor" value={nomor} />
      <fieldset className="flex flex-col gap-1">
        <legend className="text-small font-medium">Bagaimana pekerjaan ini? (tidak wajib)</legend>
        <div className="flex flex-wrap gap-3">
          {[1, 2, 3, 4, 5].map((bintang) => (
            <label key={bintang} className="flex items-center gap-1 text-body">
              <input type="radio" name="bintang" value={bintang} required />
              {bintang} bintang
            </label>
          ))}
        </div>
      </fieldset>
      <label className="text-small font-medium" htmlFor={`komentar-${pekerjaanId}`}>
        Komentar
      </label>
      <textarea
        id={`komentar-${pekerjaanId}`}
        name="komentar"
        rows={2}
        maxLength={1000}
        placeholder="Ceritakan singkat bila ada."
        className="rounded-lg border border-input bg-background px-3 py-2 text-body"
      />
      <p className="text-small text-muted-foreground">Penilaian hanya dibaca tim Makam.co.id, tidak oleh Lokasi Mitra.</p>
      <Button type="submit" variant="outline" size="sm" disabled={pending} className="self-start">
        {pending ? "Mengirim…" : "Kirim penilaian"}
      </Button>
      <Hasil state={state} />
    </form>
  );
}
