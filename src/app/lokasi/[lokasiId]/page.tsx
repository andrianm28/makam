import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { lokasiFacilities, weekdays, type JamOperasional, type LokasiFacility, type Weekday } from "@/domain/lokasi";
import type { AllInPrice, Tenure } from "@/domain/tariffs";
import { formatBulanTahun, formatTanggalPanjang } from "@/lib/format-tanggal";
import { directionsUrl, embedMapUrl, mapsQueryFor } from "@/lib/maps";
import { quoteLineLabel } from "@/lib/quote-line-label";
import { formatRupiah } from "@/lib/rupiah";
import { serverRuntime } from "@/server/runtime";

const weekdayLabels: Record<Weekday, string> = {
  monday: "Senin",
  tuesday: "Selasa",
  wednesday: "Rabu",
  thursday: "Kamis",
  friday: "Jumat",
  saturday: "Sabtu",
  sunday: "Minggu",
};

function tenureLabel(tenure: Tenure): string {
  return tenure.kind === "selamanya" ? "Selamanya" : `${tenure.years} tahun`;
}

/** The all-in total, with its parts (each quote line) in small print ("Harga berlaku sejak", "Harga baru mulai"). */
function AllInLine({ label, price }: { label: string; price: AllInPrice }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-body font-medium">{label}</span>
        <span className="text-lg font-semibold">{formatRupiah(price.total)}</span>
      </div>
      <ul className="text-small text-muted-foreground">
        {price.lines.map((line, index) => (
          <li key={index} className="flex justify-between gap-2">
            <span>{quoteLineLabel(line)}</span>
            <span>{formatRupiah(line.amount)}</span>
          </li>
        ))}
      </ul>
      <p className="text-small text-muted-foreground">Harga berlaku sejak {formatTanggalPanjang(price.inForceSince)}</p>
      {price.scheduledChange ? (
        <p className="text-small text-muted-foreground">
          Harga baru {formatRupiah(price.scheduledChange.total)} mulai {formatTanggalPanjang(price.scheduledChange.effectiveOn)}
        </p>
      ) : null}
    </div>
  );
}

function JamOperasionalTable({ jamOperasional }: { jamOperasional: JamOperasional }) {
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1 text-body">
        {weekdays.map((day) => {
          const hours = jamOperasional.weekly[day];
          return (
            <li key={day} className="flex justify-between gap-4">
              <span>{weekdayLabels[day]}</span>
              <span className="text-muted-foreground">{hours ? `${hours.opens}–${hours.closes}` : "Tutup"}</span>
            </li>
          );
        })}
      </ul>
      {jamOperasional.tanggalTutup.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-small font-medium">Tanggal Tutup</p>
          <ul className="flex flex-col gap-0.5 text-small text-muted-foreground">
            {jamOperasional.tanggalTutup.map((tutup) => (
              <li key={tutup.date}>
                {formatTanggalPanjang(tutup.date)} — {tutup.note}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export async function generateMetadata({ params }: PageProps<"/lokasi/[lokasiId]">) {
  const { lokasiId } = await params;
  const profile = await serverRuntime().lokasi.publicLokasiMitra(lokasiId);
  return { title: profile ? `${profile.name} — Makam.co.id` : "Lokasi tidak ditemukan — Makam.co.id" };
}

/** The public Lokasi Mitra page (spec, stories 8–12): prices, documents, facilities, Jam Operasional, Pembatalan, map. */
export default async function LokasiMitraPage({ params }: PageProps<"/lokasi/[lokasiId]">) {
  const { lokasiId } = await params;
  const { lokasi, tariffs, adapters } = serverRuntime();
  const profile = await lokasi.publicLokasiMitra(lokasiId);
  if (!profile) notFound();

  const [pricing, photoUrls] = await Promise.all([
    tariffs.lokasiPricing(lokasiId, adapters.clock.now()),
    lokasi.publicVisitPhotoUrls(lokasiId),
  ]);

  const mapsQuery = mapsQueryFor(profile);
  const checkedFacilities = profile.facilities.checked;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <details className="group">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1.5">
              <Badge variant="secondary" className="bg-success-soft text-success-soft-foreground">
                Terverifikasi Makam.co.id
              </Badge>
              {profile.kunjunganVerifikasi ? (
                <span className="text-small text-muted-foreground">· dikunjungi {formatBulanTahun(profile.kunjunganVerifikasi.visitedOn)}</span>
              ) : null}
              <span className="text-small text-brand underline underline-offset-4">apa yang kami periksa?</span>
            </summary>
            <div className="mt-2 rounded-lg border border-border bg-card p-3 text-small text-muted-foreground">
              Tim kami mendatangi lokasi ini langsung (Kunjungan Verifikasi): mengecek alamat dan titik peta, fasilitas dan
              memotretnya. Perjanjian kerja sama sudah ditandatangani, dan tarifnya sudah diperiksa terhadap perjanjian
              itu — semua itu syarat sebelum sebuah Lokasi Mitra tampil di sini.
            </div>
          </details>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{profile.name}</h1>
        <p className="text-muted-foreground">Dikelola oleh {profile.pengelolaName}</p>
        <p className="text-muted-foreground">{profile.address}</p>
        {mapsQuery ? (
          <a href={directionsUrl(mapsQuery)} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand underline underline-offset-4">
            Petunjuk arah
          </a>
        ) : null}
        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            href={`/pesan-makam/saat-duka?lokasiId=${profile.id}`}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Pesan makam sekarang
          </Link>
          {profile.terencanaAktif ? (
            <Link
              href={`/pesan-makam/terencana?lokasiId=${profile.id}`}
              className="rounded-lg border border-input px-4 py-2 text-sm font-medium"
            >
              Siapkan makam untuk nanti
            </Link>
          ) : (
            <span className="self-center text-small text-muted-foreground">Pemesanan terencana segera tersedia</span>
          )}
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Harga</CardTitle>
          <CardDescription>Setiap harga di sini adalah total yang tertagih (all-in): sama dengan yang tertera di Tagihan.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {pricing.jenisMakam.length === 0 ? (
            <p className="text-muted-foreground">Harga belum tersedia.</p>
          ) : (
            pricing.jenisMakam.map((card) => (
              <div key={card.jenisMakam.id} className="flex flex-col gap-2">
                <p className="text-body font-semibold">
                  {card.jenisMakam.name} <span className="text-muted-foreground">({tenureLabel(card.tenure)})</span>
                </p>
                <AllInLine label="Harga Hak Pakai" price={card.hakPakai} />
                {card.perpanjangan ? <AllInLine label={`Perpanjangan (per ${tenureLabel(card.tenure)})`} price={card.perpanjangan} /> : null}
              </div>
            ))
          )}
          {pricing.biayaPemakaman ? <AllInLine label="Biaya Pemakaman" price={pricing.biayaPemakaman} /> : null}
          {pricing.biayaPemakamanTumpang ? <AllInLine label="Biaya Pemakaman (tumpang)" price={pricing.biayaPemakamanTumpang} /> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dokumen yang perlu dibawa</CardTitle>
        </CardHeader>
        <CardContent>
          {profile.documentChecklist.length === 0 ? (
            <p className="text-muted-foreground">Belum ada daftar dokumen.</p>
          ) : (
            <ul className="list-disc pl-5 text-body">
              {profile.documentChecklist.map((doc) => (
                <li key={doc}>{doc}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fasilitas</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {checkedFacilities.length === 0 ? (
            <p className="text-muted-foreground">Belum ada data fasilitas.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {checkedFacilities.map((facility: LokasiFacility) => (
                <Badge key={facility} variant="outline">
                  {lokasiFacilities[facility]}
                </Badge>
              ))}
            </div>
          )}
          {profile.facilities.note ? <p className="text-small text-muted-foreground">{profile.facilities.note}</p> : null}
          {photoUrls.length > 0 ? (
            <div className="flex flex-col gap-1">
              <p className="text-small font-medium">Foto lokasi</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {photoUrls.map((url, index) => (
                  // Kunjungan Verifikasi photo, a short-lived signed URL: plain <img>, next/image cannot cache a URL that expires.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={url} src={url} alt={`Foto lokasi ${index + 1}`} className="h-32 w-full rounded-lg object-cover" />
                ))}
              </div>
              {profile.kunjunganVerifikasi ? (
                <p className="text-small text-muted-foreground">Dipotret {formatTanggalPanjang(profile.kunjunganVerifikasi.visitedOn)}</p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Jam Operasional</CardTitle>
        </CardHeader>
        <CardContent>
          {profile.jamOperasional ? (
            <JamOperasionalTable jamOperasional={profile.jamOperasional} />
          ) : (
            <p className="text-muted-foreground">Jam Operasional belum tersedia.</p>
          )}
        </CardContent>
      </Card>

      {profile.terencanaAktif ? (
        <Card>
          <CardHeader>
            <CardTitle>Pembatalan</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-body">
            <p>
              Pembatalan Pemesanan Terencana yang sudah dibayar, sebelum ada Pemakaman, dikembalikan penuh dalam{" "}
              {profile.pembatalan.masaPembatalanDays} hari sejak dibayar.
            </p>
            <p className="text-muted-foreground">
              Setelah itu, pengembalian {profile.pembatalan.refundAfterMasaPembatalanPercent}% dari tarif, sesuai kebijakan
              Lokasi Mitra ini.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Lokasi dan petunjuk arah</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {mapsQuery ? (
            <iframe
              src={embedMapUrl(mapsQuery)}
              loading="lazy"
              title={`Peta ${profile.name}`}
              className="h-64 w-full rounded-lg border border-border"
            />
          ) : null}
          <p className="text-body">{profile.address}</p>
          {mapsQuery ? (
            <a href={directionsUrl(mapsQuery)} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand underline underline-offset-4">
              Petunjuk arah
            </a>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
