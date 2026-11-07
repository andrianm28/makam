import { notFound } from "next/navigation";
import { GambarTipeKavlingFigure } from "@/components/site/gambar-tipe-kavling";
import Link from "next/link";
import { PageHero } from "@/components/site/content-page";
import { judulBagian, pilGaris, pilUtama } from "@/components/site/gaya";
import { KartuCs } from "@/components/site/kartu-cs";
import { cn } from "@/lib/utils";
import {
  ArrowRightIcon,
  CalendarClockIcon,
  CheckIcon,
  CircleAlertIcon,
  CircleSlashIcon,
  ClockIcon,
  FileTextIcon,
  InfoIcon,
  MapPinIcon,
  NavigationIcon,
  AmbulanceIcon,
  ArmchairIcon,
  DropletIcon,
  LandmarkIcon,
  LightbulbIcon,
  ShieldCheckIcon,
  SquareParkingIcon,
  ToiletIcon,
  type LucideIcon,
} from "lucide-react";
import { lokasiFacilities, weekdays, type JamOperasional, type LokasiFacility, type Weekday } from "@/domain/lokasi";
import type { Tenure } from "@/domain/tariffs";
import { formatBulanTahun, formatTanggalPanjang } from "@/lib/format-tanggal";
import { directionsUrl, embedMapUrl, mapsQueryFor } from "@/lib/maps";
import { allInBreakdown, labelledPartsBreakdown } from "@/lib/quote-breakdown";
import { formatRupiah } from "@/lib/rupiah";
import { CsLink } from "@/components/site/cs-link";
import { serverRuntime } from "@/server/runtime";
import { VerifiedPopover } from "./verified-popover";

const weekdayLabels: Record<Weekday, string> = {
  monday: "Senin",
  tuesday: "Selasa",
  wednesday: "Rabu",
  thursday: "Kamis",
  friday: "Jumat",
  saturday: "Sabtu",
  sunday: "Minggu",
};

/** One icon per facility (lucide, the design system's icon set), in the order `lokasiFacilities` lists them. */
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
const allFacilities = Object.keys(lokasiFacilities) as LokasiFacility[];

function tenureLabel(tenure: Tenure): string {
  return tenure.kind === "selamanya" ? "Selamanya" : `${tenure.years} tahun`;
}

/** A page section on the border-top rhythm the public-site prototype settled on: no boxed card, just a divider and room to breathe. */
function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t border-border pt-8">
      <h2 id={id} className={judulBagian}>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function JamOperasionalTable({ jamOperasional, dapatDipesan }: { jamOperasional: JamOperasional; dapatDipesan: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-1 text-body-lg text-foreground">
        {weekdays.map((day) => {
          const hours = jamOperasional.weekly[day];
          return (
            <li key={day} className="flex justify-between gap-4">
              <span>{weekdayLabels[day]}</span>
              <span className="tabular-nums text-muted-foreground">{hours ? `${hours.opens}–${hours.closes}` : "Tutup"}</span>
            </li>
          );
        })}
      </ul>
      {jamOperasional.tanggalTutup.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-small font-medium text-foreground">Tanggal Tutup</p>
          <ul className="flex flex-col gap-0.5 text-small text-muted-foreground">
            {jamOperasional.tanggalTutup.map((tutup) => (
              <li key={tutup.date}>
                {formatTanggalPanjang(tutup.date)} — {tutup.note}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {dapatDipesan ? (
        <p className="text-body text-muted-foreground">
          Pesanan Saat Duka dikonfirmasi dalam 2 jam di dalam Jam Operasional. Di luar jam itu, halaman pesanan menampilkan
          kapan konfirmasi datang dan nomor Kontak Siaga lokasi ini.
        </p>
      ) : null}
    </div>
  );
}

export async function generateMetadata({ params }: PageProps<"/lokasi/[lokasiId]">) {
  const { lokasiId } = await params;
  const profile = await serverRuntime().lokasi.publicLokasiMitraProfil(lokasiId);
  return { title: profile ? `${profile.name} — Makam.co.id` : "Lokasi tidak ditemukan — Makam.co.id" };
}

/**
 * The public Lokasi Mitra page (spec, stories 8–12), ported 1:1 from the
 * public-site prototype (`/pratinjau/publik/lokasi/[slug]`): breadcrumb, photo
 * mosaic, header with the Terverifikasi popover (or the Belum Terverifikasi badge), prices, documents,
 * facilities, Jam Operasional, map, and the sticky order card / phone bar.
 * Every price comes from the tariffs module's own quote, unchanged; see the
 * ticket comments for the handful of places where the prototype's mock number
 * meant something the real quote does not (kept honest here, not rewritten).
 */
export default async function LokasiMitraPage({ params }: PageProps<"/lokasi/[lokasiId]">) {
  const { lokasiId } = await params;
  const { lokasi, tariffs, layanan, inventory, adapters, operatorSettings } = serverRuntime();
  // The page stays up while the Lokasi is Ditangguhkan or Berhenti, only without its order buttons (ticket 59), and for a
  // Lokasi listed without verification, marked "Belum Terverifikasi" and with a Hubungi Kami route instead (owner, 2026-11-05).
  const profile = await lokasi.publicLokasiMitraProfil(lokasiId);
  if (!profile) notFound();
  const belumTerverifikasi = profile.belumTerverifikasi;
  const menerimaPesanan = profile.status === "terverifikasi";

  const [pricing, visitPhotoUrls, galeri, penawaran, ketersediaan, settings] = await Promise.all([
    tariffs.lokasiPricingTampil(lokasiId, adapters.clock.now()),
    lokasi.publicVisitPhotoUrls(lokasiId),
    lokasi.publicFotoGaleri(lokasiId),
    layanan.penawaranLokasi(lokasiId, adapters.clock.now()),
    inventory.tersediaPerJenisMakam(lokasiId),
    operatorSettings.current(),
  ]);
  // Harga Tampil off (owner, 2026-11-02, ADR 0011): no amount on this page; the family still orders here, on the
  // platform, and the wizard shows the price. WhatsApp is only the CS for questions, its chat naming this Lokasi Mitra.
  const hargaTampil = profile.hargaTampil;
  const cs = settings ? { whatsApp: settings.csWhatsApp, replyHours: settings.csReplyHours } : null;
  const pesanWhatsApp = `Halo Makam.co.id, saya ingin berkonsultasi tentang makam di ${profile.name}.`;

  const tersediaByJenisMakam = new Map(ketersediaan.map((row) => [row.jenisMakamId, row.count]));
  const mapsQuery = mapsQueryFor(profile);
  const dikunjungi = profile.kunjunganVerifikasi ? formatBulanTahun(profile.kunjunganVerifikasi.visitedOn) : null;
  // The photo mosaic captions the exact day, as the prototype's per-photo dates did; the real Kunjungan
  // Verifikasi records one day for every photo, so every caption here reads the same, unlike the mock's.
  const dikunjungiFoto = profile.kunjunganVerifikasi ? formatTanggalPanjang(profile.kunjunganVerifikasi.visitedOn) : null;
  const pesanHref = `/pesan-makam/saat-duka?lokasiId=${profile.id}`;
  const gambarTipe = await tariffs.publicGambarTipeKavling(pricing.jenisMakam.map((card) => card.jenisMakam.id));
  // The Galeri Lokasi (facilities and landscape, captioned) leads once it has a photo; until then the Kunjungan Verifikasi photos stand in.
  const pakaiGaleri = galeri.length > 0;
  const photos = pakaiGaleri
    ? galeri.map((foto) => ({ url: foto.url!, alt: foto.keterangan }))
    : visitPhotoUrls.map((url, index) => ({ url, alt: index === 0 ? `Foto lokasi ${profile.name}` : `Foto lokasi ${profile.name} ${index + 1}` }));
  const [mainPhoto, ...restPhotos] = photos;

  const ctaHarga = (
    <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-lg">
      {hargaTampil ? (
        <div>
          <p className="text-caption text-muted-foreground">mulai</p>
          {pricing.mulaiDari !== null ? (
            <p className="text-display tabular-nums text-foreground">{formatRupiah(pricing.mulaiDari)}</p>
          ) : (
            <p className="text-title-2 text-muted-foreground">Harga belum tersedia</p>
          )}
          <p className="text-small text-muted-foreground">Harga Hak Pakai termurah di sini, sudah all-in</p>
        </div>
      ) : (
        <div>
          <p className="text-title-2 text-foreground">Harga tampil saat memesan</p>
          <p className="text-small text-muted-foreground">
            Lokasi ini tidak menampilkan harga di halaman depan. Harga lengkap, sudah all-in, muncul di langkah pemesanan
            sebelum Anda mengirim apa pun.{" "}
            <CsLink contact={cs} pesan={pesanWhatsApp} className="font-medium text-forest underline-offset-4 hover:underline">
              Konsultasi dengan CS
            </CsLink>
          </p>
        </div>
      )}
      {menerimaPesanan ? (
        <>
      <Link
        href={pesanHref}
        className={pilUtama}
      >
        Pesan makam sekarang <ArrowRightIcon className="size-5" aria-hidden />
      </Link>
      <p className="-mt-2 text-center text-small text-muted-foreground">
        untuk keluarga yang baru saja kehilangan · tidak ada yang dibayar saat mengirim
      </p>
      <div className="border-t border-border pt-4">
        {profile.terencanaAktif ? (
          <Link
            href={`/pesan-makam/terencana?lokasiId=${profile.id}`}
            className="inline-flex items-center gap-1 text-body font-semibold text-forest"
          >
            Siapkan makam untuk nanti <ArrowRightIcon className="size-4" aria-hidden />
          </Link>
        ) : (
          <p className="flex items-start gap-2 text-body text-muted-foreground">
            <ClockIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <span className="font-medium text-foreground">Pemesanan terencana segera tersedia.</span> Kami sedang
              mencocokkan denah lokasi ini dengan keadaan di lapangan.
            </span>
          </p>
        )}
      </div>
        </>
      ) : belumTerverifikasi ? (
        <div className="flex flex-col gap-3">
          <p className="flex items-start gap-2 text-body text-muted-foreground">
            <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <span className="font-medium text-foreground">Belum bisa dipesan lewat Makam.co.id.</span> Lokasi ini belum
              kami verifikasi. Hubungi kami untuk bertanya atau mengatur pemesanan.
            </span>
          </p>
          {cs ? (
            <CsLink contact={cs} label="Hubungi Kami via CS" pesan={pesanWhatsApp} />
          ) : (
            <Link href="/hubungi-kami" className="font-medium text-forest underline underline-offset-4">
              Hubungi Kami
            </Link>
          )}
        </div>
      ) : (
        <p className="flex items-start gap-2 text-body text-muted-foreground">
          <ClockIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <span className="font-medium text-foreground">
              {profile.status === "ditangguhkan" ? "Sementara tidak menerima pesanan." : "Tidak lagi menerima pesanan."}
            </span>{" "}
            Keluarga yang sudah punya Hak Pakai di sini tetap dilayani lewat Akun Saya.
          </span>
        </p>
      )}
    </div>
  );
  const cta = ctaHarga;

  return (
    <>
    <PageHero
      eyebrow={belumTerverifikasi ? "Lokasi" : "Lokasi Mitra"}
      title={profile.name}
      lead={profile.address}
      samping={<KartuCs contact={cs} judul="Ada yang ingin ditanyakan?" isi="CS kami membantu menjawab soal lokasi ini. Pemesanan dan pembayaran tetap di Makam.co.id." pesan={pesanWhatsApp} />}
    >
      <p className="w-full text-lg text-foreground">
        Dikelola oleh <span className="font-bold">{profile.pengelolaName}</span>, yang memberikan Hak Pakai kepada keluarga.
      </p>
      {mapsQuery ? (
        <a
          href={directionsUrl(mapsQuery)}
          target="_blank"
          rel="noreferrer"
          className={pilGaris}
        >
          <NavigationIcon className="size-5" aria-hidden /> Petunjuk arah
        </a>
      ) : null}
      {belumTerverifikasi ? (
        <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-warning-soft px-4 py-1.5 text-lg font-bold text-warning-soft-foreground">
          <CircleAlertIcon className="size-5 shrink-0" aria-hidden /> Belum Terverifikasi
        </p>
      ) : (
        <VerifiedPopover dikunjungi={dikunjungi} />
      )}
    </PageHero>
    <div className="mx-auto w-full max-w-(--page-max-width) px-4 pt-6 pb-28 md:px-8 md:pt-8 lg:pb-16">
      {menerimaPesanan ? null : (
        <p role="status" className="mb-4 rounded-xl bg-warning-soft px-4 py-3 text-body font-medium text-warning-soft-foreground">
          {belumTerverifikasi
            ? "Belum Terverifikasi: lokasi ini belum diverifikasi Makam.co.id, jadi belum bisa dipesan lewat situs ini. Profil, foto, harga, dan jam operasional di bawah adalah data yang kami miliki; hubungi kami bila ingin bertanya."
            : profile.status === "ditangguhkan"
            ? "Lokasi ini sementara tidak menerima pesanan. Halaman ini tetap tersedia untuk keluarga yang sudah memesan."
            : "Lokasi ini telah berhenti bermitra dengan makam.co.id dan tidak menerima pesanan."}
        </p>
      )}
      <nav aria-label="Jejak halaman" className="text-small text-muted-foreground">
        <Link href="/" className="hover:text-forest">
          Beranda
        </Link>{" "}
        /{" "}
        <Link href="/lokasi" className="hover:text-forest">
          Daftar Lokasi
        </Link>{" "}
        / {profile.name}
      </nav>

      {mainPhoto ? (
        <div className="mt-4 grid gap-2 md:grid-cols-[2fr_1fr] md:gap-3">
          <figure className="relative aspect-[4/3] overflow-hidden rounded-3xl md:aspect-auto md:min-h-[26rem]">
            {/* Kunjungan Verifikasi photo, a short-lived signed URL: plain <img>, next/image cannot cache a URL that expires. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mainPhoto.url} alt={mainPhoto.alt} className="h-full w-full object-cover" />
            {pakaiGaleri ? (
              <figcaption className="absolute bottom-3 left-3 rounded-full bg-card/90 px-3 py-1 text-caption font-medium text-foreground">
                {mainPhoto.alt}
              </figcaption>
            ) : dikunjungiFoto && !belumTerverifikasi ? (
              <figcaption className="absolute bottom-3 left-3 rounded-full bg-card/90 px-3 py-1 text-caption font-medium text-foreground">
                Foto kunjungan {dikunjungiFoto}
              </figcaption>
            ) : null}
          </figure>
          {restPhotos.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 md:grid-cols-1 md:gap-3">
              {restPhotos.slice(0, 3).map((photo) => (
                <figure key={photo.url} className="relative aspect-[4/3] overflow-hidden rounded-2xl md:aspect-auto md:min-h-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt={photo.alt} className="h-full w-full object-cover" />
                  {/* Every Galeri photo shows its caption, so a "Foto ilustrasi" never passes as the place itself (dri, 7 Nov 2026). */}
                  {pakaiGaleri && photo.alt ? (
                    <figcaption className="absolute inset-x-2 bottom-2 rounded-xl bg-card/90 px-2 py-0.5 text-caption text-foreground">
                      {photo.alt}
                    </figcaption>
                  ) : !pakaiGaleri && dikunjungiFoto ? (
                    <figcaption className="absolute bottom-2 left-2 hidden rounded-full bg-card/90 px-2 py-0.5 text-caption text-foreground sm:block">
                      {dikunjungiFoto}
                    </figcaption>
                  ) : null}
                </figure>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_22rem]">
        <div className="flex min-w-0 flex-col gap-10">

          {!hargaTampil ? (
            <Section id="harga" title="Jenis Makam">
              <p className="text-lg text-muted-foreground">
                Harga di lokasi ini tidak ditampilkan di halaman depan: harga lengkapnya muncul di langkah pemesanan, dan sama dengan yang nanti tertera di Tagihan.
              </p>
              <ul className="mt-5 flex flex-col gap-4">
                {pricing.jenisMakam.map((card) => {
                  const tersedia = tersediaByJenisMakam.get(card.jenisMakam.id) ?? 0;
                  return (
                    <li key={card.jenisMakam.id} className="rounded-3xl border border-border bg-card p-6 shadow-md md:p-8">
                      {gambarTipe[card.jenisMakam.id] ? <GambarTipeKavlingFigure gambar={gambarTipe[card.jenisMakam.id]} /> : null}
                      <h3 className="font-heading text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">{card.jenisMakam.name}</h3>
                      <p className="text-lg text-muted-foreground">
                        {card.jenisMakam.description ? `${card.jenisMakam.description} · ` : ""}Masa Hak Pakai{" "}
                        {tenureLabel(card.tenure).toLowerCase()}
                      </p>
                      {belumTerverifikasi ? null : (
                        <p className={tersedia === 0 ? "text-lg font-bold text-warning-soft-foreground" : "text-lg font-semibold text-success-soft-foreground"}>
                          {tersedia === 0 ? "Belum tersedia saat ini" : `${tersedia} makam tersedia`}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Section>
          ) : (
          <Section id="harga" title="Harga per Jenis Makam">
            <p className="text-lg text-muted-foreground">
              Setiap harga di sini adalah total yang tertagih (all-in): sama dengan yang tertera di Tagihan.
            </p>
            {pricing.jenisMakam.length === 0 ? (
              <p className="mt-5 text-muted-foreground">Harga belum tersedia.</p>
            ) : (
              <ul className="mt-5 flex flex-col gap-4">
                {pricing.jenisMakam.map((card) => {
                  const tersedia = tersediaByJenisMakam.get(card.jenisMakam.id) ?? 0;
                  const habis = tersedia === 0;
                  return (
                    <li key={card.jenisMakam.id} className="rounded-3xl border border-border bg-card p-6 shadow-md md:p-8">
                      {gambarTipe[card.jenisMakam.id] ? <GambarTipeKavlingFigure gambar={gambarTipe[card.jenisMakam.id]} /> : null}
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="font-heading text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">{card.jenisMakam.name}</h3>
                          <p className="text-lg text-muted-foreground">
                            {card.jenisMakam.description ? `${card.jenisMakam.description} · ` : ""}Masa Hak Pakai{" "}
                            {tenureLabel(card.tenure).toLowerCase()}
                          </p>
                          <p className="mt-1 text-lg text-muted-foreground">
                            {card.perpanjangan
                              ? `Perpanjangan ${formatRupiah(card.perpanjangan.total)} per ${tenureLabel(card.tenure)}`
                              : "Tidak perlu diperpanjang"}
                          </p>
                          {card.biayaPemakamanKhusus ? (
                            <p className="text-lg text-muted-foreground" data-testid="biaya-pemakaman-khusus">
                              {/* The burial line alone: the price above already carries the Biaya Layanan Platform once. */}
                              Biaya Pemakaman tipe ini{" "}
                              {formatRupiah(
                                card.biayaPemakamanKhusus.lines.find((line) => line.kind === "biaya_pemakaman")?.amount ?? card.biayaPemakamanKhusus.total,
                              )}
                              , menggantikan Biaya Pemakaman lokasi
                            </p>
                          ) : null}
                        </div>
                        <div className="sm:text-right">
                          <p className="font-heading text-3xl font-extrabold tabular-nums text-forest md:text-4xl">{formatRupiah(card.hakPakai.total)}</p>
                          {belumTerverifikasi ? null : (
                            <p
                              className={
                                habis ? "text-lg font-bold text-warning-soft-foreground" : "text-lg font-semibold text-success-soft-foreground"
                              }
                            >
                              {habis ? "Belum tersedia saat ini" : `${tersedia} makam tersedia`}
                            </p>
                          )}
                        </div>
                      </div>
                      <p className="mt-3 border-t border-border pt-3 text-body text-muted-foreground tabular-nums">
                        {allInBreakdown(card.hakPakai)}
                      </p>
                      <p className="mt-1 text-body text-muted-foreground">
                        Harga berlaku sejak {formatTanggalPanjang(card.hakPakai.inForceSince)}
                        {card.hakPakai.scheduledChange
                          ? ` · harga baru ${formatRupiah(card.hakPakai.scheduledChange.total)} mulai ${formatTanggalPanjang(card.hakPakai.scheduledChange.effectiveOn)}`
                          : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
            {pricing.biayaPemakaman ? (
              <div className="mt-4 flex flex-col gap-2 text-small">
                <p className="flex items-start gap-2 text-muted-foreground">
                  <CalendarClockIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    Biaya Pemakaman {formatRupiah(pricing.biayaPemakaman.total)} ({allInBreakdown(pricing.biayaPemakaman)}), berlaku
                    sejak {formatTanggalPanjang(pricing.biayaPemakaman.inForceSince)}.
                  </span>
                </p>
                {pricing.biayaPemakaman.scheduledChange ? (
                  <p className="flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-info-soft-foreground">
                    <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden /> Biaya Pemakaman baru{" "}
                    {formatRupiah(pricing.biayaPemakaman.scheduledChange.total)} mulai{" "}
                    {formatTanggalPanjang(pricing.biayaPemakaman.scheduledChange.effectiveOn)}.
                  </p>
                ) : null}
                {pricing.biayaPemakamanTumpang ? (
                  <p className="text-muted-foreground">
                    Pemakaman berikutnya di makam keluarga yang sama (tumpang): {allInBreakdown(pricing.biayaPemakamanTumpang)}.
                  </p>
                ) : null}
              </div>
            ) : null}
          </Section>
          )}

          {hargaTampil && penawaran.length > 0 ? (
            <Section id="layanan" title="Layanan">
              <p className="text-lg text-muted-foreground">
                Layanan yang bisa dipesan untuk makam di lokasi ini. Harganya sudah termasuk semua biaya yang akan
                ditagihkan.
              </p>
              <ul className="mt-5 flex flex-col gap-4">
                {penawaran.map((entry) => (
                  <li key={entry.layanan.id} className="rounded-3xl border border-border bg-card p-6 shadow-md md:p-8">
                    <p className="font-heading text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
                      {entry.layanan.name}
                      {entry.layanan.bisaHariH ? (
                        <span className="text-lg font-normal text-muted-foreground"> · bisa diberikan hari pemakaman</span>
                      ) : null}
                    </p>
                    {entry.layanan.description ? <p className="text-lg text-muted-foreground">{entry.layanan.description}</p> : null}
                    <ul className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
                      {entry.varian.map((varian) => (
                        <li key={varian.id} className="flex flex-col gap-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-lg font-bold text-foreground">{varian.name}</span>
                            <span className="font-heading text-2xl font-extrabold tabular-nums text-forest">{formatRupiah(varian.harga.total)}</span>
                          </div>
                          <p className="text-body text-muted-foreground tabular-nums">
                            {labelledPartsBreakdown(varian.harga.parts)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section id="dokumen" title="Dokumen yang perlu disiapkan">
            {profile.documentChecklist.length === 0 ? (
              <p className="text-muted-foreground">Belum ada daftar dokumen.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {profile.documentChecklist.map((doc) => (
                  <li key={doc} className="flex items-start gap-2 text-body text-foreground">
                    <FileTextIcon className="mt-0.5 size-4 shrink-0 text-sage-strong" aria-hidden /> {doc}
                  </li>
                ))}
              </ul>
            )}
            <p className={belumTerverifikasi ? "hidden" : "mt-3 text-body text-muted-foreground"}>
              Dokumen boleh menyusul: unggah nanti dari halaman pesanan, atau bawa saat hari pemakaman.
            </p>
          </Section>

          <Section id="fasilitas" title="Fasilitas">
            {dikunjungi && !belumTerverifikasi ? <p className="text-body text-muted-foreground">Diperiksa petugas kami saat kunjungan {dikunjungi}.</p> : null}
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {allFacilities.map((facility) => {
                const ada = profile.facilities.checked.includes(facility);
                const Icon = facilityIcons[facility];
                return (
                  <li
                    key={facility}
                    className={ada ? "flex items-center gap-3 text-body text-foreground" : "flex items-center gap-3 text-body text-muted-foreground"}
                  >
                    <span
                      className={
                        ada
                          ? "inline-flex size-9 items-center justify-center rounded-full bg-brand-soft text-forest"
                          : "inline-flex size-9 items-center justify-center rounded-full bg-muted"
                      }
                    >
                      <Icon className="size-4" aria-hidden />
                    </span>
                    {lokasiFacilities[facility]}
                    {ada ? <CheckIcon className="size-4 text-success" aria-label="ada" /> : <CircleSlashIcon className="size-4" aria-label="tidak ada" />}
                  </li>
                );
              })}
            </ul>
            {profile.facilities.note ? <p className="mt-4 text-small text-muted-foreground">{profile.facilities.note}</p> : null}
          </Section>

          <Section id="jam" title="Jam Operasional">
            {profile.jamOperasional ? (
              <JamOperasionalTable jamOperasional={profile.jamOperasional} dapatDipesan={!belumTerverifikasi} />
            ) : (
              <p className="text-muted-foreground">Jam Operasional belum tersedia.</p>
            )}
          </Section>

          <Section id="peta" title="Lokasi dan petunjuk arah">
            <p className="flex items-start gap-1.5 text-body-lg text-foreground">
              <MapPinIcon className="mt-1 size-4 shrink-0 text-sage-strong" aria-hidden /> {profile.address}
            </p>
            {mapsQuery ? (
              <>
                <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-muted">
                  <iframe
                    src={embedMapUrl(mapsQuery)}
                    title={`Peta ${profile.name}`}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    className="block aspect-[16/10] w-full md:aspect-[16/7]"
                  />
                </div>
                <a
                  href={directionsUrl(mapsQuery)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex h-11 items-center gap-2 rounded-lg border border-border-strong bg-card px-4 text-body font-semibold text-forest hover:bg-accent"
                >
                  <NavigationIcon className="size-4" aria-hidden /> Petunjuk arah
                </a>
                {dikunjungi && !belumTerverifikasi ? (
                  <p className="mt-2 text-small text-muted-foreground">
                    Titik peta dicatat petugas kami saat kunjungan {dikunjungi}. Membuka Google Maps di tab baru.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-3 rounded-xl bg-muted px-4 py-3 text-body text-muted-foreground">
                Titik peta lokasi ini belum tersedia. Gunakan alamat di atas, atau tanyakan arah kepada CS kami.
              </p>
            )}
          </Section>

          {/*
           * This section is Pemesanan Terencana's own Pembatalan policy only,
           * hidden entirely on a Lokasi without Terencana (ticket 16 decision,
           * 2026-09-26, from the public prototype). Saat Duka's cancellation
           * rule (spec, story 34 — refunded except Biaya Layanan Platform) is
           * real and in the spec, just out of this section's scope: it belongs
           * on the Saat Duka order flow itself, not repeated here for every
           * Lokasi Mitra page.
           */}
          {profile.terencanaAktif && !belumTerverifikasi ? (
            <Section id="pembatalan" title="Pembatalan pemesanan terencana">
              <ul className="flex flex-col gap-2">
                <li className="flex items-start gap-2 text-body text-foreground">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-sage-strong" aria-hidden />
                  Pembatalan Pemesanan Terencana yang sudah dibayar, sebelum ada Pemakaman, dikembalikan penuh dalam{" "}
                  {profile.pembatalan.masaPembatalanDays} hari sejak dibayar.
                </li>
                <li className="flex items-start gap-2 text-body text-foreground">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-sage-strong" aria-hidden />
                  Setelah itu, pengembalian {profile.pembatalan.refundAfterMasaPembatalanPercent}% dari tarif, sesuai
                  kebijakan Lokasi Mitra ini.
                </li>
              </ul>
            </Section>
          ) : null}
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-24">{cta}</div>
        </aside>
      </div>

      {/* Phone: the booking action stays in reach, above the floating Tanya CS button. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-caption text-muted-foreground">{hargaTampil ? "mulai" : "harga"}</p>
            <p className="text-title-2 tabular-nums">
              {!hargaTampil ? "saat memesan" : pricing.mulaiDari !== null ? formatRupiah(pricing.mulaiDari) : "—"}
            </p>
          </div>
          {menerimaPesanan ? (
            <Link href={pesanHref} className={cn(pilUtama, "h-12 px-5 text-body-lg")}>
              Pesan makam sekarang
            </Link>
          ) : (
            <p className="text-small font-medium text-warning-soft-foreground">
              {belumTerverifikasi ? "Belum Terverifikasi" : "Tidak menerima pesanan"}
            </p>
          )}
        </div>
      </div>
      <div className="mt-10 lg:hidden">{cta}</div>
    </div>
    </>
  );
}
