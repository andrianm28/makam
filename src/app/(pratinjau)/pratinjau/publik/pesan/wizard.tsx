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
import { ArrowRight, Check, ChevronUp, Clock, MoonStar } from "lucide-react";
import { cn } from "@/lib/utils";
import { BASE, BIAYA_LAYANAN_PLATFORM, CS, KOTA, LOKASI, rupiah, totalSaatDuka, type JenisMakam, type LokasiMitra } from "../_mock/data";
import { usePratinjau } from "../_parts/site-shell";
import { DataAnda, Field, Fieldset, inputClass, KirimDenganKode, PemegangHak, Progress } from "../_parts/wizard-kit";

type Pilihan = { lokasi: LokasiMitra; jenis: JenisMakam; total: number };

function parsePilihan(value?: string): Pilihan | undefined {
  if (!value) return undefined;
  const [slug, id] = value.split(".");
  const lokasi = LOKASI.find((l) => l.slug === slug);
  const jenis = lokasi?.jenisMakam.find((j) => j.id === id);
  if (!lokasi || !jenis) return undefined;
  return { lokasi, jenis, total: totalSaatDuka(lokasi, jenis) };
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

function Radio({ on }: { on: boolean }) {
  return (
    <span
      className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-full border-2", on ? "border-forest bg-forest text-primary-foreground" : "border-border-strong")}
      aria-hidden
    >
      {on ? <Check className="size-3.5" /> : null}
    </span>
  );
}

/** Said once per Lokasi: when confirmation comes, and outside Jam Operasional the Kontak Siaga. */
function Konfirmasi({ lokasi }: { lokasi: LokasiMitra }) {
  if (lokasi.bukaSekarang) {
    return (
      <p className="flex items-center gap-2 text-small text-muted-foreground">
        <Clock className="size-4 shrink-0" aria-hidden /> Dikonfirmasi paling lambat {lokasi.konfirmasiPalingLambat}
      </p>
    );
  }
  return (
    <div className="rounded-xl bg-warning-soft px-3 py-2.5 text-small text-warning-soft-foreground">
      <p className="flex items-start gap-2">
        <MoonStar className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          Sekarang di luar Jam Operasional lokasi ini. Dikonfirmasi paling lambat <strong className="font-semibold">{lokasi.konfirmasiPalingLambat}</strong>.
        </span>
      </p>
      <p className="mt-1 pl-6">
        Perlu lebih cepat? Kontak Siaga: {lokasi.kontakSiaga.nama},{" "}
        <a href={`tel:${lokasi.kontakSiaga.telepon.replace(/-/g, "")}`} onClick={(e) => e.stopPropagation()} className="font-semibold underline underline-offset-2">
          {lokasi.kontakSiaga.telepon}
        </a>
      </p>
    </div>
  );
}

type Grup = { lokasi: LokasiMitra; opsi: Pilihan[]; termurah: number };

function grupSaatDuka(kota: string | null): Grup[] {
  return LOKASI.filter((l) => !kota || l.kota === kota)
    .map((lokasi) => {
      const opsi = lokasi.jenisMakam
        .filter((j) => j.tersedia > 0)
        .map((jenis) => ({ lokasi, jenis, total: totalSaatDuka(lokasi, jenis) }))
        .sort((a, b) => a.total - b.total);
      return { lokasi, opsi, termurah: opsi[0]?.total ?? Infinity };
    })
    .filter((g) => g.opsi.length > 0)
    .sort((a, b) => a.termurah - b.termurah);
}

function PilihMakam({ initialLokasi, selected, onSelect }: { initialLokasi?: string; selected?: Pilihan; onSelect: (p: Pilihan) => void }) {
  const { semuaRilis } = usePratinjau();
  const preset = LOKASI.find((l) => l.slug === initialLokasi);
  // "Semua kota" unless the Pemesan came from a Lokasi page.
  const [kota, setKota] = useState<string | null>(preset?.kota ?? null);
  const grup = grupSaatDuka(kota);
  const isSel = (p: Pilihan) => selected?.lokasi.slug === p.lokasi.slug && selected.jenis.id === p.jenis.id;
  const pilih = (p: Pilihan) => ({
    role: "radio" as const,
    "aria-checked": isSel(p),
    tabIndex: 0,
    onClick: () => onSelect(p),
    onKeyDown: (e: React.KeyboardEvent) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect(p)),
  });

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
        {grup.map(({ lokasi, opsi }) => {
          const anySel = opsi.some(isSel);
          const header = (
            <div className="relative size-16 shrink-0 overflow-hidden rounded-xl sm:size-20">
              <Image src={lokasi.foto[0].src} alt="" fill sizes="80px" className="object-cover" />
            </div>
          );
          const lihat = (
            <Link
              href={`${BASE}/lokasi/${lokasi.slug}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-block text-small font-medium text-forest underline-offset-2 hover:underline"
            >
              Lihat lokasi
            </Link>
          );

          if (opsi.length === 1) {
            const p = opsi[0];
            return (
              <li key={lokasi.slug}>
                <div
                  {...pilih(p)}
                  className={cn(
                    "flex cursor-pointer flex-col gap-3 rounded-2xl border bg-card p-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:p-5",
                    isSel(p) ? "border-forest shadow-md ring-1 ring-forest" : "border-border hover:shadow-sm",
                  )}
                >
                  <div className="flex gap-4">
                    {header}
                    <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
                      <div className="min-w-0">
                        <p className="text-title-3 text-foreground">{lokasi.nama}</p>
                        <p className="text-body text-foreground">{p.jenis.nama}</p>
                        <p className="text-small text-muted-foreground">
                          {lokasi.kota} · Masa Hak Pakai {p.jenis.masaHakPakai.toLowerCase()} · {p.jenis.tersedia} tersedia
                        </p>
                      </div>
                      <div className="sm:text-right">
                        <p className="text-title-2 tabular-nums text-foreground">{rupiah(p.total)}</p>
                        <p className="text-caption text-muted-foreground">semua biaya</p>
                      </div>
                    </div>
                    <Radio on={isSel(p)} />
                  </div>
                  <Konfirmasi lokasi={lokasi} />
                  {lihat}
                </div>
              </li>
            );
          }

          return (
            <li key={lokasi.slug}>
              <div className={cn("flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:p-5", anySel ? "border-forest ring-1 ring-forest" : "border-border")}>
                <div className="flex gap-4">
                  {header}
                  <div className="min-w-0 flex-1">
                    <p className="text-title-3 text-foreground">{lokasi.nama}</p>
                    <p className="text-small text-muted-foreground">
                      {lokasi.kota} · {opsi.length} Jenis Makam tersedia
                    </p>
                    <div className="mt-1">{lihat}</div>
                  </div>
                </div>
                <Konfirmasi lokasi={lokasi} />
                <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
                  {opsi.map((p) => (
                    <div
                      key={p.jenis.id}
                      {...pilih(p)}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 px-3 py-3 outline-none first:rounded-t-xl last:rounded-b-xl focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-4",
                        isSel(p) ? "bg-brand-soft" : "hover:bg-accent",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-body font-semibold text-foreground">{p.jenis.nama}</p>
                        <p className="text-small text-muted-foreground">
                          Masa Hak Pakai {p.jenis.masaHakPakai.toLowerCase()} · {p.jenis.tersedia} tersedia
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-body-lg font-semibold tabular-nums text-foreground">{rupiah(p.total)}</p>
                        <p className="text-caption text-muted-foreground">semua biaya</p>
                      </div>
                      <Radio on={isSel(p)} />
                    </div>
                  ))}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {grup.length === 0 ? (
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

function DataKirim({ pilihan, onGanti }: { pilihan: Pilihan; onGanti: () => void }) {
  const [email, setEmail] = useState("");
  const [terkirim, setTerkirim] = useState(false);

  if (terkirim) {
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

      <DataAnda email={email} setEmail={setEmail} />

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

      <PemegangHak />

      <div className="rounded-2xl bg-info-soft p-4 text-body text-info-soft-foreground">
        <p className="font-semibold">Belum ada yang dibayar sekarang.</p>
        <p className="mt-1">
          Tagihan terbit setelah lokasi mengonfirmasi, dan jatuh tempo 3×24 jam setelah pemakaman. Pemakaman tetap berjalan. Dokumen boleh diunggah
          nanti atau dibawa saat hari pemakaman.
        </p>
      </div>

      <KirimDenganKode email={email} onDone={() => setTerkirim(true)} />
    </div>
  );
}

export function WizardSaatDuka({ langkah, pilihan: pilihanParam, lokasi }: { langkah: "pilih" | "data"; pilihan?: string; lokasi?: string }) {
  const router = useRouter();
  const [pilihan, setPilihan] = useState<Pilihan | undefined>(() => parsePilihan(pilihanParam));
  const key = pilihan ? `${pilihan.lokasi.slug}.${pilihan.jenis.id}` : undefined;
  const step = langkah === "data" && pilihan ? 2 : 1;

  const goPilih = () => router.push(`${BASE}/pesan${key ? `?pilihan=${key}` : ""}`);
  const goData = () => key && router.push(`${BASE}/pesan?langkah=data&pilihan=${key}`);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-5 pb-40">
      <Progress
        step={step}
        total={2}
        onBack={() => (step === 2 ? goPilih() : router.push(lokasi ? `${BASE}/lokasi/${lokasi}` : BASE))}
        backLabel={step === 2 ? "Pilih makam" : "Kembali"}
      />
      <div className="mt-6">
        {step === 1 ? <PilihMakam initialLokasi={lokasi} selected={pilihan} onSelect={setPilihan} /> : <DataKirim pilihan={pilihan!} onGanti={goPilih} />}
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
