"use client";

/* PROTOTYPE, throwaway. Daftar Lokasi Makam with city, type and facility filters. */
import Link from "next/link";
import { useState } from "react";
import { Check, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { BASE, FASILITAS_LABEL, KOTA, LOKASI, type Fasilitas, type JenisLokasi } from "../_mock/data";
import { LokasiCard } from "../_parts/lokasi-card";
import { usePratinjau } from "../_parts/site-shell";

const JENIS: JenisLokasi[] = ["Swasta", "Wakaf", "Yayasan", "Masjid"];
const FILTER_FASILITAS: Fasilitas[] = ["mushola", "parkir", "akses-mobil", "pendopo", "keamanan"];

function Chip({ selected, onClick, children, disabled }: { selected?: boolean; onClick?: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-body font-medium whitespace-nowrap transition-colors",
        selected ? "border-forest bg-forest text-primary-foreground" : "border-border-strong bg-card text-foreground hover:bg-accent",
        disabled && "cursor-not-allowed border-dashed text-muted-foreground hover:bg-card",
      )}
    >
      {selected ? <Check className="size-4" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function DaftarLokasi({ terencana }: { terencana: boolean }) {
  const { semuaRilis } = usePratinjau();
  const [kota, setKota] = useState<string | null>(null);
  const [jenis, setJenis] = useState<JenisLokasi | null>(null);
  const [fasilitas, setFasilitas] = useState<Fasilitas[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);

  const list = LOKASI.filter(
    (l) =>
      (!terencana || l.terencanaAktif) &&
      (!kota || l.kota === kota) &&
      (!jenis || l.jenis === jenis) &&
      fasilitas.every((f) => l.fasilitas.includes(f)),
  );
  const activeCount = (jenis ? 1 : 0) + fasilitas.length;

  const secondaryFilters = (
    <>
      <div className="flex flex-col gap-2">
        <span className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Jenis lokasi</span>
        <div className="flex flex-wrap gap-2">
          {JENIS.map((j) => (
            <Chip key={j} selected={jenis === j} onClick={() => setJenis(jenis === j ? null : j)}>
              {j}
            </Chip>
          ))}
          <Chip disabled={!semuaRilis}>TPU DKI{semuaRilis ? "" : " · segera hadir"}</Chip>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Fasilitas</span>
        <div className="flex flex-wrap gap-2">
          {FILTER_FASILITAS.map((f) => (
            <Chip key={f} selected={fasilitas.includes(f)} onClick={() => setFasilitas(fasilitas.includes(f) ? fasilitas.filter((x) => x !== f) : [...fasilitas, f])}>
              {FASILITAS_LABEL[f]}
            </Chip>
          ))}
        </div>
      </div>
    </>
  );

  return (
    <div className="mx-auto w-full max-w-[80rem] px-4 py-8 md:px-8 md:py-12">
      <nav aria-label="Jejak halaman" className="text-small text-muted-foreground">
        <Link href={BASE} className="hover:text-forest">
          Beranda
        </Link>{" "}
        / Daftar Lokasi
      </nav>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-forest md:text-4xl">{terencana ? "Siapkan makam untuk nanti" : "Daftar Lokasi Makam"}</h1>
      <p className="mt-2 max-w-2xl text-body-lg text-muted-foreground">
        {terencana
          ? "Pilih lokasi dengan tenang. Di lokasi berikut Anda bisa memilih sendiri petak makamnya di denah; bayar setelah pengelola mengonfirmasi."
          : "Semua Lokasi Mitra di sini sudah terverifikasi: perjanjian ditandatangani, lokasi dikunjungi petugas kami, dan tarifnya diperiksa. Harga yang tertulis sudah termasuk semua biaya pemakaman."}
      </p>

      {/* City: always up front */}
      <div className="mt-8 flex flex-col gap-4">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0" role="group" aria-label="Kota">
          <Chip selected={kota === null} onClick={() => setKota(null)}>
            Semua kota
          </Chip>
          {KOTA.map((k) => (
            <Chip key={k} selected={kota === k} onClick={() => setKota(kota === k ? null : k)}>
              {k}
            </Chip>
          ))}
        </div>
        {/* Desktop: the other filters inline. Phone: behind one button. */}
        <div className="hidden gap-8 md:flex">{secondaryFilters}</div>
        <div className="md:hidden">
          <button
            type="button"
            onClick={() => setFilterOpen(!filterOpen)}
            aria-expanded={filterOpen}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-strong bg-card px-4 text-body font-medium"
          >
            <SlidersHorizontal className="size-4" aria-hidden /> Filter{activeCount ? ` (${activeCount})` : ""}
          </button>
          {filterOpen ? <div className="mt-4 flex flex-col gap-5 rounded-2xl border border-border bg-card p-4">{secondaryFilters}</div> : null}
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between gap-4">
        <p className="text-body text-muted-foreground" aria-live="polite">
          {list.length} Lokasi Mitra{kota ? ` di ${kota}` : ""}
        </p>
        {activeCount || kota ? (
          <button
            type="button"
            onClick={() => {
              setKota(null);
              setJenis(null);
              setFasilitas([]);
            }}
            className="inline-flex items-center gap-1 text-body font-medium text-forest"
          >
            <X className="size-4" aria-hidden /> Hapus filter
          </button>
        ) : null}
      </div>

      {list.length ? (
        <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((l) => (
            <LokasiCard key={l.slug} lokasi={l} />
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-3xl border border-dashed border-border-strong bg-card p-10 text-center">
          <p className="text-title-3">Belum ada Lokasi Mitra yang cocok dengan filter ini.</p>
          <p className="mt-1 text-body text-muted-foreground">Coba hapus salah satu filter, atau tanyakan kepada CS kami.</p>
        </div>
      )}
    </div>
  );
}
