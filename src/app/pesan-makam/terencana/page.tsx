import type { Metadata } from "next";
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
import { buttonVariants } from "@/components/ui/button";
import { lokasiFacilities, type LokasiFacility } from "@/domain/lokasi";
import { HARGA_BANDS, type PilihanDitolak, type PilihanTerencana, type TerencanaQuery, type UnitTerencana } from "@/domain/pemesanan";
import { pesanBatasPembayaran, pesanPeriksa } from "@/lib/terencana-pesan";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";
import { DataKirim } from "./data-kirim";
import { DenahPicker } from "./denah-picker";
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
  const kota = satu(params.kota) ?? null;
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
  if (lokasiId) return <PilihPetakScreen lokasiId={lokasiId} pilihan={pilihan} filter={{ kota, harga, fasilitas }} pesan={pesanKembali} />;
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
          className="-ml-2 inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-body font-medium text-primary hover:bg-accent"
        >
          <ArrowLeft className="size-4" aria-hidden /> {backLabel}
        </Link>
        <span className="text-small text-muted-foreground">
          Langkah {langkah} dari {total}
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
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
      <div>
        <h1 className="text-title-1 text-forest md:text-3xl md:leading-tight">Pilih lokasi</h1>
        <p className="mt-1 max-w-2xl text-body-lg text-muted-foreground">
          Lokasi Mitra yang sudah membuka pemesanan terencana. Di langkah berikutnya Anda memilih sendiri petaknya di denah.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Kota">
          <FilterChip href={terencanaPath({ ...filter, kota: null })} selected={filter.kota === null}>
            Semua kota
          </FilterChip>
          {kotaList.map((nama) => (
            <FilterChip key={nama} href={terencanaPath({ ...filter, kota: nama })} selected={filter.kota === nama}>
              {nama}
            </FilterChip>
          ))}
        </div>
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
        <p className="rounded-2xl border border-dashed border-border-strong p-6 text-center text-body text-muted-foreground">
          Belum ada lokasi dengan pemesanan terencana yang cocok. Coba hapus salah satu filter.
        </p>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2">
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
    <li className="group relative flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-xs transition-shadow hover:shadow-md">
      {kartu.foto ? (
        <div className="relative aspect-video overflow-hidden">
          {/* Kunjungan Verifikasi photo, a short-lived signed URL: plain <img>, next/image cannot cache a URL that expires. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={kartu.foto} alt={`Foto ${kartu.name}`} className="size-full object-cover" />
        </div>
      ) : null}
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <h2 className="text-title-2 text-foreground">
            <Link href={terencanaPath({ langkah: "petak", lokasiId: kartu.id })} className="text-left after:absolute after:inset-0">
              {kartu.name}
            </Link>
          </h2>
          <p className="mt-1 flex items-center gap-1 text-small text-muted-foreground">
            <MapPin className="size-3.5" aria-hidden /> {kartu.city}
          </p>
        </div>
        <p className="flex items-center gap-1.5 text-small font-medium text-success-soft-foreground">
          <BadgeCheckIcon className="size-4" aria-hidden /> {kartu.terverifikasi}
        </p>
        <div className="mt-auto flex items-end justify-between gap-3 pt-2">
          <div>
            <p className="text-caption text-muted-foreground">mulai</p>
            <p className="text-title-2 tabular-nums">{kartu.mulai ?? "belum ada harga"}</p>
            <p className="text-caption text-muted-foreground">Hak Pakai; biaya pemakaman dibayar nanti</p>
          </div>
          {kartu.fasilitas.length > 0 ? (
            <ul className="flex items-center gap-1.5" aria-label="Fasilitas">
              {kartu.fasilitas.map((satu) => {
                const Icon = facilityIcons[satu.key];
                return (
                  <li key={satu.key} title={satu.label} className="inline-flex size-8 items-center justify-center rounded-full bg-brand-soft text-primary">
                    <Icon className="size-4" aria-hidden />
                    <span className="sr-only">{satu.label}</span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <span className="text-small text-foreground">{kartu.tersedia}</span>
          <span className="inline-flex items-center gap-1 text-body font-semibold text-primary">
            Pilih petak <ArrowRight className="size-4" aria-hidden />
          </span>
        </div>
      </div>
    </li>
  );
}

/** Step 2: the Denah, priced at this instant. */
async function PilihPetakScreen({ lokasiId, pilihan, filter, pesan }: { lokasiId: string; pilihan: PilihanTerencana; filter: Filter; pesan: string | null }) {
  const { pemesanan } = serverRuntime();
  // The read takes the URL's numbers and answers with the units it resolved and their price, so a
  // pick the Denah no longer knows (renumbered away, or a link from before) is simply not shown chosen.
  const [denah, actor] = await Promise.all([pemesanan.denahTerencana(lokasiId, pilihan), currentActor()]);
  if (!denah) notFound();
  const tampilan = denahView(denah);
  const unitOf = denah.unit.map(({ jenis, id, nomor }) => ({ jenis, id, nomor }));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-5 pb-40">
      <Progress langkah={2} total={3} backHref={terencanaPath(filter)} backLabel="Pilih lokasi" />
      <div>
        <h1 className="text-title-1 text-forest md:text-3xl md:leading-tight">Pilih petak</h1>
        <p className="mt-1 text-body-lg text-muted-foreground">
          {tampilan.lokasi.name}, {tampilan.lokasi.city}.{" "}
          <Link href={`/lokasi/${tampilan.lokasi.id}`} className="font-medium text-primary underline underline-offset-2">
            Lihat lokasi
          </Link>
        </p>
      </div>
      <DenahPicker
        denah={tampilan}
        petak={denah.unit.filter((satu) => satu.jenis === "petak").map((satu) => satu.nomor)}
        kavling={denah.unit.find((satu) => satu.jenis === "kavling")?.nomor ?? null}
        unitOf={unitOf}
        sudahMasuk={actor !== null}
        pesanKembali={pesan}
        pesanBatas={denah.total.dalamBatas ? null : pesanBatasPembayaran(denah.total.total)}
      />
    </main>
  );
}

/** Step 3: the family's data, the Syarat, and the Kode Masuk that proves the email at Kirim. */
async function DataKirimScreen({ lokasiId, pilihan }: { lokasiId: string; pilihan: PilihanTerencana }) {
  const { pemesanan, operatorSettings } = serverRuntime();
  const [denah, actor, pengaturan] = await Promise.all([pemesanan.denahTerencana(lokasiId, pilihan), currentActor(), operatorSettings.current()]);
  if (!denah) notFound();
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
  const ringkasan = ringkasanPilihan(tampilan, petakNomor, kavlingTerpilih);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-5 pb-40">
      <Progress langkah={3} total={3} backHref={terencanaPath({ langkah: "petak", lokasiId, ...pilihan })} backLabel="Pilih petak" />
      <div>
        <h1 className="text-title-1 text-forest md:text-3xl md:leading-tight">Data &amp; kirim</h1>
        <p className="mt-1 text-body-lg text-muted-foreground">Data untuk mencatat Hak Pakai. Tidak ada yang dibayar saat mengirim.</p>
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
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-6">
        <span className="inline-flex size-11 items-center justify-center rounded-full bg-success-soft text-success-soft-foreground">
          <Check className="size-6" aria-hidden />
        </span>
        <h1 className="text-title-1 text-forest">Pesanan terkirim</h1>
        <p className="text-body-lg text-muted-foreground">
          Nomor Pemesanan <span className="font-mono font-semibold text-foreground">{tampil.nomor}</span>
        </p>
        <p className="text-body text-foreground">
          {tampil.ringkasan} di {tampil.lokasiNama} kini ditahan untuk Anda. Lokasi Mitra akan mengonfirmasi pesanan ini pada hari kerja berikutnya; setelah itu Tagihan
          terbit dan dikirim ke email Anda, dan Anda punya {jamTahan === null ? "waktu" : `${jamTahan} jam`} untuk membayar.
        </p>
        <ul className="flex flex-col gap-1 text-small text-muted-foreground">
          {tampil.unit.map((satu) => (
            <li key={satu} className="font-mono">
              {satu}
            </li>
          ))}
        </ul>
        <div>
          <h2 className="text-title-3 text-foreground">Syarat Pemesanan Terencana</h2>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-small text-muted-foreground">
            {tampil.syarat.map((satu) => (
              <li key={satu}>{satu}</li>
            ))}
          </ul>
          <p className="mt-2 text-small text-muted-foreground">Syarat ini tersimpan bersama pesanan Anda, bukan mengikuti perubahan kebijakan lokasi.</p>
        </div>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href={`/pesanan/${tampil.nomor}`} className={buttonVariants({ size: "lg" })}>
            Ikuti pesanan
          </Link>
          <Link href={`/lokasi/${lokasiId}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
            Lihat lokasi
          </Link>
          <Link href="/lokasi" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Cari lokasi lain
          </Link>
        </div>
      </div>
    </main>
  );
}
