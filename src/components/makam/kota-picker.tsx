"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronDownIcon, MapPinIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * The city filter as one dropdown (owner, 6 Nov 2026: "filter kota dibuat
 * dropdown picker"), in place of a row of city chips. A native <select>: on a
 * phone it opens the system's own picker, which is the easiest list to scroll
 * and tap, and it needs no popup of ours. Choosing a city applies it at once;
 * with no JavaScript a "Terapkan" button does the same.
 */

const SEMUA = "";

interface KotaSelectProps {
  kota: string | null;
  semuaKota: string[];
  onChange: (kota: string) => void;
  /** The <select>'s own form field name; set only when a form submits it. */
  name?: string;
  className?: string;
}

/** The styled <select> both pickers share: a pin, the city (or "Semua kota"), a chevron. */
function KotaSelect({ kota, semuaKota, onChange, name, className }: KotaSelectProps) {
  return (
    <label className={cn("relative flex w-full flex-col gap-1.5 sm:max-w-xs", className)}>
      <span className="text-caption font-semibold tracking-wide text-muted-foreground uppercase">Kota</span>
      <span className="relative">
        <MapPinIcon className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-forest" aria-hidden />
        <select
          // Uncontrolled, re-mounted when the page's city changes: the choice must still be in the
          // DOM when the form is read on submit, which a controlled value reset after onChange would undo.
          key={kota ?? SEMUA}
          name={name}
          defaultValue={kota ?? SEMUA}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "h-12 min-h-(--touch-target) w-full cursor-pointer appearance-none rounded-full border bg-card pr-11 pl-10 text-body font-medium text-foreground transition-colors outline-none",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            kota ? "border-forest bg-brand-soft" : "border-border-strong hover:bg-accent",
          )}
        >
          <option value={SEMUA}>Semua kota</option>
          {semuaKota.map((satu) => (
            <option key={satu} value={satu}>
              {satu}
            </option>
          ))}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      </span>
    </label>
  );
}

/** The "Terapkan" button a visitor without JavaScript submits the picker with. */
function TerapkanTanpaJs() {
  return (
    <noscript>
      <button type="submit" className="mt-2 h-10 rounded-full border border-border-strong bg-card px-4 text-body font-medium">
        Terapkan
      </button>
    </noscript>
  );
}

export interface KotaPickerTautanProps {
  kota: string | null;
  semuaKota: string[];
  /** Each choice's own shareable URL, keyed by city; "" is "Semua kota". */
  tautan: Record<string, string>;
  /** Where a visitor without JavaScript lands: a GET form to this path, with `tetap` kept. */
  aksi: string;
  /** The other filters a no-JavaScript submit keeps, exactly as the page's URL holds them. */
  tetap?: [string, string][];
  className?: string;
}

/**
 * For a page whose filters are plain URLs (Daftar Lokasi, Pemesanan
 * Terencana): choosing a city goes to that city's own link, the same one the
 * chips used to be, so the filter stays shareable.
 */
export function KotaPickerTautan({ kota, semuaKota, tautan, aksi, tetap = [], className }: KotaPickerTautanProps) {
  const router = useRouter();
  return (
    <form action={aksi} method="get" className={className} onSubmit={(event) => event.preventDefault()}>
      {tetap.map(([name, value], index) => (
        <input key={`${name}-${index}`} type="hidden" name={name} value={value} />
      ))}
      <KotaSelect
        name="kota"
        kota={kota}
        semuaKota={semuaKota}
        onChange={(value) => {
          const href = tautan[value];
          if (href) router.push(href);
        }}
      />
      <TerapkanTanpaJs />
    </form>
  );
}

export interface KotaPickerAksiProps {
  kota: string | null;
  semuaKota: string[];
  /** The Server Action the choice is submitted to (Saat Duka's `ingatKota`). */
  aksi: (formData: FormData) => void | Promise<void>;
  /** The other fields that action reads. */
  tetap: [string, string][];
  className?: string;
}

/** For a filter that is a Server Action (Saat Duka's `ingatKota`, which also remembers the city): choosing submits the form. */
export function KotaPickerAksi({ kota, semuaKota, aksi, tetap, className }: KotaPickerAksiProps) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={aksi} className={className}>
      {tetap.map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <KotaSelect name="kota" kota={kota} semuaKota={semuaKota} onChange={() => form.current?.requestSubmit()} />
      <TerapkanTanpaJs />
    </form>
  );
}
