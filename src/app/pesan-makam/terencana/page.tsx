import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Check, MapPin } from "lucide-react";
import { kirimKodeMasuk } from "@/app/masuk/actions";
import { buttonVariants } from "@/components/ui/button";
import { lokasiFacilities, type LokasiFacility } from "@/domain/lokasi";
import type { TerencanaQuery } from "@/domain/pemesanan";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";
import { DataKirim } from "./data-kirim";
import { DenahPicker } from "./denah-picker";
import { pilihanDariParams, terencanaPath } from "./tautan";
import { denahView, lokasiView, terkirimView, type LokasiView } from "./tampilan";

// Every screen of the wizard is rendered per request: its prices, the Denah and the
// confirmation's own order come from the database at that moment, and a build must
// never need one.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Siapkan makam untuk nanti | Makam.co.id",
  robots: { index: false, follow: false },
};

/** The Lokasi step's price bands, as the URL carries them. */
const hargaBands = [
  ["hingga_10_juta", "Hingga Rp 10 jt"],
  ["10_sampai_25_juta", "Rp 10–25 jt"],
  ["di_atas_25_juta", "Di atas Rp 25 jt"],
] as const;

/** The facility filters the Lokasi step offers. */
const filterFasilitas: LokasiFacility[] = ["parkir", "musala", "akses_ambulans"];

function satu(nilai: string | string[] | undefined): string | undefined {
  return Array.isArray(nilai) ? nilai[0] : nilai;
}

export default async function TerencanaPage({ searchParams }: PageProps<"/pesan-makam/terencana">) {
  const params = await searchParams;
  const kota = satu(params.kota) ?? null;
  const harga = hargaBands.map(([nilai]) => nilai).find((nilai) => nilai === satu(params.harga)) ?? null;
  const fasilitas = (satu(params.fasilitas) ?? "")
    .split(",")
    .filter((nilai): nilai is LokasiFacility => (filterFasilitas as string[]).includes(nilai));
  const pilihan = pilihanDariParams(satu(params.petak), satu(params.kavling));
  const lokasiId = satu(params.lokasiId);
  const langkah = satu(params.langkah);

  if (lokasiId && langkah === "terkirim" && satu(params.terkirim)) return <Terkirim lokasiId={lokasiId} nomor={satu(params.terkirim)!} />;
  if (lokasiId && langkah === "data" && (pilihan.petak.length > 0 || pilihan.kavling)) {
    return <DataKirimScreen lokasiId={lokasiId} pilihan={pilihan} />;
  }
  if (lokasiId) return <PilihPetakScreen lokasiId={lokasiId} pilihan={pilihan} filter={{ kota, harga, fasilitas }} />;
  return <PilihLokasiScreen filter={{ kota, harga, fasilitas }} />;
}

type Filter = { kota: string | null; harga: TerencanaQuery["harga"] | null; fasilitas: LokasiFacility[] };

/** The progress bar with a way back (spec, Booking wizards: one decision per screen). */
function Progress({ langkah, total, backHref, backLabel }: { langkah: number; total: number; backHref: string; backLabel: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <Link href={backHref} className="-ml-2 inline-flex items-center gap-1.5 text-body font-medium text-primary">
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
  const { pemesanan } = serverRuntime();
  const [daftar, kotaList] = await Promise.all([
    pemesanan.pilihanTerencana({ city: filter.kota ?? undefined, harga: filter.harga ?? undefined, facilities: filter.fasilitas }),
    pemesanan.kotaTerencana(),
  ]);
  const kartu = daftar.map(lokasiView);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-5 pb-16">
      <Progress langkah={1} total={3} backHref="/" backLabel="Kembali" />
      <div>
        <h1 className="text-title-1 text-foreground">Pilih lokasi</h1>
        <p className="mt-1 max-w-2xl text-body-lg text-muted-foreground">
          Lokasi Mitra yang sudah membuka pemesanan terencana. Di langkah berikutnya Anda memilih sendiri petaknya di denah.
        </p>
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filter kota, harga dan fasilitas">
        <Chip on={filter.kota === null} href={terencanaPath({ ...filter, kota: null })}>
          Semua kota
        </Chip>
        {kotaList.map((nama) => (
          <Chip key={nama} on={filter.kota === nama} href={terencanaPath({ ...filter, kota: nama })}>
            {nama}
          </Chip>
        ))}
        <span className="mx-1 w-px shrink-0 self-stretch bg-border" aria-hidden />
        {hargaBands.map(([nilai, label]) => (
          <Chip key={nilai} on={filter.harga === nilai} href={terencanaPath({ ...filter, harga: filter.harga === nilai ? null : nilai })}>
            {label}
          </Chip>
        ))}
        {filterFasilitas.map((nilai) => {
          const aktif = filter.fasilitas.includes(nilai);
          return (
            <Chip
              key={nilai}
              on={aktif}
              href={terencanaPath({ ...filter, fasilitas: aktif ? filter.fasilitas.filter((satu) => satu !== nilai) : [...filter.fasilitas, nilai] })}
            >
              {lokasiFacilities[nilai] ?? nilai}
            </Chip>
          );
        })}
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
    <li className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-5 shadow-xs">
      <div>
        <h2 className="text-title-2 text-foreground">
          <Link href={terencanaPath({ langkah: "petak", lokasiId: kartu.id })} className="hover:underline">
            {kartu.name}
          </Link>
        </h2>
        <p className="mt-1 flex items-center gap-1 text-small text-muted-foreground">
          <MapPin className="size-3.5" aria-hidden /> {kartu.city}
        </p>
      </div>
      <p className="text-small font-medium text-success-soft-foreground">{kartu.terverifikasi}</p>
      <div className="mt-auto flex items-end justify-between gap-3 pt-2">
        <div>
          <p className="text-caption text-muted-foreground">mulai</p>
          <p className="text-title-2 tabular-nums">{kartu.mulai ?? "belum ada harga"}</p>
          <p className="text-caption text-muted-foreground">Hak Pakai; biaya pemakaman dibayar nanti</p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          {kartu.fasilitas.map((satu) => (
            <span key={satu} className="rounded-full border border-border px-2.5 py-1 text-caption text-muted-foreground">
              {satu}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <span className="text-small text-foreground">{kartu.tersedia}</span>
        <Link href={terencanaPath({ langkah: "petak", lokasiId: kartu.id })} className="text-body font-semibold text-primary">
          Pilih petak
        </Link>
      </div>
    </li>
  );
}

function Chip({ on, href, children }: { on: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={on ? "true" : undefined}
      className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-body font-medium whitespace-nowrap ${
        on ? "border-primary bg-primary text-primary-foreground" : "border-border-strong bg-card hover:bg-accent"
      }`}
    >
      {on ? <Check className="size-4" aria-hidden /> : null}
      {children}
    </Link>
  );
}

/** Step 2: the Denah, priced at this instant. */
async function PilihPetakScreen({ lokasiId, pilihan, filter }: { lokasiId: string; pilihan: { petak: string[]; kavling: string | null }; filter: Filter }) {
  const { pemesanan } = serverRuntime();
  const [denah, actor] = await Promise.all([pemesanan.denahTerencana(lokasiId), currentActor()]);
  if (!denah) notFound();
  const tampilan = denahView(denah);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-5 pb-16">
      <Progress langkah={2} total={3} backHref={terencanaPath(filter)} backLabel="Pilih lokasi" />
      <div>
        <h1 className="text-title-1 text-foreground">Pilih petak</h1>
        <p className="mt-1 text-body-lg text-muted-foreground">
          {tampilan.lokasi.name}, {tampilan.lokasi.city}.{" "}
          <Link href={`/lokasi/${tampilan.lokasi.id}`} className="font-medium text-primary underline underline-offset-2">
            Lihat lokasi
          </Link>
        </p>
      </div>
      <DenahPicker denah={tampilan} petakAwal={pilihan.petak} kavlingAwal={pilihan.kavling} sudahMasuk={actor !== null} />
    </main>
  );
}

/** Step 3: the family's data, the Syarat, and the Kode Masuk that proves the email at Kirim. */
async function DataKirimScreen({ lokasiId, pilihan }: { lokasiId: string; pilihan: { petak: string[]; kavling: string | null } }) {
  const { pemesanan, operatorSettings } = serverRuntime();
  const [denah, actor, pengaturan] = await Promise.all([pemesanan.denahTerencana(lokasiId), currentActor(), operatorSettings.current()]);
  if (!denah) notFound();
  const tampilan = denahView(denah);

  // The picked numbers are resolved to the units the order holds, so the action
  // sends ids and a number that names nothing here is never placed.
  const cells = new Map(tampilan.blok.flatMap((blok) => blok.cells.map((cell) => [cell.nomor ?? "", cell] as const)));
  const kavling = new Map(tampilan.blok.flatMap((blok) => blok.kavling.map((satu) => [satu.nomor, satu] as const)));
  const units = pilihan.kavling
    ? kavling.has(pilihan.kavling)
      ? [{ kavlingId: kavling.get(pilihan.kavling)!.id }]
      : []
    : pilihan.petak.map((nomor) => (cells.has(nomor) ? [{ petakId: cells.get(nomor)!.id }] : [])).flat();
  if (units.length !== pilihan.petak.length + (pilihan.kavling ? 1 : 0)) notFound();

  const ringkasan = pilihan.kavling
    ? `Kavling Keluarga ${pilihan.kavling} · ${tampilan.lokasi.name}`
    : `${pilihan.petak.length} Petak · ${pilihan.petak.join(", ")} · ${tampilan.lokasi.name}`;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-5 pb-16">
      <Progress langkah={3} total={3} backHref={terencanaPath({ langkah: "petak", lokasiId, ...pilihan })} backLabel="Pilih petak" />
      <div>
        <h1 className="text-title-1 text-foreground">Data &amp; kirim</h1>
        <p className="mt-1 text-body-lg text-muted-foreground">Data untuk mencatat Hak Pakai. Tidak ada yang dibayar saat mengirim.</p>
      </div>
      <DataKirim
        draft={{ lokasiId, units, email: actor?.email ?? "", phoneNumber: actor?.phoneNumber ?? "" }}
        pilihan={pilihan}
        ringkasan={ringkasan}
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
  const { pemesanan, database } = serverRuntime();
  const actor = await currentActor();
  // The Kode Masuk at Kirim signed this Akun in; without it there is no order of theirs to read here.
  if (!actor) redirect(terencanaPath({ langkah: "petak", lokasiId }));
  const order = await pemesanan.terencanaOf(database.db, { accountId: actor.accountId }, nomor);
  if (!order) notFound();
  const denah = await pemesanan.denahTerencana(lokasiId);
  const blok = denah ? denahView(denah).blok : [];
  const tampil = terkirimView(order, (nama) => blok.find((satu) => satu.cells.some((cell) => cell.nomor === nama))?.name ?? null);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-5 pb-16">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-6">
        <span className="inline-flex size-11 items-center justify-center rounded-full bg-success-soft text-success-soft-foreground">
          <Check className="size-6" aria-hidden />
        </span>
        <h1 className="text-title-1 text-foreground">Pesanan terkirim</h1>
        <p className="text-body-lg text-muted-foreground">
          Nomor Pemesanan <span className="font-mono font-semibold text-foreground">{tampil.nomor}</span>
        </p>
        <p className="text-body text-foreground">
          {tampil.ringkasan} di {tampil.lokasiNama} kini ditahan untuk Anda. Lokasi Mitra akan mengonfirmasi pesanan ini pada hari kerja berikutnya; setelah itu
          Tagihan terbit dan Anda punya 24 jam untuk membayar. Kabar berikutnya kami kirim ke email Anda.
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
          <Link href={`/lokasi/${lokasiId}`} className={buttonVariants({ size: "lg" })}>
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
