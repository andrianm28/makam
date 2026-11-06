"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { startTransition, useActionState, useId } from "react";
import { useForm } from "react-hook-form";
import { FieldError } from "@/components/makam/form-section";
import { pesanKesalahan } from "@/components/makam/form-errors";
import { Button } from "@/components/ui/button";
import {
  INFO_MAKAM_SWASTA_TEKS_PANJANG_MAX,
  INFO_MAKAM_SWASTA_TEKS_PENDEK_MAX,
  infoMakamSwastaSchema,
  type InfoMakamSwastaInput,
} from "@/domain/lokasi/skema-info-makam-swasta";
import { ServerResult, idleFormState } from "../../form-feedback";
import { useResetAfterSubmit } from "../../form-reset";
import { simpanInfoMakamSwasta } from "./actions";

const inputClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** Every field as the form holds it: text, the sources one per line. */
type Isian = { nama: string; kota: string; alamat: string; pengelola: string; segmen: string; luas: string; fasilitas: string; sumber: string; urutan: string };

const kosong: Isian = { nama: "", kota: "", alamat: "", pengelola: "", segmen: "", luas: "", fasilitas: "", sumber: "", urutan: "100" };

function isianDari(entri: (InfoMakamSwastaInput & { id: string }) | null): Isian {
  if (!entri) return kosong;
  return {
    nama: entri.nama,
    kota: entri.kota,
    alamat: entri.alamat,
    pengelola: entri.pengelola,
    segmen: entri.segmen,
    luas: entri.luas ?? "",
    fasilitas: entri.fasilitas ?? "",
    sumber: entri.sumber.join("\n"),
    urutan: String(entri.urutan),
  };
}

const kolom: { name: keyof Isian; label: string; panjang?: boolean; hint?: string }[] = [
  { name: "nama", label: "Nama pemakaman" },
  { name: "kota", label: "Kota / kabupaten", hint: "Misalnya Kabupaten Bogor." },
  { name: "alamat", label: "Alamat", panjang: true },
  { name: "pengelola", label: "Pengelola" },
  { name: "segmen", label: "Untuk", hint: "Agama atau kelompok yang dilayani." },
  { name: "luas", label: "Luas (opsional)" },
  { name: "fasilitas", label: "Fasilitas menurut sumber (opsional)", panjang: true },
  { name: "sumber", label: "Sumber publik", panjang: true, hint: "Satu sumber per baris: situs resmi atau media dan bulan terbitnya." },
  { name: "urutan", label: "Urutan tampil", hint: "Angka kecil tampil lebih dulu." },
];

/**
 * Adds an Info Makam Swasta entry, or corrects one (`entri` given). No price,
 * no "terverifikasi", no "bermitra": the domain refuses them.
 */
export function InfoMakamSwastaForm({ entri }: { entri: (InfoMakamSwastaInput & { id: string }) | null }) {
  const prefix = useId();
  const [state, submit, pending] = useActionState(simpanInfoMakamSwasta, idleFormState);
  const {
    register,
    handleSubmit,
    getValues,
    reset,
    formState: { errors },
  } = useForm<Isian, unknown, InfoMakamSwastaInput>({
    resolver: zodResolver(infoMakamSwastaSchema, { error: pesanKesalahan }),
    defaultValues: isianDari(entri),
  });
  useResetAfterSubmit(state, () => (entri ? getValues() : kosong), reset);

  return (
    <form
      noValidate
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={handleSubmit(() => {
        // The schema has checked the text; the action gets the text as typed and parses it again.
        const formData = new FormData();
        formData.set("id", entri?.id ?? "");
        for (const [name, value] of Object.entries(getValues())) formData.set(name, value);
        startTransition(() => submit(formData));
      })}
    >
      {kolom.map((satu) => {
        const id = `${prefix}-${satu.name}`;
        const error = errors[satu.name]?.message;
        const max = satu.panjang ? INFO_MAKAM_SWASTA_TEKS_PANJANG_MAX : INFO_MAKAM_SWASTA_TEKS_PENDEK_MAX;
        return (
          <label key={satu.name} htmlFor={id} className={`flex flex-col gap-1 text-sm font-medium ${satu.panjang ? "sm:col-span-2" : ""}`}>
            {satu.label}
            {satu.panjang ? (
              <textarea id={id} rows={3} maxLength={satu.name === "sumber" ? undefined : max} {...register(satu.name)} aria-invalid={error ? true : undefined} className={inputClass} />
            ) : (
              <input
                id={id}
                inputMode={satu.name === "urutan" ? "numeric" : undefined}
                maxLength={satu.name === "urutan" ? 3 : max}
                {...register(satu.name)}
                aria-invalid={error ? true : undefined}
                className={inputClass}
              />
            )}
            {satu.hint ? <span className="text-xs font-normal text-muted-foreground">{satu.hint}</span> : null}
            <FieldError message={error} />
          </label>
        );
      })}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {entri ? "Simpan perubahan" : "Tambah"}
        </Button>
        <ServerResult state={state} />
      </div>
    </form>
  );
}
