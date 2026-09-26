/*
 * PROTOTYPE, throwaway. The Daftar Lokasi Makam card and the facility icons.
 */
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bath, BadgeCheck, Car, Droplets, House, MapPin, Moon, ShieldCheck, SquareParking, type LucideIcon } from "lucide-react";
import { BASE, FASILITAS_LABEL, mulaiDari, rupiah, type Fasilitas, type LokasiMitra } from "../_mock/data";

export const FASILITAS_ICON: Record<Fasilitas, LucideIcon> = {
  mushola: Moon,
  parkir: SquareParking,
  "akses-mobil": Car,
  air: Droplets,
  keamanan: ShieldCheck,
  pendopo: House,
  toilet: Bath,
};

export function FasilitasIcons({ fasilitas, max = 3 }: { fasilitas: Fasilitas[]; max?: number }) {
  const shown = fasilitas.slice(0, max);
  const rest = fasilitas.length - shown.length;
  return (
    <ul className="flex items-center gap-1.5" aria-label="Fasilitas">
      {shown.map((f) => {
        const Icon = FASILITAS_ICON[f];
        return (
          <li key={f} title={FASILITAS_LABEL[f]} className="inline-flex size-8 items-center justify-center rounded-full bg-brand-soft text-forest">
            <Icon className="size-4" aria-hidden />
            <span className="sr-only">{FASILITAS_LABEL[f]}</span>
          </li>
        );
      })}
      {rest > 0 ? <li className="text-caption text-muted-foreground">+{rest}</li> : null}
    </ul>
  );
}

export function LokasiCard({ lokasi }: { lokasi: LokasiMitra }) {
  const foto = lokasi.foto[0];
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-xs transition-shadow hover:shadow-md">
      <div className="relative aspect-[4/3] overflow-hidden">
        <Image src={foto.src} alt={foto.alt} fill sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw" className="object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
        <span className="absolute bottom-3 left-3 rounded-full bg-card/90 px-2.5 py-1 text-caption font-medium text-muted-foreground">Foto contoh</span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <h3 className="text-title-2 text-foreground">
            <Link href={`${BASE}/lokasi/${lokasi.slug}`} className="after:absolute after:inset-0">
              {lokasi.nama}
            </Link>
          </h3>
          <p className="mt-1 flex items-center gap-1 text-small text-muted-foreground">
            <MapPin className="size-3.5" aria-hidden /> {lokasi.kota} · Makam {lokasi.jenis.toLowerCase()}
          </p>
        </div>
        <p className="flex items-center gap-1.5 text-small font-medium text-success-soft-foreground">
          <BadgeCheck className="size-4" aria-hidden /> Terverifikasi · dikunjungi {lokasi.dikunjungi}
        </p>
        <div className="mt-auto flex items-end justify-between gap-3 pt-2">
          <div>
            <p className="text-caption text-muted-foreground">mulai</p>
            <p className="text-title-2 tabular-nums text-foreground">{rupiah(mulaiDari(lokasi))}</p>
            <p className="text-caption text-muted-foreground">semua biaya pemakaman</p>
          </div>
          <FasilitasIcons fasilitas={lokasi.fasilitas} />
        </div>
        <span className="inline-flex items-center gap-1 text-body font-semibold text-forest">
          Lihat lokasi <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
    </article>
  );
}
