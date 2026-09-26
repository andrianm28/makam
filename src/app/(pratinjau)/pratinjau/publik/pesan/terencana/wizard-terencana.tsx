"use client";

/*
 * PROTOTYPE, throwaway. The Pemesanan Terencana wizard: Lokasi → Petak (the
 * Denah picker) → Data & kirim. One decision per screen, a progress bar with
 * back, a sticky total bar that expands, no review screen. Nothing is sent.
 */
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, BadgeCheck, Check, ChevronUp, MapPin, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";
import { BASE, BIAYA_LAYANAN_PLATFORM, KOTA, LOKASI, mulaiTerencana, rupiah, type Fasilitas, FASILITAS_LABEL, type LokasiMitra } from "../../_mock/data";
import { DENAH, jumlahTersediaDenah, type Denah } from "../../_mock/denah";
import { barisHarga, DenahPicker, ringkasan, type Pilihan } from "../../_parts/denah-picker";
import { FasilitasIcons } from "../../_parts/lokasi-card";
import { DataAnda, Field, Fieldset, inputClass, KirimDenganKode, PemegangHak, Pilihan2, Progress } from "../../_parts/wizard-kit";

/** Mock: the confirmation promise, the end of the Lokasi's next working day. */
const KONFIRMASI: Record<string, string> = {
  "taman-peristirahatan-hijau-asri": "Minggu, 27 September, pukul 22.00 WIB",
  "pemakaman-wakaf-al-ikhlas": "Senin, 28 September, pukul 22.00 WIB",
};

const HARGA: { id: string; label: string; ok: (n: number) => boolean }[] = [
  { id: "10", label: "Hingga Rp 10 jt", ok: (n) => n <= 10_000_000 },
  { id: "25", label: "Rp 10–25 jt", ok: (n) => n > 10_000_000 && n <= 25_000_000 },
  { id: "lebih", label: "Di atas Rp 25 jt", ok: (n) => n > 25_000_000 },
];
const FASILITAS_FILTER: Fasilitas[] = ["mushola", "parkir", "akses-mobil"];

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-body font-medium whitespace-nowrap",
        on ? "border-forest bg-forest text-primary-foreground" : "border-border-strong bg-card hover:bg-accent",
      )}
    >
      {on ? <Check className="size-4" aria-hidden /> : null}
      {children}
    </button>
  );
}

function PilihLokasi({ onPilih }: { onPilih: (slug: string) => void }) {
  const [kota, setKota] = useState<string | null>(null);
  const [harga, setHarga] = useState<string | null>(null);
  const [fas, setFas] = useState<Fasilitas[]>([]);
  const list = LOKASI.filter(
    (l) =>
      l.terencanaAktif &&
      DENAH[l.slug] &&
      (!kota || l.kota === kota) &&
      (!harga || HARGA.find((h) => h.id === harga)!.ok(mulaiTerencana(l))) &&
      fas.every((f) => l.fasilitas.includes(f)),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-title-1 text-forest md:text-3xl md:leading-tight">Pilih lokasi</h1>
        <p className="mt-1 max-w-2xl text-body-lg text-muted-foreground">
          Lokasi Mitra yang sudah membuka pemesanan terencana. Di langkah berikutnya Anda memilih sendiri petaknya di denah.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Kota">
          {[null, ...KOTA].map((k) => (
            <Chip key={k ?? "semua"} on={kota === k} onClick={() => setKota(k)}>
              {k ?? "Semua kota"}
            </Chip>
          ))}
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Harga dan fasilitas">
          {HARGA.map((h) => (
            <Chip key={h.id} on={harga === h.id} onClick={() => setHarga(harga === h.id ? null : h.id)}>
              {h.label}
            </Chip>
          ))}
          <span className="mx-1 w-px shrink-0 self-stretch bg-border" aria-hidden />
          {FASILITAS_FILTER.map((f) => (
            <Chip key={f} on={fas.includes(f)} onClick={() => setFas(fas.includes(f) ? fas.filter((x) => x !== f) : [...fas, f])}>
              {FASILITAS_LABEL[f]}
            </Chip>
          ))}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {list.map((l) => {
          const n = jumlahTersediaDenah(DENAH[l.slug]);
          return (
            <article key={l.slug} className="group relative flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-xs transition-shadow hover:shadow-md">
              <div className="relative aspect-[16/9] overflow-hidden">
                <Image src={l.foto[0].src} alt={l.foto[0].alt} fill sizes="(min-width: 640px) 480px, 100vw" className="object-cover" />
                <span className="absolute bottom-3 left-3 rounded-full bg-card/90 px-2.5 py-1 text-caption font-medium text-muted-foreground">Foto contoh</span>
              </div>
              <div className="flex flex-1 flex-col gap-3 p-5">
                <div>
                  <h2 className="text-title-2 text-foreground">
                    <button type="button" onClick={() => onPilih(l.slug)} className="text-left after:absolute after:inset-0">
                      {l.nama}
                    </button>
                  </h2>
                  <p className="mt-1 flex items-center gap-1 text-small text-muted-foreground">
                    <MapPin className="size-3.5" aria-hidden /> {l.kota} · Makam {l.jenis.toLowerCase()}
                  </p>
                </div>
                <p className="flex items-center gap-1.5 text-small font-medium text-success-soft-foreground">
                  <BadgeCheck className="size-4" aria-hidden /> Terverifikasi · dikunjungi {l.dikunjungi}
                </p>
                <div className="mt-auto flex items-end justify-between gap-3 pt-2">
                  <div>
                    <p className="text-caption text-muted-foreground">mulai</p>
                    <p className="text-title-2 tabular-nums">{rupiah(mulaiTerencana(l))}</p>
                    <p className="text-caption text-muted-foreground">Hak Pakai; biaya pemakaman dibayar nanti</p>
                  </div>
                  <FasilitasIcons fasilitas={l.fasilitas} />
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                  <span className="text-small text-foreground">{n} petak atau kavling bisa dipilih</span>
                  <span className="inline-flex items-center gap-1 text-body font-semibold text-forest">
                    Pilih petak <ArrowRight className="size-4" aria-hidden />
                  </span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border-strong p-6 text-center text-body text-muted-foreground">
          Belum ada lokasi dengan pemesanan terencana yang cocok. Coba hapus salah satu filter.
        </p>
      ) : null}
    </div>
  );
}

function TotalBarTerencana({ lokasi, denah, pilihan, action }: { lokasi: LokasiMitra; denah: Denah; pilihan: Pilihan; action?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const baris = barisHarga(lokasi, denah, pilihan);
  const ada = baris.length > 0;
  const total = baris.reduce((n, b) => n + b.harga, 0) + BIAYA_LAYANAN_PLATFORM;
  const nanti = lokasi.biayaPemakaman + BIAYA_LAYANAN_PLATFORM;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card shadow-[0_-8px_24px_-12px] shadow-forest/20">
      <div className="mx-auto max-w-5xl px-4">
        {open && ada ? (
          <div id="rincian-terencana" className="max-h-[50vh] overflow-y-auto border-b border-border py-4">
            <dl className="flex flex-col gap-2 text-body tabular-nums">
              {baris.map((b) => (
                <div key={b.label} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{b.label}</dt>
                  <dd className="whitespace-nowrap">{rupiah(b.harga)}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Biaya Layanan Platform · Makam.co.id</dt>
                <dd className="whitespace-nowrap">{rupiah(BIAYA_LAYANAN_PLATFORM)}</dd>
              </div>
            </dl>
            <div className="mt-3 rounded-xl bg-muted px-3 py-2.5 text-small text-foreground">
              <p className="font-semibold">Nanti, setiap pemakaman</p>
              <p className="mt-0.5 text-muted-foreground">
                Biaya Pemakaman + Biaya Layanan Platform, sesuai tarif saat pemakaman (saat ini {rupiah(nanti)}). Dibayar setelah pemakaman, bukan sekarang.
              </p>
            </div>
          </div>
        ) : null}
        <div className="flex items-center gap-3 py-3">
          <button
            type="button"
            disabled={!ada}
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls="rincian-terencana"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left disabled:cursor-default"
          >
            <span className="min-w-0">
              <span className="line-clamp-2 block text-caption text-muted-foreground">{ringkasan(denah, pilihan)}</span>
              <span className="block text-title-2 tabular-nums text-foreground">{ada ? rupiah(total) : "Pilih petak di denah"}</span>
              {ada ? <span className="hidden text-caption text-muted-foreground sm:block">Hak Pakai + Biaya Layanan Platform; biaya pemakaman nanti</span> : null}
            </span>
            {ada ? <ChevronUp className={cn("size-5 shrink-0 text-forest transition-transform", !open && "rotate-180")} aria-hidden /> : null}
          </button>
          {action}
        </div>
      </div>
    </div>
  );
}

function DataKirimTerencana({ lokasi, denah, pilihan, onGanti }: { lokasi: LokasiMitra; denah: Denah; pilihan: Pilihan; onGanti: () => void }) {
  const [email, setEmail] = useState("");
  const [calon, setCalon] = useState("saya");
  const [terkirim, setTerkirim] = useState(false);
  const konfirmasi = KONFIRMASI[lokasi.slug] ?? "akhir hari kerja berikutnya";

  if (terkirim) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <span className="inline-flex size-11 items-center justify-center rounded-full bg-success-soft text-success-soft-foreground">
          <Check className="size-6" aria-hidden />
        </span>
        <h1 className="mt-4 text-title-1 text-forest">Pesanan terkirim</h1>
        <p className="mt-1 text-body-lg text-muted-foreground">
          Nomor Pemesanan <span className="font-mono font-semibold text-foreground">MKM-2026-000124</span>
        </p>
        <p className="mt-3 text-body text-foreground">
          {ringkasan(denah, pilihan)} kini ditahan untuk Anda. {lokasi.nama} akan mengonfirmasi paling lambat <strong>{konfirmasi}</strong>; setelah itu Anda
          punya 24 jam untuk membayar. Kabar berikutnya kami kirim ke email Anda.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-title-1 text-forest md:text-3xl md:leading-tight">Data & kirim</h1>
        <p className="mt-1 text-body-lg text-muted-foreground">Data untuk mencatat Hak Pakai. Tidak ada yang dibayar saat mengirim.</p>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-brand-soft px-4 py-3">
        <p className="min-w-0 text-body text-brand-soft-foreground">
          <span className="font-semibold">{ringkasan(denah, pilihan)}</span> · {lokasi.nama}
        </p>
        <button type="button" onClick={onGanti} className="shrink-0 text-body font-semibold text-forest underline underline-offset-2">
          Ganti
        </button>
      </div>

      <DataAnda email={email} setEmail={setEmail} />

      <Fieldset legend="Calon Penghuni" note="Untuk siapa makam ini disiapkan. Bisa Anda ubah kapan saja nanti.">
        <Pilihan2
          label="Calon Penghuni"
          value={calon}
          onChange={setCalon}
          options={[
            ["saya", "Untuk saya sendiri"],
            ["lain", "Untuk orang lain"],
          ]}
        />
        {calon === "lain" ? (
          <Field id="calon-nama" label="Nama Calon Penghuni">
            <input id="calon-nama" className={inputClass} />
          </Field>
        ) : null}
      </Fieldset>

      <PemegangHak />

      <section aria-labelledby="syarat" className="rounded-2xl border border-border bg-card p-5">
        <h2 id="syarat" className="flex items-center gap-2 text-title-3 text-foreground">
          <ScrollText className="size-5 text-forest" aria-hidden /> Syarat Pemesanan Terencana
        </h2>
        <ul className="mt-3 flex flex-col gap-2 text-body text-foreground">
          {lokasi.pembatalan.map((p) => (
            <li key={p} className="flex items-start gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-sage-strong" aria-hidden /> {p}
            </li>
          ))}
          <li className="flex items-start gap-2">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-sage-strong" aria-hidden /> Hak Pakai diberikan oleh {lokasi.pengelola}; Makam.co.id mencatat
            dan menerima pembayarannya.
          </li>
        </ul>
        <p className="mt-3 text-small text-muted-foreground">Syarat ini disimpan bersama pesanan Anda; perubahan kebijakan lokasi kemudian tidak mengubahnya.</p>
      </section>

      <div className="rounded-2xl bg-info-soft p-4 text-body text-info-soft-foreground">
        <p className="font-semibold">Belum ada yang dibayar sekarang.</p>
        <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
          <li>Petak yang Anda pilih ditahan untuk Anda sejak pesanan dikirim.</li>
          <li>Admin Lokasi mengonfirmasi paling lambat {konfirmasi}.</li>
          <li>Setelah dikonfirmasi, Tagihan terbit dan Anda punya 24 jam untuk membayar; kami ingatkan sekitar 4 jam sebelum batasnya.</li>
          <li>Sebelum membayar, Anda bisa membatalkan kapan saja tanpa biaya.</li>
        </ul>
      </div>

      <KirimDenganKode email={email} onDone={() => setTerkirim(true)} />
    </div>
  );
}

function parsePilihan(petak?: string, kavling?: string): Pilihan {
  if (kavling) return { jenis: "kavling", nomor: kavling };
  if (petak) return { jenis: "petak", nomor: petak.split(",").filter(Boolean) };
  return { jenis: "kosong" };
}

function query(pilihan: Pilihan) {
  if (pilihan.jenis === "kavling") return `&kavling=${pilihan.nomor}`;
  if (pilihan.jenis === "petak") return `&petak=${pilihan.nomor.join(",")}`;
  return "";
}

export function WizardTerencana({
  langkah,
  lokasi: slug,
  blok,
  petak,
  kavling,
}: {
  langkah: "lokasi" | "petak" | "data";
  lokasi?: string;
  blok?: string;
  petak?: string;
  kavling?: string;
}) {
  const router = useRouter();
  const lokasi = LOKASI.find((l) => l.slug === slug && l.terencanaAktif);
  const denah = lokasi ? DENAH[lokasi.slug] : undefined;
  const [pilihan, setPilihan] = useState<Pilihan>(() => parsePilihan(petak, kavling));
  const [diambil, setDiambil] = useState<string[]>([]);
  const [pesan, setPesan] = useState<string | null>(null);

  const step = !lokasi || !denah || langkah === "lokasi" ? 1 : langkah === "data" && pilihan.jenis !== "kosong" ? 3 : 2;
  const url = (l: string) => `${BASE}/pesan/terencana?langkah=${l}&lokasi=${slug}${query(pilihan)}`;

  function lanjut() {
    if (!denah) return;
    // Mock: one Petak is taken by another family while this one was choosing.
    if (pilihan.jenis === "petak" && pilihan.nomor.includes(denah.baruSajaDipesan)) {
      const sisa = pilihan.nomor.filter((n) => n !== denah.baruSajaDipesan);
      setDiambil([...diambil, denah.baruSajaDipesan]);
      setPilihan(sisa.length ? { jenis: "petak", nomor: sisa } : { jenis: "kosong" });
      setPesan(
        `Maaf, petak ${denah.baruSajaDipesan} baru saja dipesan keluarga lain. ${sisa.length ? "Petak lain yang Anda pilih tetap tersimpan." : "Silakan pilih petak lain."}`,
      );
      return;
    }
    router.push(url("data"));
  }

  return (
    <div className={cn("mx-auto w-full px-4 pt-5", step === 3 ? "max-w-3xl pb-40" : "max-w-5xl", step === 2 ? "pb-40" : "pb-16")}>
      <Progress
        step={step}
        total={3}
        onBack={() =>
          step === 3 ? router.push(url("petak")) : step === 2 ? router.push(`${BASE}/pesan/terencana`) : router.push(BASE)
        }
        backLabel={step === 3 ? "Pilih petak" : step === 2 ? "Pilih lokasi" : "Kembali"}
      />
      <div className="mt-6">
        {step === 1 ? <PilihLokasi onPilih={(s) => router.push(`${BASE}/pesan/terencana?langkah=petak&lokasi=${s}`)} /> : null}
        {step === 2 && lokasi && denah ? (
          <div className="flex flex-col gap-5">
            <div>
              <h1 className="text-title-1 text-forest md:text-3xl md:leading-tight">Pilih petak</h1>
              <p className="mt-1 text-body-lg text-muted-foreground">
                {lokasi.nama}, {lokasi.kota}.{" "}
                <Link href={`${BASE}/lokasi/${lokasi.slug}`} className="font-medium text-forest underline-offset-2 hover:underline">
                  Lihat lokasi
                </Link>
              </p>
            </div>
            <DenahPicker lokasi={lokasi} denah={denah} pilihan={pilihan} setPilihan={setPilihan} diambil={diambil} pesan={pesan} setPesan={setPesan} blokAwal={blok} />
          </div>
        ) : null}
        {step === 3 && lokasi && denah ? <DataKirimTerencana lokasi={lokasi} denah={denah} pilihan={pilihan} onGanti={() => router.push(url("petak"))} /> : null}
      </div>
      {step >= 2 && lokasi && denah ? (
        <TotalBarTerencana
          lokasi={lokasi}
          denah={denah}
          pilihan={pilihan}
          action={
            step === 2 ? (
              <button
                type="button"
                disabled={pilihan.jenis === "kosong"}
                onClick={lanjut}
                className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-primary px-6 text-body-lg font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              >
                Lanjut <ArrowRight className="size-5" aria-hidden />
              </button>
            ) : undefined
          }
        />
      ) : null}
    </div>
  );
}
