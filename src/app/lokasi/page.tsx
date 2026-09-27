import Link from "next/link";
import { AmbulanceIcon, ArmchairIcon, DropletIcon, LandmarkIcon, LightbulbIcon, ShieldCheckIcon, SquareParkingIcon, ToiletIcon } from "lucide-react";
import { z } from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { lokasiFacilities, type LokasiFacility, type LokasiMakamCard, type LokasiMakamKind } from "@/domain/lokasi";
import { formatBulanTahun, formatTanggalPanjang } from "@/lib/format-tanggal";
import { directionsUrl, mapsQueryFor } from "@/lib/maps";
import { formatRupiah } from "@/lib/rupiah";
import { serverRuntime } from "@/server/runtime";

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

/** The Daftar Lokasi directory's own search params: one kind, one city, any number of (valid) facilities. */
const searchParamsSchema = z.object({
  jenis: oneOrMany.transform((value) => (Array.isArray(value) ? value[0] : value)),
  kota: oneOrMany.transform((value) => (Array.isArray(value) ? value[0] : value)),
  fasilitas: oneOrMany.transform((value) => (Array.isArray(value) ? value : value ? [value] : []).filter(isFacility)),
});

/**
 * The Daftar Lokasi Makam directory: every Terverifikasi Lokasi Mitra and every
 * DKI TPU, filterable by kind, by city and (for a Lokasi Mitra) by facilities.
 * A TPU card's price is the TPU price, not a plot's.
 */
export default async function DaftarLokasiPage({ searchParams }: PageProps<"/lokasi">) {
  const parsed = searchParamsSchema.safeParse(await searchParams);
  const { jenis, kota: city, fasilitas: facilities } = parsed.success
    ? { jenis: parsed.data.jenis, kota: parsed.data.kota, fasilitas: parsed.data.fasilitas }
    : { jenis: undefined, kota: undefined, fasilitas: [] };

  const { lokasi, tariffs, adapters } = serverRuntime();
  const now = adapters.clock.now();
  const [cards, cities] = await Promise.all([
    lokasi.publicLokasiMakamList({
      kind: jenis && isKind(jenis) ? jenis : undefined,
      city,
      facilities: facilities.length ? facilities : undefined,
    }),
    lokasi.publicLokasiMakamCities(),
  ]);
  const [hargaLokasiMitra, hargaTpu, photos] = await Promise.all([
    Promise.all(
      cards.filter((card) => card.kind === "lokasi_mitra").map((card) => tariffs.lokasiPricing(card.id, now).then((pricing) => pricing.mulaiDari)),
    ),
    tariffs.tpuPricing(now),
    Promise.all(cards.map((card) => (card.kind === "lokasi_mitra" ? lokasi.publicVisitPhotoUrls(card.id) : []))),
  ]);

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
          <select name="jenis" defaultValue={jenis && isKind(jenis) ? jenis : ""} className="h-10 rounded-lg border border-input bg-background px-3">
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
            {cities.map((one) => (
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

      {cards.length === 0 ? (
        <p className="text-muted-foreground">Tidak ada Lokasi Makam yang cocok dengan filter ini.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {cards.map((card, index) => (
            <li key={card.id}>
              <LokasiCard card={card} photo={photos[index]?.[0]} mulaiRp={hargaLokasiMitra[index]} tpuMulai={hargaTpu.mulaiDari} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

/** One card: a Lokasi Mitra with its own price, or a TPU with the TPU price and its new-plot status. */
function LokasiCard({
  card,
  photo,
  mulaiRp,
  tpuMulai,
}: {
  card: LokasiMakamCard;
  photo: string | undefined;
  /** The Lokasi Mitra's own "mulai dari"; null for a TPU card. */
  mulaiRp: number | null | undefined;
  tpuMulai: number | null;
}) {
  const mapsQuery = mapsQueryFor(card);
  const isTpu = card.kind === "tpu";
  const harga = isTpu ? tpuMulai : (mulaiRp ?? null);

  return (
    <Card className="h-full overflow-hidden py-0">
      {photo ? (
        // Kunjungan Verifikasi photo, a short-lived signed URL: plain <img>, next/image cannot cache a URL that expires.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt={`Foto ${card.name}`} className="h-40 w-full rounded-t-xl object-cover" />
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
        {harga !== null ? (
          <p className="text-body font-semibold">mulai {formatRupiah(harga)}</p>
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
