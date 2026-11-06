import type { Metadata } from "next";
import { cn } from "@/lib/utils";
import { GambarTipeKavlingFigure } from "@/components/site/gambar-tipe-kavling";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  AmbulanceIcon,
  ArmchairIcon,
  ArrowLeft,
  ArrowRight,
  BadgeCheckIcon,
  Check,
  DropletIcon,
  LandmarkIcon,
  LightbulbIcon,
  MapPin,
  ShieldCheckIcon,
  SquareParkingIcon,
  ToiletIcon,
} from "lucide-react";
import { kirimKodeMasuk } from "@/app/(site)/masuk/actions";
import { FilterChip } from "@/components/makam/filter-chip";
import { KotaPickerTautan } from "@/components/makam/kota-picker";
import { buttonVariants } from "@/components/ui/button";
import { lokasiFacilities, type LokasiFacility } from "@/domain/lokasi";
import { HARGA_BANDS, type PilihanDitolak, type PilihanTerencana, type TerencanaQuery, type UnitTerencana } from "@/domain/pemesanan";
import { pesanPeriksa } from "@/lib/terencana-pesan";
import { tenureLabel } from "@/lib/pemesanan-labels";
import { formatRupiah } from "@/lib/rupiah";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";
import { opsiLayananView } from "@/components/layanan/opsi-view";
import { targetPalingDini } from "@/domain/layanan";
import { DataKirim } from "./data-kirim";
import { kavlingByNomor, ringkasanPilihan } from "./ringkasan";
import { pilihanDariParams, terencanaPath } from "./tautan";
import { denahView, lokasiView, terkirimView, type LokasiView } from "./tampilan";

/** One icon per facility (lucide, the design system's icon set), as the Lokasi step's cards show them. */
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

// Every screen of the wizard is rendered per request: its prices, the Denah and the
// confirmation's own order come from the database at that moment, and a build must
// never need one.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Siapkan makam untuk nanti | Makam.co.id",
  robots: { index: false, follow: false },
};

/** The facility filters the Lokasi step offers. */
const filterFasilitas: LokasiFacility[] = ["parkir", "musala", "akses_ambulans"];

function satu(nilai: string | string[] | undefined): string | undefined {
  return Array.isArray(nilai) ? nilai[0] : nilai;
}

export default async function TerencanaPage({ searchParams }: PageProps<"/pesan-makam/terencana">) {
  const params = await searchParams;
  const kota = satu(params.kota) || null;
  const harga = HARGA_BANDS.map((band) => band.key).find((nilai) => nilai === satu(params.harga)) ?? null;
  const fasilitas = (satu(params.fasilitas) ?? "")
    .split(",")
    .filter((nilai): nilai is LokasiFacility => (filterFasilitas as string[]).includes(nilai));
  const pilihan = pilihanDariParams(satu(params.petak), satu(params.kavling));
  const lokasiId = satu(params.lokasiId);
  const langkah = satu(params.langkah);
  // A refusal that sent the family back from Data & kirim: the module's own words, read
  // from the URL, so the Denah says what Kirim would have said about the same plot.
  const ditolak = { reason: satu(params.alasan), nomor: satu(params.petakGagal) ?? null };
  const pesanKembali = ditolak.reason ? pesanPeriksa({ ok: false, reason: ditolak.reason, nomor: ditolak.nomor, sisa: [] } as PilihanDitolak) : null;

  if (lokasiId && langkah === "terkirim" && satu(params.terkirim)) return <Terkirim lokasiId={lokasiId} nomor={satu(params.terkirim)!} />;
  if (lokasiId && langkah === "data" && (pilihan.petak.length > 0 || pilihan.kavling)) {
    return <DataKirimScreen lokasiId={lokasiId} pilihan={pilihan} />;
  }
  if (lokasiId) return <PilihTipeKavlingScreen lokasiId={lokasiId} filter={{ kota, harga, fasilitas }} pesan={pesanKembali} />;
  return <PilihLokasiScreen filter={{ kota, harga, fasilitas }} />;
}

type Filter = { kota: string | null; harga: TerencanaQuery["harga"] | null; fasilitas: LokasiFacility[] };

/** The chosen plots the read resolved, as the Server Action takes them: Petak Makam or Kavling Keluarga by id. */
function unitsDari(unit: readonly UnitTerencana[]) {
  return unit.map((satu) => (satu.jenis === "kavling" ? { kavlingId: satu.id } : { petakId: satu.id }));
}

/** The progress bar with a way back (spec, Booking wizards: one decision per screen). */
function Progress({ langkah, total, backHref, backLabel }: { langkah: number; total: number; backHref: string; backLabel: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={backHref}
          className="-ml-2 inline-flex h-12 items-center gap-2 rounded-xl px-3 text-lg font-bold text-forest hover:bg-accent"
        >
          <ArrowLeft className="size-5" aria-hidden /> {backLabel}
        </Link>
        <span className="text-body font-semibold text-muted-foreground">
          Langkah {langkah} dari {total}
        </span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={langkah}
        aria-label="Langkah pemesanan"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${(langkah / total) * 100}%` }} />
      </div>
    </div>
  );
}

/** Step 1: only Lokasi Mitra that take Pemesanan Terencana, by city, price band and facilities. */
async function PilihLokasiScreen({ filter }: { filter: Filter }) {
  const { pemesanan, lokasi } = serverRuntime();
  const [daftar, kotaList] = await Promise.all([
    pemesanan.pilihanTerencana({ city: filter.kota ?? undefined, harga: filter.harga ?? undefined, facilities: filter.fasilitas }),
    pemesanan.kotaTerencana(),
  ]);
  // The Kunjungan Verifikasi's first photo, signed for this request; a Lokasi not yet
  // visited (no photo taken) shows the card without one, never a placeholder image.
  const foto = await Promise.all(daftar.map((kartu) => lokasi.publicVisitPhotoUrls(kartu.lokasi.id)));
  const kartu = daftar.map((satu, index) => lokasiView(satu, foto[index]?.at(0) ?? null));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-5 pb-16">
      <Progress langkah={1} total={3} backHref="/" backLabel="Kembali" />
      <div className="rounded-3xl bg-forest px-6 py-8 text-ivory md:px-10 md:py-12">
        <h1 className="font-heading text-4xl font-extrabold leading-tight tracking-tight md:text-6xl">Pilih lokasi</h1>
        <p className="mt-3 max-w-2xl text-lg text-ivory/85">
          Lokasi Mitra yang sudah membuka pemesanan terencana. Di langkah berikutnya Anda memilih tipe kavlingnya.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <KotaPickerTautan
          kota={filter.kota}
          semuaKota={kotaList}
          aksi="/pesan-makam/terencana"
          tautan={Object.fromEntries([["", terencanaPath({ ...filter, kota: null })], ...kotaList.map((nama) => [nama, terencanaPath({ ...filter, kota: nama })])])}
          tetap={[
            ...(filter.harga ? [["harga", filter.harga] as [string, string]] : []),
            ...(filter.fasilitas.length ? [["fasilitas", filter.fasilitas.join(",")] as [string, string]] : []),
          ]}
        />
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Harga dan fasilitas">
          {HARGA_BANDS.map((band) => (
            <FilterChip
              key={band.key}
              href={terencanaPath({ ...filter, harga: filter.harga === band.key ? null : band.key })}
              selected={filter.harga === band.key}
            >
              {band.label}
            </FilterChip>
          ))}
          <span className="mx-1 w-px shrink-0 self-stretch bg-border" aria-hidden />
          {filterFasilitas.map((nilai) => {
            const aktif = filter.fasilitas.includes(nilai);
            return (
              <FilterChip
                key={nilai}
                href={terencanaPath({ ...filter, fasilitas: aktif ? filter.fasilitas.filter((satu) => satu !== nilai) : [...filter.fasilitas, nilai] })}
                selected={aktif}
              >
                {lokasiFacilities[nilai] ?? nilai}
              </FilterChip>
            );
          })}
        </div>
      </div>
      {kartu.length === 0 ? (
        <p className="rounded-3xl border-2 border-dashed border-border-strong p-8 text-center text-lg text-muted-foreground">
          Belum ada lokasi dengan pemesanan terencana yang cocok. Coba hapus salah satu filter.
        </p>
      ) : (
        <ul className="grid gap-6 md:grid-cols-2">
          {kartu.map((satu) => (
            <Kartu key={satu.id} kartu={satu} />
          ))}
        </ul>
      )}
    </main>
  );
}

function Kartu({ kartu }: { kartu: LokasiView }) {
  return (
    <li className="group relative flex flex-col overflow-hidden rounded-3xl bg-forest text-ivory shadow-xs transition-shadow hover:shadow-md">
      {kartu.foto ? (
        <div className="relative aspect-video overflow-hidden">
          {/* Kunjungan Verifikasi photo, a short-lived signed URL: plain <img>, next/image cannot cache a URL that expires. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={kartu.foto} alt={`Foto ${kartu.name}`} className="size-full object-cover" />
        </div>
      ) : null}
      <div className="flex flex-1 flex-col gap-4 p-6 md:p-8">
        <div>
          <h2 className="font-heading text-2xl font-extrabold leading-tight tracking-tight md:text-3xl">
            <Link href={terencanaPath({ langkah: "petak", lokasiId: kartu.id })} className="text-left after:absolute after:inset-0">
              {kartu.name}
            </Link>
          </h2>
          <p className="mt-2 flex items-center gap-2 text-lg text-ivory/85">
            <MapPin className="size-5 text-sand" aria-hidden /> {kartu.city}
          </p>
        </div>
        <p className="flex items-center gap-2 text-body font-semibold text-sand">
          <BadgeCheckIcon className="size-5" aria-hidden /> {kartu.terverifikasi}
        </p>
        <div className="mt-auto flex items-end justify-between gap-3 pt-2">
          <div>
            <p className="text-body text-ivory/80">mulai</p>
            <p className="font-heading text-3xl font-extrabold whitespace-nowrap tabular-nums text-sand">{kartu.mulai ?? "belum ada harga"}</p>
            <p className="text-body text-ivory/80">Hak Pakai; biaya pemakaman dibayar nanti</p>
          </div>
          {kartu.fasilitas.length > 0 ? (
            <ul className="flex items-center gap-1.5" aria-label="Fasilitas">
              {kartu.fasilitas.map((satu) => {
                const Icon = facilityIcons[satu.key];
                return (
                  <li key={satu.key} title={satu.label} className="inline-flex size-10 items-center justify-center rounded-full bg-ivory/15 text-ivory">
                    <Icon className="size-5" aria-hidden />
                    <span className="sr-only">{satu.label}</span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-ivory/20 pt-4">
          <span className="text-body text-ivory/85">{kartu.tersedia}</span>
          <span className="inline-flex h-14 items-center gap-2 rounded-xl bg-ivory px-8 text-lg font-bold text-forest group-hover:bg-ivory/90">
            Pilih tipe kavling <ArrowRight className="size-5" aria-hidden />
          </span>
        </div>
      </div>
    </li>
  );
}

/**
 * Step 2: Pilih Tipe Kavling (owner, 2026-11-02). The Denah is not shown: the family picks a tipe kavling with its
 * size, capacity, Masa Hak Pakai and all-in price, and the order takes the next pickable unit of that tipe.
 */
async function PilihTipeKavlingScreen({ lokasiId, filter, pesan }: { lokasiId: string; filter: Filter; pesan: string | null }) {
  const { pemesanan, lokasi, tariffs } = serverRuntime();
  const hasil = await pemesanan.tipeKavlingTerencana(lokasiId);
  if (!hasil) notFound();
  const [galeri, gambarTipe] = await Promise.all([
    lokasi.publicFotoGaleri(lokasiId),
    tariffs.publicGambarTipeKavling(hasil.tipe.map((tipe) => tipe.jenisMakamId)),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-5 pb-16">
      <Progress langkah={2} total={3} backHref={terencanaPath(filter)} backLabel="Pilih lokasi" />
      <div className="rounded-3xl bg-forest px-6 py-8 text-ivory md:px-10 md:py-12">
        <h1 className="font-heading text-4xl font-extrabold leading-tight tracking-tight md:text-6xl">Pilih tipe kavling</h1>
        <p className="mt-3 text-lg text-ivory/85">
          {hasil.lokasi.name}, {hasil.lokasi.city}.{" "}
          <Link href={`/lokasi/${hasil.lokasi.id}`} className="font-bold text-sand underline underline-offset-4">
            Lihat lokasi
          </Link>
        </p>
      </div>
      {galeri.length > 0 ? (
        <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1" aria-label={`Foto ${hasil.lokasi.name}`}>
          {galeri.map((foto) => (
            <li key={foto.id} className="w-56 shrink-0">
              <figure className="overflow-hidden rounded-xl bg-muted">
                {/* Galeri Lokasi photo, a short-lived signed URL: plain <img>. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={foto.url!} alt={foto.keterangan} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                <figcaption className="px-3 py-1.5 text-caption text-muted-foreground">{foto.keterangan}</figcaption>
              </figure>
            </li>
          ))}
        </ul>
      ) : null}
      {pesan ? (
        <p role="status" className="rounded-xl bg-warning-soft px-4 py-3 text-body font-medium text-warning-soft-foreground">
          {pesan}
        </p>
      ) : null}
      {hasil.tipe.length === 0 ? (
        <p className="text-lg text-muted-foreground">Belum ada tipe kavling yang bisa dipesan di lokasi ini.</p>
      ) : (
        <ul className="grid gap-6 md:grid-cols-2">
          {hasil.tipe.map((tipe) => (
            <li key={tipe.jenisMakamId} className="flex flex-col gap-4 rounded-3xl border-4 border-border bg-card p-6 md:p-8">
              {gambarTipe[tipe.jenisMakamId] ? <GambarTipeKavlingFigure gambar={gambarTipe[tipe.jenisMakamId]} className="overflow-hidden rounded-xl bg-muted" /> : null}
              <div>
                <h2 className="font-heading text-2xl font-extrabold tracking-tight text-forest md:text-3xl">{tipe.name}</h2>
                {tipe.description ? <p className="mt-1 text-lg text-muted-foreground">{tipe.description}</p> : null}
                <p className="mt-1 text-body text-muted-foreground">Masa Hak Pakai {tenureLabel(tipe.tenure).toLowerCase()}</p>
              </div>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-display tabular-nums text-foreground">{formatRupiah(tipe.hargaAllIn)}</p>
                  <p className="text-body text-muted-foreground">sudah all-in · {tipe.tersedia > 0 ? `${tipe.tersedia} tersedia` : "habis"}</p>
                </div>
                {tipe.berikut ? (
                  <Link
                    href={terencanaPath({ langkah: "data", lokasiId, ...tipe.berikut })}
                    className={cn(buttonVariants({ size: "lg" }), "h-14 rounded-xl px-8 text-lg font-bold")}
                    aria-label={`Pilih ${tipe.name}`}
                  >
                    Pilih <ArrowRight className="size-5" aria-hidden />
                  </Link>
                ) : (
                  <span className="text-lg font-bold text-muted-foreground">Habis</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

/** Step 3: the family's data, the Syarat, and the Kode Masuk that proves the email at Kirim. */
async function DataKirimScreen({ lokasiId, pilihan }: { lokasiId: string; pilihan: PilihanTerencana }) {
  const { pemesanan, operatorSettings, layanan, adapters } = serverRuntime();
  const [denah, actor, pengaturan] = await Promise.all([pemesanan.denahTerencana(lokasiId, pilihan), currentActor(), operatorSettings.current()]);
  if (!denah) notFound();
  // The Layanan offered for an empty plot, for one Petak Makam only (ticket 53); each with the first day its lead time allows.
  const layananOpsi =
    denah.unit.length === 1 && denah.unit[0].jenis === "petak"
      ? (await layanan.penawaranCheckout(lokasiId, "petak_kosong")).map((grup) => opsiLayananView({ ...grup, tanggalPalingDini: targetPalingDini(grup.layanan.leadTimeDays, adapters.clock.now()) }))
      : [];
  const tampilan = denahView(denah);
  const units = unitsDari(denah.unit);

  // The check "Lanjut" made, read again: a plot taken in between sends the family back to the
  // Denah with the module's own words and the picks that are still good, never a 404.
  const dicek = await pemesanan.periksaPilihanTerencana({ lokasiId, units });
  if (!dicek.ok) {
    redirect(
      terencanaPath({
        langkah: "petak",
        lokasiId,
        // Every pick that is still good stays chosen; the plot that went is named in the message.
        petak: dicek.sisa.filter((satu) => satu.jenis === "petak").map((satu) => satu.nomor),
        kavling: dicek.sisa.find((satu) => satu.jenis === "kavling")?.nomor ?? null,
        alasan: dicek.reason,
        petakGagal: dicek.nomor,
      }),
    );
  }

  const petakNomor = denah.unit.filter((satu) => satu.jenis === "petak").map((satu) => satu.nomor);
  const kavlingNomor = denah.unit.find((satu) => satu.jenis === "kavling")?.nomor ?? null;
  const kavlingTerpilih = kavlingNomor ? kavlingByNomor(tampilan, kavlingNomor) : null;
  // Pilih Tipe Kavling: the family chose a tipe, so the summary names it, with the unit the order takes.
  const ringkasan = denah.unit.length === 1 ? `${denah.unit[0].jenisMakamName} · ${denah.unit[0].nomor}` : ringkasanPilihan(tampilan, petakNomor, kavlingTerpilih);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-5 pb-40">
      <Progress langkah={3} total={3} backHref={terencanaPath({ langkah: "petak", lokasiId })} backLabel="Pilih tipe kavling" />
      <div className="rounded-3xl bg-forest px-6 py-8 text-ivory md:px-10 md:py-12">
        <h1 className="font-heading text-4xl font-extrabold leading-tight tracking-tight md:text-6xl">Data &amp; kirim</h1>
        <p className="mt-3 text-lg text-ivory/85">Data untuk mencatat Hak Pakai. Tidak ada yang dibayar saat mengirim.</p>
      </div>
      <DataKirim
        draft={{ lokasiId, units, email: actor?.email ?? "", phoneNumber: actor?.phoneNumber ?? "" }}
        pilihan={pilihan}
        ringkasan={ringkasan}
        lokasiName={tampilan.lokasi.name}
        denah={tampilan}
        syarat={tampilan.syarat}
        sudahMasuk={actor !== null}
        mintaKodeMasuk={kirimKodeMasuk}
        csContact={pengaturan ? { whatsApp: pengaturan.csWhatsApp, replyHours: pengaturan.csReplyHours } : null}
        layananOpsi={layananOpsi}
      />
    </main>
  );
}

/** After Kirim: the order as its own Pemesan reads it back, with the Syarat from its own snapshot. */
async function Terkirim({ lokasiId, nomor }: { lokasiId: string; nomor: string }) {
  const { pemesanan } = serverRuntime();
  const actor = await currentActor();
  // The Kode Masuk at Kirim signed this Akun in; without it there is no order of theirs to read here.
  if (!actor) redirect(terencanaPath({ langkah: "petak", lokasiId }));
  const order = await pemesanan.terencanaOf(nomor, { accountId: actor.accountId });
  if (!order) notFound();
  const denah = await pemesanan.denahTerencana(lokasiId);
  const blok = denah ? denahView(denah).blok : [];
  // The hold the Lokasi Mitra's own policy gives (24 h by default), which is how long the family has to pay once it confirms.
  const jamTahan = await serverRuntime().lokasi.terencanaHoldHours(lokasiId);
  const tampil = terkirimView(order, (nama) => blok.find((satu) => satu.cells.some((cell) => cell.nomor === nama))?.name ?? null);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-5 pb-16">
      <div className="flex flex-col gap-4 rounded-3xl bg-forest px-6 py-8 text-ivory md:px-10 md:py-12">
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-ivory text-forest">
          <Check className="size-8" aria-hidden />
        </span>
        <h1 className="font-heading text-4xl font-extrabold leading-tight tracking-tight md:text-6xl">Pesanan terkirim</h1>
        <p className="text-xl text-ivory/85">
          Nomor Pemesanan <span className="font-mono font-bold text-sand">{tampil.nomor}</span>
        </p>
      </div>
      <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 md:p-8">
        <p className="text-lg text-foreground">
          {tampil.ringkasan} di {tampil.lokasiNama} kini ditahan untuk Anda. Lokasi Mitra akan mengonfirmasi pesanan ini pada hari kerja berikutnya; setelah itu Tagihan
          terbit dan dikirim ke email Anda, dan Anda punya {jamTahan === null ? "waktu" : `${jamTahan} jam`} untuk membayar.
        </p>
        <ul className="flex flex-col gap-1 text-body text-muted-foreground">
          {tampil.unit.map((satu) => (
            <li key={satu} className="font-mono">
              {satu}
            </li>
          ))}
        </ul>
        <div>
          <h2 className="font-heading text-2xl font-extrabold tracking-tight text-forest">Syarat Pemesanan Terencana</h2>
          <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-body text-muted-foreground">
            {tampil.syarat.map((satu) => (
              <li key={satu}>{satu}</li>
            ))}
          </ul>
          <p className="mt-2 text-small text-muted-foreground">Syarat ini tersimpan bersama pesanan Anda, bukan mengikuti perubahan kebijakan lokasi.</p>
        </div>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href={`/pesanan/${tampil.nomor}`} className={cn(buttonVariants({ size: "lg" }), "h-14 rounded-xl px-8 text-lg font-bold")}>
            Ikuti pesanan
          </Link>
          <Link href={`/lokasi/${lokasiId}`} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-14 rounded-xl px-8 text-lg font-bold")}>
            Lihat lokasi
          </Link>
          <Link href="/lokasi" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-14 rounded-xl px-8 text-lg font-bold")}>
            Cari lokasi lain
          </Link>
        </div>
      </div>
    </main>
  );
}
