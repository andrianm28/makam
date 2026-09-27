import Link from "next/link";
import { AmbulanceIcon, ArmchairIcon, DropletIcon, LandmarkIcon, LightbulbIcon, ShieldCheckIcon, SquareParkingIcon, ToiletIcon } from "lucide-react";
import { z } from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { lokasiFacilities, type LokasiFacility, type LokasiMakamKind } from "@/domain/lokasi";
import { formatBulanTahun, formatTanggalPanjang } from "@/lib/format-tanggal";
import { directionsUrl, mapsQueryFor } from "@/lib/maps";
import { formatRupiah } from "@/lib/rupiah";
import { daftarLokasi, type DaftarLokasiBaris } from "./daftar";

export const metadata = { title: "Daftar Lokasi Makam — Makam.co.id" };

const facilityKeys = Object.keys(lokasiFacilities) as [LokasiFacility, ...LokasiFacility[]];
const facilityOptions = Object.entries(lokasiFacilities) as [LokasiFacility, string][];

/** One icon per facility (lucide, the design system's icon set): shown up to three on a Daftar Lokasi card. */
const facilityIcons: Record<LokasiFacility, typeof SquareParkingIcon> = {
  parkir: SquareParkingIcon,
  musala: LandmarkIcon,
  toilet: ToiletIcon,
  air_bersih: DropletIcon,
  penerangan: LightbulbIcon,
  pos_jaga: ShieldCheckIcon,
  akses_ambulans: AmbulanceIcon,
  tempat_duduk: ArmchairIcon,
};

/** The two kinds of Lokasi Makam, as the type filter offers them. */
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
function filtersOf(parsed: z.infer<typeof searchParamsSchema> | undefined) {
  if (!parsed) return { jenis: undefined, kota: undefined, fasilitas: [] as LokasiFacility[] };
  return { jenis: parsed.jenis, kota: parsed.kota, fasilitas: parsed.fasilitas };
}

/**
 * The Daftar Lokasi Makam directory: every Terverifikasi Lokasi Mitra and every
 * DKI TPU, filterable by kind, by city and (for a Lokasi Mitra) by facilities.
 * A TPU card's price is the TPU price, not a plot's.
 */
export default async function DaftarLokasiPage({ searchParams }: PageProps<"/lokasi">) {
  const parsed = searchParamsSchema.safeParse(await searchParams);
  const { jenis, kota: city, fasilitas: facilities } = filtersOf(parsed.success ? parsed.data : undefined);
  const { baris, kota } = await daftarLokasi({ jenis, kota: city, fasilitas: facilities.length ? facilities : undefined });

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Daftar Lokasi Makam</h1>
        <p className="text-muted-foreground">
          Setiap Lokasi Mitra di sini sudah Terverifikasi Makam.co.id: dikunjungi langsung, perjanjian ditandatangani dan
          tarifnya diperiksa. TPU DKI adalah kuburan resmi pemerintah daerah yang kami layani untuk pengurusan IPTM.
        </p>
      </header>

      <form method="get" className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-card p-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Jenis
          <select name="jenis" defaultValue={jenis ?? ""} className="h-10 rounded-lg border border-input bg-background px-3">
            <option value="">Semua jenis</option>
            {jenisOptions.map((one) => (
              <option key={one.value} value={one.value}>
                {one.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Kota / kabupaten
          <select name="kota" defaultValue={city ?? ""} className="h-10 rounded-lg border border-input bg-background px-3">
            <option value="">Semua kota</option>
            {kota.map((one) => (
              <option key={one} value={one}>
                {one}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="flex flex-col gap-1 text-sm font-medium">
          Fasilitas
          <div className="flex flex-wrap gap-3">
            {facilityOptions.map(([value, label]) => (
              <label key={value} className="flex items-center gap-1.5 text-sm font-normal">
                <input type="checkbox" name="fasilitas" value={value} defaultChecked={facilities.includes(value)} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
          Terapkan filter
        </button>
      </form>

      {baris.length === 0 ? (
        <p className="text-muted-foreground">Tidak ada Lokasi Makam yang cocok dengan filter ini.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {baris.map((row) => (
            <li key={row.card.id}>
              <LokasiCard row={row} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

/**
 * One card, from one row: a Lokasi Mitra with its own all-in price, or a TPU
 * with the TPU price and its new-plot status. The price travels on the row, so
 * a card can never show another one's.
 */
function LokasiCard({ row }: { row: DaftarLokasiBaris }) {
  const { card, mulaiRp, foto } = row;
  const mapsQuery = mapsQueryFor(card);
  const isTpu = card.kind === "tpu";

  return (
    <Card className="h-full overflow-hidden py-0">
      {foto ? (
        // Kunjungan Verifikasi photo, a short-lived signed URL: plain <img>, next/image cannot cache a URL that expires.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={foto} alt={`Foto ${card.name}`} className="h-40 w-full rounded-t-xl object-cover" />
      ) : null}
      <CardContent className="flex flex-col gap-2 pt-6">
        {isTpu ? (
          <p className="text-small text-sage-strong">
            TPU resmi Pemerintah Provinsi DKI Jakarta
            {card.newPlot ? " · menerima makam baru" : " · tidak menerima makam baru"} · diperbarui{" "}
            {formatTanggalPanjang(card.flagUpdatedOn)}
          </p>
        ) : (
          <p className="text-small text-success-soft-foreground">
            Terverifikasi
            {card.kunjunganVerifikasi ? ` · dikunjungi ${formatBulanTahun(card.kunjunganVerifikasi.visitedOn)}` : ""}
          </p>
        )}
        <h2 className="text-lg font-semibold">
          <Link href={isTpu ? `/tpu/${card.id}` : `/lokasi/${card.id}`} className="hover:underline">
            {card.name}
          </Link>
        </h2>
        <p className="text-small text-muted-foreground">{card.city}</p>
        {!isTpu && card.facilities.length > 0 ? (
          <div className="flex items-center gap-3 text-muted-foreground">
            {card.facilities.slice(0, 3).map((facility) => {
              const Icon = facilityIcons[facility];
              return <Icon key={facility} className="size-5" aria-label={lokasiFacilities[facility]} />;
            })}
          </div>
        ) : null}
        {mulaiRp !== null ? (
          <p className="text-body font-semibold">mulai {formatRupiah(mulaiRp)}</p>
        ) : (
          <p className="text-small text-muted-foreground">Harga belum tersedia</p>
        )}
        <div className="mt-2 flex items-center gap-3">
          <Link href={isTpu ? `/tpu/${card.id}` : `/lokasi/${card.id}`} className="text-sm font-medium text-brand underline underline-offset-4">
            Lihat lokasi
          </Link>
          {mapsQuery ? (
            <a
              href={directionsUrl(mapsQuery)}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-muted-foreground underline underline-offset-4"
            >
              Petunjuk arah
            </a>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
