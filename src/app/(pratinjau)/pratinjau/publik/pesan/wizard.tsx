"use client";

/*
 * PROTOTYPE, throwaway. The Saat Duka wizard (one decision per screen, a
 * progress bar with back, a sticky "Total semua biaya" bar that expands, no
 * review screen). Nothing is sent: Kirim only shows the Kode Masuk step and a
 * mock confirmation.
 */
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronUp, Clock, Mail, MessageCircle, MoonStar, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { BASE, BIAYA_LAYANAN_PLATFORM, CS, KOTA, LOKASI, pilihanSaatDuka, rupiah, type JenisMakam, type LokasiMitra } from "../_mock/data";
import { usePratinjau } from "../_parts/site-shell";

type Pilihan = { lokasi: LokasiMitra; jenis: JenisMakam; total: number };

function parsePilihan(value?: string): Pilihan | undefined {
  if (!value) return undefined;
  const [slug, id] = value.split(".");
  const lokasi = LOKASI.find((l) => l.slug === slug);
  const jenis = lokasi?.jenisMakam.find((j) => j.id === id);
  if (!lokasi || !jenis) return undefined;
  return { lokasi, jenis, total: jenis.hargaHakPakai + lokasi.biayaPemakaman + BIAYA_LAYANAN_PLATFORM };
}

function Progress({ step, onBack, backLabel }: { step: 1 | 2; onBack: () => void; backLabel: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="-ml-2 inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-body font-medium text-forest hover:bg-accent">
          <ArrowLeft className="size-4" aria-hidden /> {backLabel}
        </button>
        <span className="text-small text-muted-foreground">Langkah {step} dari 2</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={1} aria-valuemax={2} aria-valuenow={step} aria-label="Langkah pemesanan">
        <div className="h-full rounded-full bg-forest transition-all" style={{ width: step === 1 ? "50%" : "100%" }} />
      </div>
    </div>
  );
}

function TotalBar({ pilihan, action }: { pilihan?: Pilihan; action?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card shadow-[0_-8px_24px_-12px] shadow-forest/20">
      <div className="mx-auto max-w-3xl px-4">
        {open && pilihan ? (
          <div id="rincian-total" className="border-b border-border py-4">
            <dl className="flex flex-col gap-2 text-body tabular-nums">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">
                  Harga Hak Pakai · {pilihan.jenis.nama}, {pilihan.jenis.masaHakPakai.toLowerCase()}
                </dt>
                <dd className="whitespace-nowrap">{rupiah(pilihan.jenis.hargaHakPakai)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Biaya Pemakaman · {pilihan.lokasi.nama}</dt>
                <dd className="whitespace-nowrap">{rupiah(pilihan.lokasi.biayaPemakaman)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Biaya Layanan Platform · Makam.co.id</dt>
                <dd className="whitespace-nowrap">{rupiah(BIAYA_LAYANAN_PLATFORM)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-small text-muted-foreground">
              Tidak ada yang dibayar sekarang. Tagihan terbit setelah lokasi mengonfirmasi dan jatuh tempo 3×24 jam setelah pemakaman.
            </p>
          </div>
        ) : null}
        <div className="flex items-center gap-3 py-3">
          <button
            type="button"
            disabled={!pilihan}
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls="rincian-total"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left disabled:cursor-default"
          >
            <span className="min-w-0">
              <span className="block text-caption text-muted-foreground">Total semua biaya</span>
              <span className="block text-title-2 tabular-nums text-foreground">{pilihan ? rupiah(pilihan.total) : "Pilih makam dulu"}</span>
            </span>
            {pilihan ? <ChevronUp className={cn("size-5 shrink-0 text-forest transition-transform", !open && "rotate-180")} aria-hidden /> : null}
            {pilihan ? <span className="sr-only">{open ? "Sembunyikan rincian" : "Lihat rincian"}</span> : null}
          </button>
          {action}
        </div>
      </div>
    </div>
  );
}

function PilihMakam({ initialLokasi, selected, onSelect }: { initialLokasi?: string; selected?: Pilihan; onSelect: (p: Pilihan) => void }) {
  const { semuaRilis } = usePratinjau();
  const preset = LOKASI.find((l) => l.slug === initialLokasi);
  // Prefilled from the last choice (mock: Bogor), or from the Lokasi page deep link.
  const [kota, setKota] = useState<string | null>(preset?.kota ?? selected?.lokasi.kota ?? "Bogor");
  const list = pilihanSaatDuka(kota ?? undefined);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-title-1 text-forest md:text-3xl md:leading-tight">Pilih makam</h1>
        <p className="mt-1 text-body-lg text-muted-foreground">Diurutkan dari total biaya terendah. Hanya makam yang masih tersedia yang ditampilkan.</p>
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Kota">
        {[null, ...KOTA].map((k) => (
          <button
            key={k ?? "semua"}
            type="button"
            aria-pressed={kota === k}
            onClick={() => setKota(k)}
            className={cn(
              "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-body font-medium",
              kota === k ? "border-forest bg-forest text-primary-foreground" : "border-border-strong bg-card hover:bg-accent",
            )}
          >
            {kota === k ? <Check className="size-4" aria-hidden /> : null}
            {k ?? "Semua kota"}
          </button>
        ))}
      </div>

      <ul className="flex flex-col gap-3" role="radiogroup" aria-label="Pilihan makam">
        {list.map((p) => {
          const isSel = selected?.lokasi.slug === p.lokasi.slug && selected.jenis.id === p.jenis.id;
          return (
            <li key={p.lokasi.slug + p.jenis.id}>
              <div
                role="radio"
                aria-checked={isSel}
                tabIndex={0}
                onClick={() => onSelect(p)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect(p))}
                className={cn(
                  "cursor-pointer rounded-2xl border bg-card p-4 transition-shadow outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:p-5",
                  isSel ? "border-forest shadow-md ring-1 ring-forest" : "border-border hover:shadow-sm",
                  preset?.slug === p.lokasi.slug && !isSel && "border-sage",
                )}
              >
                <div className="flex gap-4">
                  <div className="relative size-16 shrink-0 overflow-hidden rounded-xl sm:size-20">
                    <Image src={p.lokasi.foto[0].src} alt="" fill sizes="80px" className="object-cover" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <p className="text-title-3 text-foreground">{p.jenis.nama}</p>
                      <p className="text-body text-foreground">{p.lokasi.nama}</p>
                      <p className="text-small text-muted-foreground">
                        {p.lokasi.kota} · Masa Hak Pakai {p.jenis.masaHakPakai.toLowerCase()} · {p.jenis.tersedia} tersedia
                      </p>
                    </div>
                    <div className="sm:text-right">
                      <p className="text-title-2 tabular-nums text-foreground">{rupiah(p.total)}</p>
                      <p className="text-caption text-muted-foreground">semua biaya</p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "mt-1 inline-flex size-6 shrink-0 items-center justify-center rounded-full border-2",
                      isSel ? "border-forest bg-forest text-primary-foreground" : "border-border-strong",
                    )}
                    aria-hidden
                  >
                    {isSel ? <Check className="size-3.5" /> : null}
                  </span>
                </div>
                {p.lokasi.bukaSekarang ? (
                  <p className="mt-3 flex items-center gap-2 text-small text-muted-foreground">
                    <Clock className="size-4 shrink-0" aria-hidden /> Dikonfirmasi paling lambat {p.lokasi.konfirmasiPalingLambat}
                  </p>
                ) : (
                  <div className="mt-3 rounded-xl bg-warning-soft px-3 py-2.5 text-small text-warning-soft-foreground">
                    <p className="flex items-start gap-2">
                      <MoonStar className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <span>
                        Sekarang di luar Jam Operasional lokasi ini. Dikonfirmasi paling lambat <strong className="font-semibold">{p.lokasi.konfirmasiPalingLambat}</strong>.
                      </span>
                    </p>
                    <p className="mt-1 pl-6">
                      Perlu lebih cepat? Kontak Siaga: {p.lokasi.kontakSiaga.nama},{" "}
                      <a href={`tel:${p.lokasi.kontakSiaga.telepon.replace(/-/g, "")}`} onClick={(e) => e.stopPropagation()} className="font-semibold underline underline-offset-2">
                        {p.lokasi.kontakSiaga.telepon}
                      </a>
                    </p>
                  </div>
                )}
                <Link
                  href={`${BASE}/lokasi/${p.lokasi.slug}`}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-2 inline-block text-small font-medium text-forest underline-offset-2 hover:underline"
                >
                  Lihat lokasi
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border-strong p-6 text-center text-body text-muted-foreground">
          Belum ada makam tersedia di kota ini. Coba kota lain, atau tanyakan kepada CS kami.
        </p>
      ) : null}
      <p className="text-small text-muted-foreground">
        {semuaRilis
          ? "Pemakaman di TPU DKI lewat Pengurusan ditampilkan di bawah daftar ini."
          : "Pemakaman di TPU DKI segera hadir. Sementara ini, CS kami bisa membantu mengarahkan."}{" "}
        <a href={CS.waLink} target="_blank" rel="noreferrer" className="font-medium text-forest">
          Tanya CS
        </a>
      </p>
    </div>
  );
}

function Field({ label, hint, children, id, optional }: { label: string; hint?: string; children: React.ReactNode; id: string; optional?: boolean }) {
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

const inputClass =
  "h-12 w-full rounded-lg border border-input bg-card px-3.5 text-body-lg text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function Fieldset({ legend, note, children }: { legend: string; note?: string; children: React.ReactNode }) {
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

function DataKirim({ pilihan, onGanti }: { pilihan: Pilihan; onGanti: () => void }) {
  const [pemegang, setPemegang] = useState<"saya" | "lain">("saya");
  const [email, setEmail] = useState("");
  const [tahap, setTahap] = useState<"isi" | "kode" | "terkirim">("isi");

  if (tahap === "terkirim") {
    return (
      <div className="flex flex-col gap-6">
        <div className="rounded-2xl border border-border bg-card p-6">
          <span className="inline-flex size-11 items-center justify-center rounded-full bg-success-soft text-success-soft-foreground">
            <Check className="size-6" aria-hidden />
          </span>
          <h1 className="mt-4 text-title-1 text-forest">Pesanan terkirim</h1>
          <p className="mt-1 text-body-lg text-muted-foreground">
            Nomor Pemesanan <span className="font-mono font-semibold text-foreground">MKM-2026-000123</span>
          </p>
          <p className="mt-3 text-body text-foreground">
            {pilihan.lokasi.nama} akan mengonfirmasi paling lambat <strong>{pilihan.lokasi.konfirmasiPalingLambat}</strong>. Kabar berikutnya kami kirim ke
            email Anda.
          </p>
        </div>
        <p className="text-small text-muted-foreground">(Pratinjau: halaman status pesanan tidak termasuk dalam prototipe ini.)</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-title-1 text-forest md:text-3xl md:leading-tight">Data & kirim</h1>
        <p className="mt-1 text-body-lg text-muted-foreground">Cukup yang kami perlukan untuk menyiapkan pemakaman. Sisanya bisa menyusul.</p>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-brand-soft px-4 py-3">
        <p className="min-w-0 text-body text-brand-soft-foreground">
          <span className="font-semibold">{pilihan.jenis.nama}</span> · {pilihan.lokasi.nama}
        </p>
        <button type="button" onClick={onGanti} className="shrink-0 text-body font-semibold text-forest underline underline-offset-2">
          Ganti
        </button>
      </div>

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

      <Fieldset legend="Almarhum">
        <Field id="almarhum" label="Nama almarhum / almarhumah">
          <input id="almarhum" className={inputClass} />
        </Field>
        <Field id="wafat" label="Tanggal wafat">
          <input id="wafat" type="date" className={inputClass} defaultValue="2026-09-26" />
        </Field>
      </Fieldset>

      <Fieldset legend="Rencana pemakaman" note="Boleh dikosongkan; lokasi akan menghubungi Anda.">
        <Field id="waktu" label="Waktu pemakaman yang direncanakan" optional>
          <input id="waktu" type="datetime-local" className={inputClass} />
        </Field>
        <Field id="penempatan" label="Keinginan penempatan" optional hint="Misalnya dekat makam keluarga, bila memungkinkan. Lokasi yang menentukan petaknya.">
          <textarea id="penempatan" rows={2} className={cn(inputClass, "h-auto py-3")} />
        </Field>
      </Fieldset>

      <Fieldset legend="Pemegang Hak" note="Yang berhak atas makam ini, misalnya untuk memperpanjang atau pemakaman berikutnya.">
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Pemegang Hak">
          {(
            [
              ["saya", "Saya sendiri"],
              ["lain", "Anggota keluarga lain"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={pemegang === v}
              onClick={() => setPemegang(v)}
              className={cn(
                "flex h-12 items-center gap-3 rounded-lg border px-4 text-left text-body-lg",
                pemegang === v ? "border-forest bg-brand-soft font-medium text-brand-soft-foreground" : "border-input bg-card",
              )}
            >
              <span className={cn("size-4 rounded-full border-2", pemegang === v ? "border-forest bg-forest ring-2 ring-card ring-inset" : "border-border-strong")} aria-hidden />
              {label}
            </button>
          ))}
        </div>
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

      <div className="rounded-2xl bg-info-soft p-4 text-body text-info-soft-foreground">
        <p className="font-semibold">Belum ada yang dibayar sekarang.</p>
        <p className="mt-1">
          Tagihan terbit setelah lokasi mengonfirmasi, dan jatuh tempo 3×24 jam setelah pemakaman. Pemakaman tetap berjalan. Dokumen boleh diunggah
          nanti atau dibawa saat hari pemakaman.
        </p>
      </div>

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
            onClick={() => setTahap("terkirim")}
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
    </div>
  );
}

export function WizardSaatDuka({ langkah, pilihan: pilihanParam, lokasi }: { langkah: "pilih" | "data"; pilihan?: string; lokasi?: string }) {
  const router = useRouter();
  const [pilihan, setPilihan] = useState<Pilihan | undefined>(() => parsePilihan(pilihanParam));
  const key = pilihan ? `${pilihan.lokasi.slug}.${pilihan.jenis.id}` : undefined;
  const step: 1 | 2 = langkah === "data" && pilihan ? 2 : 1;

  const goPilih = () => router.push(`${BASE}/pesan${key ? `?pilihan=${key}` : ""}`);
  const goData = () => key && router.push(`${BASE}/pesan?langkah=data&pilihan=${key}`);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-5 pb-40">
      <Progress
        step={step}
        onBack={() => (step === 2 ? goPilih() : router.push(lokasi ? `${BASE}/lokasi/${lokasi}` : BASE))}
        backLabel={step === 2 ? "Pilih makam" : "Kembali"}
      />
      <div className="mt-6">
        {step === 1 ? (
          <PilihMakam initialLokasi={lokasi} selected={pilihan} onSelect={setPilihan} />
        ) : (
          <DataKirim pilihan={pilihan!} onGanti={goPilih} />
        )}
      </div>
      <TotalBar
        pilihan={pilihan}
        action={
          step === 1 ? (
            <button
              type="button"
              disabled={!pilihan}
              onClick={goData}
              className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-primary px-6 text-body-lg font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              Lanjut <ArrowRight className="size-5" aria-hidden />
            </button>
          ) : undefined
        }
      />
    </div>
  );
}
