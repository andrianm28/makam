"use client";

/*
 * PROTOTYPE, throwaway. Pieces shared by the Saat Duka and Terencana wizards:
 * progress bar with back, form fields, the Pemesan and Pemegang Hak sections,
 * the email Kode Masuk step and the "Tidak punya email?" CS line.
 */
import { useState } from "react";
import { ArrowLeft, ArrowRight, Mail, MessageCircle, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { CS } from "../_mock/data";

export function Progress({ step, total, onBack, backLabel }: { step: number; total: number; onBack: () => void; backLabel: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="-ml-2 inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-body font-medium text-forest hover:bg-accent">
          <ArrowLeft className="size-4" aria-hidden /> {backLabel}
        </button>
        <span className="text-small text-muted-foreground">
          Langkah {step} dari {total}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step} aria-label="Langkah pemesanan">
        <div className="h-full rounded-full bg-forest transition-all" style={{ width: `${(step / total) * 100}%` }} />
      </div>
    </div>
  );
}

export const inputClass =
  "h-12 w-full rounded-lg border border-input bg-card px-3.5 text-body-lg text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function Field({ label, hint, children, id, optional }: { label: string; hint?: string; children: React.ReactNode; id: string; optional?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-body font-medium text-foreground">
        {label}
        {optional ? <span className="font-normal text-muted-foreground"> (opsional)</span> : null}
      </label>
      {children}
      {hint ? <p className="text-small text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function Fieldset({ legend, note, children }: { legend: string; note?: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      <legend className="sr-only">{legend}</legend>
      <div aria-hidden>
        <p className="text-title-3 text-foreground">{legend}</p>
        {note ? <p className="mt-0.5 text-small text-muted-foreground">{note}</p> : null}
      </div>
      {children}
    </fieldset>
  );
}

export function Pilihan2({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: [string, string][]; label: string }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "flex h-12 items-center gap-3 rounded-lg border px-4 text-left text-body-lg",
            value === v ? "border-forest bg-brand-soft font-medium text-brand-soft-foreground" : "border-input bg-card",
          )}
        >
          <span className={cn("size-4 rounded-full border-2", value === v ? "border-forest bg-forest ring-2 ring-card ring-inset" : "border-border-strong")} aria-hidden />
          {text}
        </button>
      ))}
    </div>
  );
}

export function DataAnda({ email, setEmail }: { email: string; setEmail: (v: string) => void }) {
  return (
    <Fieldset legend="Data Anda">
      <Field id="nama" label="Nama lengkap">
        <input id="nama" className={inputClass} autoComplete="name" placeholder="Nama sesuai KTP" />
      </Field>
      <Field id="email" label="Email" hint="Kode Masuk dikirim ke email ini saat Anda menekan Kirim. Semua kabar pesanan juga dikirim ke sini.">
        <input id="email" type="email" required className={inputClass} autoComplete="email" inputMode="email" placeholder="nama@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field id="telepon" label="Nomor telepon" hint="Agar lokasi dan tim kami bisa menelepon bila perlu.">
        <input id="telepon" type="tel" className={inputClass} autoComplete="tel" inputMode="tel" placeholder="08xx-xxxx-xxxx" />
      </Field>
    </Fieldset>
  );
}

export function PemegangHak() {
  const [pemegang, setPemegang] = useState("saya");
  return (
    <Fieldset legend="Pemegang Hak" note="Yang berhak atas makam ini, misalnya untuk memperpanjang atau pemakaman berikutnya.">
      <Pilihan2
        label="Pemegang Hak"
        value={pemegang}
        onChange={setPemegang}
        options={[
          ["saya", "Saya sendiri"],
          ["lain", "Anggota keluarga lain"],
        ]}
      />
      {pemegang === "lain" ? (
        <div className="flex flex-col gap-4 border-t border-border pt-4">
          <Field id="ph-nama" label="Nama Pemegang Hak">
            <input id="ph-nama" className={inputClass} />
          </Field>
          <Field id="ph-telepon" label="Nomor telepon Pemegang Hak">
            <input id="ph-telepon" type="tel" className={inputClass} inputMode="tel" />
          </Field>
          <Field id="ph-email" label="Email Pemegang Hak" optional hint="Bila diisi, makam ini tampil di Akun dengan email tersebut.">
            <input id="ph-email" type="email" className={inputClass} inputMode="email" />
          </Field>
        </div>
      ) : null}
    </Fieldset>
  );
}

/** Kirim → the email Kode Masuk inline → onDone. */
export function KirimDenganKode({ email, onDone }: { email: string; onDone: () => void }) {
  const [tahap, setTahap] = useState<"isi" | "kode">("isi");
  return (
    <>
      {tahap === "isi" ? (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setTahap("kode")}
            className="inline-flex h-13 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-body-lg font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Kirim pesanan <ArrowRight className="size-5" aria-hidden />
          </button>
          <p className="text-center text-small text-muted-foreground">Kami akan mengirim Kode Masuk ke email Anda untuk memastikan email itu milik Anda.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 rounded-2xl border-2 border-forest bg-card p-5">
          <p className="flex items-center gap-2 text-title-3 text-foreground">
            <Mail className="size-5 text-forest" aria-hidden /> Masukkan Kode Masuk
          </p>
          <p className="text-body text-muted-foreground">
            Kami mengirim 6 angka ke <span className="font-medium text-foreground">{email || "nama@email.com"}</span>. Periksa juga folder spam.
          </p>
          <input
            aria-label="Kode Masuk"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="••••••"
            className={cn(inputClass, "text-center font-mono text-title-1 tracking-[0.5em]")}
          />
          <button
            type="button"
            onClick={onDone}
            className="inline-flex h-12 items-center justify-center rounded-xl bg-primary px-6 text-body-lg font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Konfirmasi & kirim pesanan
          </button>
          <div className="flex items-center justify-between text-small">
            <button type="button" className="font-medium text-forest">
              Kirim ulang kode
            </button>
            <button type="button" onClick={() => setTahap("isi")} className="text-muted-foreground">
              Ubah email
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-col items-center gap-1 text-center text-body">
        <a href={CS.waLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-semibold text-forest">
          <MessageCircle className="size-4" aria-hidden /> Tidak punya email? Minta bantuan CS
        </a>
        <p className="inline-flex items-center gap-1.5 text-small text-muted-foreground">
          <Phone className="size-3.5" aria-hidden /> {CS.phone} · CS dapat mengirimkan pesanan ini untuk Anda
        </p>
      </div>
    </>
  );
}
