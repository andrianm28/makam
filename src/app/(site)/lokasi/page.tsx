import Link from "next/link";
import {
  AmbulanceIcon,
  ArmchairIcon,
  ArrowRightIcon,
  BadgeCheckIcon,
  DropletIcon,
  LandmarkIcon,
  LightbulbIcon,
  MapPinIcon,
  NavigationIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  SquareParkingIcon,
  ToiletIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { z } from "zod";
import { FilterChip } from "@/components/makam/filter-chip";
import { lokasiFacilities, type LokasiFacility, type LokasiMakamKind } from "@/domain/lokasi";
import { formatBulanTahun, formatTanggalPanjang } from "@/lib/format-tanggal";
import { directionsUrl, mapsQueryFor } from "@/lib/maps";
import { formatRupiah } from "@/lib/rupiah";
import { daftarLokasi, type DaftarLokasiBaris } from "./daftar";
import { fasilitasHref, hasActiveFilter, jenisHref, kotaHref, lokasiHref, type LokasiFilters } from "./filters";

export const metadata = { title: "Daftar Lokasi Makam — Makam.co.id" };

const facilityKeys = Object.keys(lokasiFacilities) as [LokasiFacility, ...LokasiFacility[]];
const facilityOptions = Object.entries(lokasiFacilities) as [LokasiFacility, string][];

/** One icon per facility (lucide, the design system's icon set): shown up to three on a Daftar Lokasi card. */
const facilityIcons: Record<LokasiFacility, LucideIcon> = {
  parkir: SquareParkingIcon,
  musala: LandmarkIcon,
  toilet: ToiletIcon,
  air_bersih: DropletIcon,
  penerangan: LightbulbIcon,
  pos_jaga: ShieldCheckIcon,
  akses_ambulans: AmbulanceIcon,
  tempat_duduk: ArmchairIcon,
};

/**
 * The two kinds of Lokasi Makam, as the "Jenis" chip filter offers them. The
 * prototype's chips here were an invented "jenis lokasi" (Swasta / Wakaf /
 * Yayasan / Masjid) with no field in the domain; this keeps the real Jenis
 * filter's own two values (Lokasi Mitra vs TPU DKI) and renders them the same
 * chip way, rather than inventing an ownership type the domain doesn't record.
 */
const jenisOptions: { value: LokasiMakamKind; label: string }[] = [
  { value: "lokasi_mitra", label: "Lokasi Mitra" },
  { value: "tpu", label: "TPU DKI" },
];

const oneOrMany = z.union([z.string(), z.array(z.string())]).optional();
const isFacility = (value: string): value is LokasiFacility => (facilityKeys as readonly string[]).includes(value);
const isKind = (value: string): value is LokasiMakamKind => value === "lokasi_mitra" || value === "tpu";

/**
 * The Daftar Lokasi directory's own search params: one kind, one city, any
 * number of (valid) facilities. Each says here whether it is one of ours, the
 * way `fasilitas` does, so the call site never re-checks what the schema decided.
 */
const searchParamsSchema = z.object({
  jenis: oneOrMany
    .transform((value) => (Array.isArray(value) ? value[0] : value))
    .refine((value): value is LokasiMakamKind => value === undefined || isKind(value)),
  kota: oneOrMany.transform((value) => (Array.isArray(value) ? value[0] : value)),
  fasilitas: oneOrMany.transform((value) => (Array.isArray(value) ? value : value ? [value] : []).filter(isFacility)),
});

/** The filters, narrowed: an absent or unrecognised one is simply no filter. */
function filtersOf(parsed: z.infer<typeof searchParamsSchema> | undefined): LokasiFilters {
  if (!parsed) return { jenis: undefined, kota: undefined, fasilitas: [] };
  return { jenis: parsed.jenis, kota: parsed.kota, fasilitas: parsed.fasilitas };
}

/**
 * The Daftar Lokasi Makam directory: every Terverifikasi Lokasi Mitra and every
 * DKI TPU, filterable by kind, by city and (for a Lokasi Mitra) by facilities.
 * A TPU card's price is the TPU price, not a plot's. Markup ported 1:1 from the
 * public-site prototype (`/pratinjau/publik/lokasi`), on the real Lokasi and
 * Tariffs reads: see the inline notes for the few places the domain has no
 * field the mock invented.
 */
export default async function DaftarLokasiPage({ searchParams }: PageProps<"/lokasi">) {
  const parsed = searchParamsSchema.safeParse(await searchParams);
  const filters = filtersOf(parsed.success ? parsed.data : undefined);
  const { baris, kota } = await daftarLokasi({
    jenis: filters.jenis,
    kota: filters.kota,
    fasilitas: filters.fasilitas.length ? filters.fasilitas : undefined,
  });
  const activeCount = (filters.jenis ? 1 : 0) + filters.fasilitas.length;

  const secondaryFilters = (
    <>
      <div className="flex flex-col gap-2">
        <span className="text-caption font-semibold tracking-wide text-muted-foreground uppercase">Jenis</span>
        <div className="flex flex-wrap gap-2">
          {jenisOptions.map((one) => (
            <FilterChip key={one.value} href={jenisHref(filters, one.value)} selected={filters.jenis === one.value}>
              {one.label}
            </FilterChip>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-caption font-semibold tracking-wide text-muted-foreground uppercase">Fasilitas</span>
        <div className="flex flex-wrap gap-2">
          {facilityOptions.map(([value, label]) => (
            <FilterChip key={value} href={fasilitasHref(filters, value)} selected={filters.fasilitas.includes(value)}>
              {label}
            </FilterChip>
          ))}
        </div>
      </div>
    </>
  );

  return (
    <main className="mx-auto flex w-full max-w-[80rem] flex-col px-4 py-8 md:px-8 md:py-12">
      <nav aria-label="Jejak halaman" className="text-small text-muted-foreground">
        <Link href="/" className="hover:text-forest">
          Beranda
        </Link>{" "}
        / Daftar Lokasi
      </nav>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-forest md:text-4xl">Daftar Lokasi Makam</h1>
      <p className="mt-2 max-w-2xl text-body-lg text-muted-foreground">
        Setiap Lokasi Mitra di sini sudah Terverifikasi Makam.co.id: dikunjungi langsung, perjanjian ditandatangani dan
        tarifnya diperiksa. TPU DKI adalah kuburan resmi pemerintah daerah yang kami layani untuk pengurusan IPTM.
      </p>

      {/* City: always up front */}
      <div className="mt-8 flex flex-col gap-4">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0" role="group" aria-label="Kota">
          <FilterChip href={kotaHref(filters, undefined)} selected={filters.kota === undefined}>
            Semua kota
          </FilterChip>
          {kota.map((one) => (
            <FilterChip key={one} href={kotaHref(filters, one)} selected={filters.kota === one}>
              {one}
            </FilterChip>
          ))}
        </div>
        {/* Desktop: the other filters inline. Phone: behind one disclosure (no client JS needed). */}
        <div className="hidden gap-8 md:flex">{secondaryFilters}</div>
        <details className="group md:hidden" open={activeCount > 0}>
          <summary className="inline-flex h-10 min-h-(--touch-target) w-fit cursor-pointer list-none items-center gap-2 rounded-lg border border-border-strong bg-card px-4 text-body font-medium [&::-webkit-details-marker]:hidden">
            <SlidersHorizontalIcon className="size-4" aria-hidden /> Filter{activeCount ? ` (${activeCount})` : ""}
          </summary>
          <div className="mt-4 flex flex-col gap-5 rounded-2xl border border-border bg-card p-4">{secondaryFilters}</div>
        </details>
      </div>

      <div className="mt-8 flex items-center justify-between gap-4">
        <p className="text-body text-muted-foreground" aria-live="polite">
          {baris.length} Lokasi Makam{filters.kota ? ` di ${filters.kota}` : ""}
        </p>
        {hasActiveFilter(filters) ? (
          <Link href={lokasiHref({ jenis: undefined, kota: undefined, fasilitas: [] })} className="inline-flex items-center gap-1 text-body font-medium text-forest">
            <XIcon className="size-4" aria-hidden /> Hapus filter
          </Link>
        ) : null}
      </div>

      {baris.length ? (
        <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {baris.map((row) => (
            <LokasiCard key={row.card.id} row={row} />
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-3xl border border-dashed border-border-strong bg-card p-10 text-center">
          <p className="text-title-3">Belum ada Lokasi Makam yang cocok dengan filter ini.</p>
          <p className="mt-1 text-body text-muted-foreground">Coba hapus salah satu filter, atau tanyakan kepada CS kami.</p>
        </div>
      )}
    </main>
  );
}

/** Up to three facility icons, "+N" for the rest — the same visual the card and the Lokasi page share. */
function FasilitasIcons({ facilities, max = 3 }: { facilities: LokasiFacility[]; max?: number }) {
  const shown = facilities.slice(0, max);
  const rest = facilities.length - shown.length;
  return (
    <ul className="flex items-center gap-1.5" aria-label="Fasilitas">
      {shown.map((facility) => {
        const Icon = facilityIcons[facility];
        return (
          <li key={facility} title={lokasiFacilities[facility]} className="inline-flex size-8 items-center justify-center rounded-full bg-brand-soft text-forest">
            <Icon className="size-4" aria-hidden />
            <span className="sr-only">{lokasiFacilities[facility]}</span>
          </li>
        );
      })}
      {rest > 0 ? <li className="text-caption text-muted-foreground">+{rest}</li> : null}
    </ul>
  );
}

/**
 * One card, from one row: a Lokasi Mitra with its own all-in price, or a TPU
 * with the TPU price and its new-plot status. The price travels on the row, so
 * a card can never show another one's.
 *
 * The prototype's card showed a "Foto contoh" badge on every photo, because
 * every photo in its mock was stock imagery. The public list never shows
 * `dataContoh` rows (`publicLokasiMakamList` excludes them), so a photo here
 * is always the Lokasi Mitra's own Kunjungan Verifikasi photo — the badge
 * would misstate what it is, so it is left off.
 */
function LokasiCard({ row }: { row: DaftarLokasiBaris }) {
  const { card, mulaiRp, foto } = row;
  const mapsQuery = mapsQueryFor(card);
  const isTpu = card.kind === "tpu";
  // "mulai" is Harga Hak Pakai (+ Biaya Layanan Platform) for a Lokasi Mitra, but
  // Biaya Pengurusan (+ Retribusi Pemda) for a TPU (decision 2026-09-25) — never
  // "semua biaya pemakaman" the way the prototype's mock captioned it, because
  // Biaya Pemakaman itself is a separate, later cost neither total includes.
  const priceCaption = isTpu ? "Biaya Pengurusan + Retribusi Pemda" : "Harga Hak Pakai + Biaya Layanan Platform";

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-xs transition-shadow hover:shadow-md">
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {foto ? (
          // Kunjungan Verifikasi photo, a short-lived signed URL: plain <img>, next/image cannot cache a URL that expires.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={foto}
            alt={`Foto Kunjungan Verifikasi ${card.name}`}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <h3 className="text-title-2 text-foreground">
            <Link href={isTpu ? `/tpu/${card.id}` : `/lokasi/${card.id}`} className="after:absolute after:inset-0">
              {card.name}
            </Link>
          </h3>
          <p className="mt-1 flex items-center gap-1 text-small text-muted-foreground">
            <MapPinIcon className="size-3.5" aria-hidden /> {card.city}
          </p>
        </div>
        {isTpu ? (
          <p className="flex items-center gap-1.5 text-small font-medium text-sage-strong">
            <LandmarkIcon className="size-4" aria-hidden /> TPU resmi Pemerintah Provinsi DKI Jakarta
            {card.newPlot ? " · menerima makam baru" : " · tidak menerima makam baru"} · diperbarui{" "}
            {formatTanggalPanjang(card.flagUpdatedOn)}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-small font-medium text-success-soft-foreground">
            <BadgeCheckIcon className="size-4" aria-hidden /> Terverifikasi
            {card.kunjunganVerifikasi ? ` · dikunjungi ${formatBulanTahun(card.kunjunganVerifikasi.visitedOn)}` : ""}
          </p>
        )}
        <div className="mt-auto flex items-end justify-between gap-3 pt-2">
          {mulaiRp !== null ? (
            <div>
              <p className="text-caption text-muted-foreground">mulai</p>
              <p className="text-title-2 text-foreground tabular-nums">{formatRupiah(mulaiRp)}</p>
              <p className="text-caption text-muted-foreground">{priceCaption}</p>
            </div>
          ) : (
            <p className="text-small text-muted-foreground">Harga belum tersedia</p>
          )}
          {!isTpu && card.facilities.length > 0 ? <FasilitasIcons facilities={card.facilities} /> : null}
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1 text-body font-semibold text-forest">
            Lihat lokasi <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </span>
          {mapsQuery ? (
            <a
              href={directionsUrl(mapsQuery)}
              target="_blank"
              rel="noreferrer"
              className="relative z-10 inline-flex h-10 min-h-(--touch-target) items-center gap-1.5 rounded-lg px-2 text-small font-medium text-sage-strong hover:bg-accent hover:text-forest"
            >
              <NavigationIcon className="size-4" aria-hidden /> Petunjuk arah
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}
