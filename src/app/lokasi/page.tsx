import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { lokasiFacilities, type LokasiFacility } from "@/domain/lokasi";
import { formatBulanTahun } from "@/lib/format-tanggal";
import { directionsUrl, mapsQueryFor } from "@/lib/maps";
import { formatRupiah } from "@/lib/rupiah";
import { serverRuntime } from "@/server/runtime";
import { startingPrice } from "./pricing";

export const metadata = { title: "Daftar Lokasi Makam — Makam.co.id" };

const facilityOptions = Object.entries(lokasiFacilities) as [LokasiFacility, string][];

function oneOf(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function manyOf(value: string | string[] | undefined): string[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}

/** The Daftar Lokasi Makam directory: every Terverifikasi Lokasi Mitra, filterable by city and facilities. */
export default async function DaftarLokasiPage({ searchParams }: PageProps<"/lokasi">) {
  const query = await searchParams;
  const city = oneOf(query.kota);
  const facilities = manyOf(query.fasilitas) as LokasiFacility[];

  const { lokasi, tariffs, adapters } = serverRuntime();
  const now = adapters.clock.now();
  const [cards, cities] = await Promise.all([
    lokasi.publicLokasiMitraList({ city, facilities: facilities.length ? facilities : undefined }),
    lokasi.publicLokasiMitraCities(),
  ]);
  const [prices, photos] = await Promise.all([
    Promise.all(cards.map((card) => startingPrice(tariffs, card.id, now))),
    Promise.all(cards.map((card) => lokasi.publicVisitPhotoUrls(card.id))),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Daftar Lokasi Makam</h1>
        <p className="text-muted-foreground">
          Setiap Lokasi Mitra di sini sudah Terverifikasi Makam.co.id: dikunjungi langsung, perjanjian ditandatangani dan
          tarifnya diperiksa.
        </p>
      </header>

      <form method="get" className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-card p-4">
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
        <p className="text-muted-foreground">Tidak ada Lokasi Mitra yang cocok dengan filter ini.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {cards.map((card, index) => {
            const mapsQuery = mapsQueryFor(card);
            const mulaiRp = prices[index];
            const photo = photos[index]?.[0];
            return (
              <li key={card.id}>
                <Card className="h-full overflow-hidden py-0">
                  {photo ? (
                    // Kunjungan Verifikasi photo, a short-lived signed URL: plain <img>, next/image cannot cache a URL that expires.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo} alt={`Foto ${card.name}`} className="h-40 w-full rounded-t-xl object-cover" />
                  ) : null}
                  <CardContent className="flex flex-col gap-2 pt-6">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="bg-success-soft text-success-soft-foreground">
                        Terverifikasi
                      </Badge>
                      {card.kunjunganVerifikasi ? (
                        <span className="text-small text-muted-foreground">
                          dikunjungi {formatBulanTahun(card.kunjunganVerifikasi.visitedOn)}
                        </span>
                      ) : null}
                    </div>
                    <h2 className="text-lg font-semibold">{card.name}</h2>
                    <p className="text-small text-muted-foreground">{card.city}</p>
                    {card.facilities.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {card.facilities.slice(0, 3).map((facility) => (
                          <Badge key={facility} variant="outline">
                            {lokasiFacilities[facility]}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    {mulaiRp !== null ? (
                      <p className="text-body font-semibold">mulai {formatRupiah(mulaiRp)}</p>
                    ) : (
                      <p className="text-small text-muted-foreground">Harga belum tersedia</p>
                    )}
                    <div className="mt-2 flex items-center gap-3">
                      <Link href={`/lokasi/${card.id}`} className="text-sm font-medium text-brand underline underline-offset-4">
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
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
