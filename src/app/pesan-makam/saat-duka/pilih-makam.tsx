"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronUp, Clock, Flame, MapPin, MessageCircle, MoonStar, Ruler } from "lucide-react";
import { FilterChip } from "@/components/makam/filter-chip";
import { Button } from "@/components/ui/button";
import { agamaDiterima, labelAgama, type Agama } from "@/domain/lokasi/skema-info-kartu";
import { Progress } from "./progress";
import { formatRupiah } from "@/lib/rupiah";
import { cn } from "@/lib/utils";
import { csWhatsAppLink, type CsContact } from "@/components/kode-masuk/state";
import { perKota, saringAgama, type KartuView, type GrupView, type TpuKartuView } from "./tampilan";

export interface PilihMakamProps {
  grup: GrupView[];
  /** The TPU section: only the TPUs taking new plots, each at the TPU price. */
  tpu: TpuKartuView[];
  /** False while DKI TPU is not open in this environment: no TPU section and no type chip (ADR 0006). */
  tpuTerbuka: boolean;
  /** The type chip the combined list is filtered by. */
  jenis: JenisPilihan;
  /** The "Pilih makam" URL to come back to, keeping the deep-linked Lokasi. */
  kembali: string;
  /** The declined order this visit comes from, carried on every URL the screen builds; null on an ordinary visit. */
  dari: string | null;
  /** The banner after a Tolak: the Lokasi Mitra that refused and why, in the closed list's own words; null on an ordinary visit. */
  banner: BannerTolak | null;
  /** The Lokasi Mitra chosen on the grid (or deep linked): the screen opens on its Pilih Tipe Kavling step; null for the grid. */
  preselect: string | null;
  /**
   * The card the screen starts on, which the Pemesanan module chose: the deep
   * linked Lokasi Mitra's cheapest card, else the list's own first one.
   */
  awal: KartuAwal | null;
  csContact: CsContact | null;
}

/** What the Tolak banner says, read off the declined order. */
export interface BannerTolak {
  nomor: string;
  lokasiName: string;
  alasan: string;
}

/** The ids of the card "Pilih makam" starts on, as the Pemesanan module's `kartuAwal` returns it. */
export type KartuAwal = { lokasiId: string; jenisMakamId: string } | null;

/** The type chip over the combined list, as the screen read it off the URL. */
type JenisPilihan = "semua" | "lokasi_mitra" | "tpu_dki";

/** What is selected: one tipe kavling of the chosen Lokasi Mitra, or one TPU of the section. */
type Terpilih = { kind: "lokasi_mitra"; lokasiId: string; kartu: KartuView } | { kind: "tpu_dki"; kartu: TpuKartuView };

/** Every choice on the screen, the way the sticky bar reads its total and its lines. */
interface Baris {
  label: string;
  amount: number;
}

/**
 * "Pilih makam" (rapat Ira, 6 Nov 2026; she chose Opsi A, the grid of big
 * cards): every Lokasi Mitra with a cleared Tersedia unit as a big card with
 * its gate photo, grouped under its city's heading, narrowed by the agama
 * dropdown (dri chose it over the city filter). "Pilih" opens the Lokasi
 * Mitra's own Pilih Tipe Kavling step at its own URL (`?lokasiId=`), so the
 * browser's back button returns to the grid; there the sticky "Total semua
 * biaya" bar expands to the itemised lines and carries the choice on.
 */
export function PilihMakam({ grup, tpu, tpuTerbuka, jenis, kembali, dari, banner, preselect, awal, csContact }: PilihMakamProps) {
  const router = useRouter();
  const dipilih = preselect ? (grup.find((satu) => satu.lokasiId === preselect) ?? null) : null;
  const [terpilih, setTerpilih] = useState<Terpilih | null>(() => pilihanAwal(dipilih, tpu, jenis, awal));
  const [rincianTerbuka, setRincianTerbuka] = useState(false);
  const [agama, setAgama] = useState<Agama | "semua">("semua");
  const total = terpilih?.kartu.total ?? null;
  const rincian: Baris[] = terpilih?.kartu.rincian ?? [];
  const lokasiSaja = jenis === "lokasi_mitra";
  const tampilBar = dipilih !== null || (tpuTerbuka && !lokasiSaja && tpu.length > 0);

  return (
    <div className={cn("mx-auto w-full max-w-6xl px-4 pt-5", tampilBar ? "pb-40" : "pb-16")}>
      <Progress
        langkah={1}
        total={2}
        onBack={() => router.push(dipilih ? urlGrid(dari) : "/")}
        backLabel={dipilih ? "Ganti makam" : "Kembali"}
      />
      {dipilih ? (
        <LangkahKavling
          grup={dipilih}
          terpilih={terpilih}
          onPilih={(kartu) => setTerpilih({ kind: "lokasi_mitra", lokasiId: dipilih.lokasiId, kartu })}
          kembaliKeGrid={urlGrid(dari)}
          csContact={csContact}
        />
      ) : (
        <div className="mt-6 flex flex-col gap-8">
          <div className="rounded-3xl bg-forest px-6 py-8 text-ivory md:px-10 md:py-12">
            <h1 className="font-heading text-4xl font-extrabold leading-tight tracking-tight md:text-6xl">Pilih makam</h1>
            <p className="mt-3 max-w-2xl text-lg text-ivory/85">
              Semua lokasi sudah bermitra dengan Makam.co.id. Hanya makam yang masih tersedia yang ditampilkan, dengan harga lengkap
              sebelum memesan.
            </p>
          </div>

          {banner ? <BannerTolakSaatDuka banner={banner} /> : null}

          {tpuTerbuka ? <JenisFilter jenis={jenis} kembali={kembali} /> : null}

          {!lokasiSaja ? (
            <GridPerKota grup={grup} agama={agama} onAgama={setAgama} dari={dari} csContact={csContact} />
          ) : null}

          {!lokasiSaja && tpuTerbuka ? (
            <TpuSection tpu={tpu} terpilih={terpilih} onPilih={(kartu) => setTerpilih({ kind: "tpu_dki", kartu })} csContact={csContact} />
          ) : null}
        </div>
      )}

      {tampilBar ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card shadow-sticky">
          <div className="mx-auto max-w-3xl px-4">
            {rincianTerbuka && terpilih ? (
              <dl id="rincian-total" className="flex flex-col gap-2 border-b border-border py-4 text-body tabular-nums">
                {rincian.map((baris) => (
                  <div key={baris.label} className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{baris.label}</dt>
                    <dd className="whitespace-nowrap">{formatRupiah(baris.amount)}</dd>
                  </div>
                ))}
                <p className="text-small text-muted-foreground">
                  Belum ada yang dibayar sekarang. Tagihan terbit setelah pemakaman dikonfirmasi.
                </p>
              </dl>
            ) : null}
            <div className="flex items-center gap-3 py-3">
              <button
                type="button"
                disabled={!terpilih}
                onClick={() => setRincianTerbuka((buka) => !buka)}
                aria-expanded={rincianTerbuka}
                aria-controls="rincian-total"
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left disabled:cursor-default"
              >
                <span className="min-w-0">
                  <span className="block text-caption text-muted-foreground">Total semua biaya</span>
                  <span className="block text-title-2 tabular-nums text-foreground" data-testid="total-semua-biaya">
                    {total === null ? "Pilih makam dulu" : formatRupiah(total)}
                  </span>
                </span>
                {terpilih ? (
                  <ChevronUp className={cn("size-5 shrink-0 text-primary transition-transform", !rincianTerbuka && "rotate-180")} aria-hidden />
                ) : null}
                {terpilih ? <span className="sr-only">{rincianTerbuka ? "Sembunyikan rincian" : "Lihat rincian"}</span> : null}
              </button>
              <Button
                size="lg"
                disabled={!terpilih}
                onClick={() => terpilih && router.push(langkahBerikut(terpilih, dari))}
                className="h-12 shrink-0 px-6 text-body-lg"
              >
                Lanjut <ArrowRight aria-hidden />
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** The grid's own URL, keeping a Tolak's `dari` so the banner and the family's data survive "Ganti makam". */
function urlGrid(dari: string | null): string {
  return dari ? `/pesan-makam/saat-duka?dari=${encodeURIComponent(dari)}` : "/pesan-makam/saat-duka";
}

/** A Lokasi Mitra's own Pilih Tipe Kavling step. */
function urlKavling(lokasiId: string, dari: string | null): string {
  const query = new URLSearchParams({ lokasiId });
  if (dari) query.set("dari", dari);
  return `/pesan-makam/saat-duka?${query.toString()}`;
}

/** The agama dropdown and the big cards under their city headings (Opsi A). */
function GridPerKota({
  grup,
  agama,
  onAgama,
  dari,
  csContact,
}: {
  grup: GrupView[];
  agama: Agama | "semua";
  onAgama: (agama: Agama | "semua") => void;
  dari: string | null;
  csContact: CsContact | null;
}) {
  const tersaring = saringAgama(grup, agama);
  return (
    <section className="flex flex-col gap-8" aria-label="Lokasi Mitra">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="filter-agama" className="text-body font-semibold text-foreground">
          Agama
        </label>
        <select
          id="filter-agama"
          value={agama}
          onChange={(event) => onAgama(event.target.value as Agama | "semua")}
          className="h-11 rounded-xl border border-border-strong bg-card px-3 pr-8 text-body text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="semua">Semua agama</option>
          {agamaDiterima.map((satu) => (
            <option key={satu} value={satu}>
              {labelAgama[satu]}
            </option>
          ))}
        </select>
        <span className="text-small text-muted-foreground" aria-live="polite">
          {tersaring.length} lokasi mitra
        </span>
      </div>

      {tersaring.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border-strong p-6 text-center text-body text-muted-foreground">
          {agama === "semua"
            ? "Belum ada makam tersedia saat ini."
            : `Belum ada lokasi mitra untuk agama ${labelAgama[agama]}.`}{" "}
          <CsTanyaCS csContact={csContact} />
        </p>
      ) : (
        perKota(tersaring).map((kelompok) => (
          <section key={kelompok.kota} className="flex flex-col gap-4" aria-labelledby={`kota-${kelompok.kota}`}>
            <h2
              id={`kota-${kelompok.kota}`}
              className="flex items-center gap-3 text-small font-bold uppercase tracking-[0.14em] text-muted-foreground after:h-px after:flex-1 after:bg-border"
            >
              {kelompok.kota}
            </h2>
            <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {kelompok.grup.map((satu) => (
                <KartuBesar key={satu.lokasiId} grup={satu} href={urlKavling(satu.lokasiId, dari)} />
              ))}
            </ul>
          </section>
        ))
      )}
    </section>
  );
}

/** One Lokasi Mitra as a big card: gate photo, name, address, agama and krematorium, description, from-price, "Pilih". */
function KartuBesar({ grup, href }: { grup: GrupView; href: string }) {
  const mulai = Math.min(...grup.pilihan.map((kartu) => kartu.total));
  return (
    <li className="flex">
      <article className="flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-card">
        <FotoGerbang url={grup.photoUrl} nama={grup.lokasiName} />
        <div className="flex flex-1 flex-col gap-3 p-5">
          <div>
            <h3 className="text-xl font-extrabold leading-snug text-foreground">{grup.lokasiName}</h3>
            {grup.alamat ? (
              <p className="mt-1 flex items-start gap-1.5 text-small text-muted-foreground">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                {grup.alamat}
              </p>
            ) : null}
          </div>
          <TagInfo grup={grup} />
          {grup.deskripsi ? <p className="text-body text-foreground">{grup.deskripsi}</p> : null}
          <div className="mt-auto flex items-end justify-between gap-3 pt-2">
            <p className="text-small text-muted-foreground">
              mulai
              <span className="block text-title-2 font-extrabold tabular-nums text-foreground">{formatRupiah(mulai)}</span>
            </p>
            <Link
              href={href}
              aria-label={`Pilih ${grup.lokasiName}`}
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-primary px-5 text-body font-bold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Pilih <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      </article>
    </li>
  );
}

/** The agama it accepts, krematorium and luas lahan, as small tags; nothing for what is not recorded. */
function TagInfo({ grup }: { grup: GrupView }) {
  if (!grup.agamaLabel && !grup.krematorium && !grup.luasLahan) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Info lokasi">
      {grup.agamaLabel ? (
        <li className="rounded-full bg-muted px-3 py-1 text-caption font-semibold text-foreground">{grup.agamaLabel}</li>
      ) : null}
      {grup.krematorium ? (
        <li className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-3 py-1 text-caption font-semibold text-brand">
          <Flame className="size-3.5" aria-hidden />
          Ada krematorium
        </li>
      ) : null}
      {grup.luasLahan ? (
        <li className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-caption font-semibold text-foreground">
          <Ruler className="size-3.5" aria-hidden />
          Luas {grup.luasLahan}
        </li>
      ) : null}
    </ul>
  );
}

/** The gate photo (its Galeri's gerbang photo, else a Kunjungan Verifikasi photo); a plain green panel when it has none. */
function FotoGerbang({ url, nama }: { url: string | null; nama: string }) {
  if (!url) {
    return (
      <div className="flex aspect-[16/10] items-end bg-forest p-3" aria-hidden>
        <span className="rounded-md bg-ivory/20 px-2 py-0.5 text-caption text-ivory">{nama}</span>
      </div>
    );
  }
  return (
    // A short-lived signed URL: plain <img>, next/image cannot cache a URL that expires.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={`Gerbang ${nama}`} className="aspect-[16/10] w-full object-cover" />
  );
}

/**
 * Pilih Tipe Kavling for the Lokasi Mitra chosen on the grid: its card in
 * short, every tipe kavling still tersedia with its size and capacity from
 * the brosur, Masa Hak Pakai, count and all-in price, the confirmation
 * promise once, and the CS on WhatsApp for a stock question only (dri, 6 Nov
 * 2026: the order, the confirmation and the payment stay on the platform).
 */
function LangkahKavling({
  grup,
  terpilih,
  onPilih,
  kembaliKeGrid,
  csContact,
}: {
  grup: GrupView;
  terpilih: Terpilih | null;
  onPilih: (kartu: KartuView) => void;
  kembaliKeGrid: string;
  csContact: CsContact | null;
}) {
  return (
    <div className="mx-auto mt-6 flex max-w-4xl flex-col gap-6">
      <Link href={kembaliKeGrid} className="inline-flex items-center gap-1.5 self-start text-body font-bold text-brand hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> Ganti makam
      </Link>
      <div className="grid overflow-hidden rounded-2xl border border-border bg-card sm:grid-cols-[220px_1fr]">
        <FotoGerbang url={grup.photoUrl} nama={grup.lokasiName} />
        <div className="flex flex-col gap-2 p-5">
          <p className="text-small font-bold uppercase tracking-[0.14em] text-muted-foreground">{grup.kota}</p>
          <p className="text-xl font-extrabold text-foreground">{grup.lokasiName}</p>
          {grup.alamat ? <p className="text-small text-muted-foreground">{grup.alamat}</p> : null}
          <TagInfo grup={grup} />
          <Link href={`/lokasi/${grup.lokasiId}`} className="text-small font-medium text-brand underline-offset-2 hover:underline">
            Lihat fasilitas, jam operasional dan petunjuk arah
          </Link>
        </div>
      </div>

      <div>
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-forest md:text-4xl">Pilih tipe kavling</h1>
        <p className="mt-1 text-body-lg text-muted-foreground">Hanya tipe yang masih tersedia yang ditampilkan.</p>
      </div>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2" role="radiogroup" aria-label={`Tipe kavling di ${grup.lokasiName}`}>
        {grup.pilihan.map((kartu) => (
          <KartuKavling
            key={kartu.jenisMakamId}
            kartu={kartu}
            dipilih={terpilih?.kind === "lokasi_mitra" && terpilih.kartu.jenisMakamId === kartu.jenisMakamId}
            onPilih={onPilih}
          />
        ))}
      </ul>

      <KonfirmasiPromise grup={grup} />

      {csContact ? (
        <a
          href={csWhatsAppLink(csContact, `Halo, saya ingin menanyakan stok kavling di ${grup.lokasiName}.`)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 self-start text-body font-medium text-brand underline underline-offset-4"
        >
          <MessageCircle className="size-4" aria-hidden /> Tanya stok kavling lewat WhatsApp CS
        </a>
      ) : null}
    </div>
  );
}

/** One tipe kavling: its name, size and capacity from the brosur, Masa Hak Pakai, count and all-in price; a radio. */
function KartuKavling({ kartu, dipilih, onPilih }: { kartu: KartuView; dipilih: boolean; onPilih: (kartu: KartuView) => void }) {
  return (
    <li className="flex">
      <button
        type="button"
        role="radio"
        aria-checked={dipilih}
        aria-label={`${kartu.jenisMakamName}, ${formatRupiah(kartu.total)} semua biaya`}
        onClick={() => onPilih(kartu)}
        className={cn(
          "flex w-full flex-col gap-2 rounded-2xl border-2 bg-card p-5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          dipilih ? "border-primary bg-brand-soft" : "border-border hover:bg-accent",
        )}
      >
        <span className="flex items-start justify-between gap-3">
          <span className="text-title-3 font-extrabold text-foreground">{kartu.jenisMakamName}</span>
          <RadioDot dipilih={dipilih} />
        </span>
        {kartu.deskripsi ? <span className="text-body text-foreground">{kartu.deskripsi}</span> : null}
        <span className="text-small text-muted-foreground">
          {kartu.masaHakPakai} · {kartu.tersedia} tersedia
        </span>
        <span className="mt-1 text-title-2 font-extrabold tabular-nums text-foreground">
          {formatRupiah(kartu.total)} <span className="text-caption font-normal text-muted-foreground">semua biaya</span>
        </span>
      </button>
    </li>
  );
}

/**
 * The choice the screen starts on: on a Lokasi Mitra's Pilih Tipe Kavling
 * step, the card the Pemesanan module chose for it, else its cheapest; on the
 * grid with the chip on TPU DKI, the first TPU; otherwise nothing, since a card
 * on the grid is not yet a choice.
 */
function pilihanAwal(dipilih: GrupView | null, tpu: TpuKartuView[], jenis: JenisPilihan, awal: KartuAwal): Terpilih | null {
  if (dipilih) {
    const kartu = dipilih.pilihan.find((satu) => satu.jenisMakamId === awal?.jenisMakamId) ?? dipilih.pilihan[0];
    return kartu ? { kind: "lokasi_mitra", lokasiId: dipilih.lokasiId, kartu } : null;
  }
  if (jenis === "tpu_dki") return tpu[0] ? { kind: "tpu_dki", kartu: tpu[0] } : null;
  return null;
}

/** The next step's URL for a choice: a Lokasi Mitra card's own, a TPU's own submission screen. */
function langkahBerikut(terpilih: Terpilih, dari: string | null): string {
  // After a Tolak, `dari` goes on so the next screen opens with the family's own data: nobody types the same death twice.
  const query = new URLSearchParams(
    terpilih.kind === "tpu_dki" ? { tpuId: terpilih.kartu.tpuId } : { lokasiId: terpilih.lokasiId, jenisMakamId: terpilih.kartu.jenisMakamId },
  );
  if (dari) query.set("dari", dari);
  return `/pesan-makam/saat-duka/${terpilih.kind === "tpu_dki" ? "tpu" : "data"}?${query.toString()}`;
}

/**
 * The banner a family arrives at after a Tolak: the Lokasi Mitra that could not
 * serve them, the reason in the closed list's own words, and the way to rebook. The
 * list under it was read without that Lokasi Mitra, so there is nothing of it here
 * to hide.
 */
function BannerTolakSaatDuka({ banner }: { banner: BannerTolak }) {
  return (
    <div className="rounded-xl border border-border bg-warning-soft p-5 text-body text-warning-soft-foreground" data-testid="banner-pemesan-ulang" role="status">
      <p className="font-semibold">
        {banner.lokasiName} belum bisa melayani pesanan {banner.nomor}.
      </p>
      <p className="mt-1">Alasannya: {banner.alasan}.</p>
      <p className="mt-1">
        Pilih makam lain di bawah. Data keluarga dan almarhum sudah terisi, dan {banner.lokasiName} tidak lagi muncul di daftar
        ini. Tim kami juga menelepon maksimal 2 jam.
      </p>
    </div>
  );
}

/**
 * The type chip (spec, story 19): Semua / Lokasi Mitra / TPU DKI over the
 * combined list. It is a plain link with the city's own filter kept in the URL,
 * so choosing a type changes the list and nothing else — no cookie, no data.
 */
function JenisFilter({ jenis, kembali }: { jenis: JenisPilihan; kembali: string }) {
  const pilihan: [JenisPilihan, string][] = [
    ["semua", "Semua"],
    ["lokasi_mitra", "Lokasi Mitra"],
    ["tpu_dki", "TPU DKI"],
  ];
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Jenis makam">
      {pilihan.map(([value, label]) => (
        <FilterChip key={value} href={hrefJenis(value, kembali)} selected={jenis === value} scroll={false}>
          {label}
        </FilterChip>
      ))}
    </div>
  );
}

/** One chip's own URL: the screen it came back to, with the type and the city filter it already had. */
function hrefJenis(value: JenisPilihan, kembali: string): string {
  const asal = new URLSearchParams(kembali.split("?")[1] ?? "");
  if (value === "semua") asal.delete("jenis");
  else asal.set("jenis", value);
  const query = asal.toString();
  return query === "" ? "/pesan-makam/saat-duka" : `/pesan-makam/saat-duka?${query}`;
}

/**
 * The TPU section (spec, story 19): the TPUs below the Lokasi Mitra cards,
 * "dimakamkan lewat Pengurusan". Only a TPU taking new plots is on the list, so
 * there is nothing to say about availability; every card carries the same TPU
 * price, and outside the 06:00–18:00 window the section says once that a
 * submission still goes through and CS answers, at the hours Pengaturan Operator
 * keeps.
 */
function TpuSection({
  tpu,
  terpilih,
  onPilih,
  csContact,
}: {
  tpu: TpuKartuView[];
  terpilih: Terpilih | null;
  onPilih: (kartu: TpuKartuView) => void;
  csContact: CsContact | null;
}) {
  if (tpu.length === 0) {
    return (
      <section className="flex flex-col gap-3" aria-labelledby="tpu-judul">
        <h2 id="tpu-judul" className="text-title-3 text-foreground">
          TPU DKI
        </h2>
        <p className="rounded-2xl border border-dashed border-border-strong p-6 text-center text-body text-muted-foreground">
          Belum ada TPU DKI yang menerima makam baru di kota ini.{" "}
          <Link href="/pengurusan-tpu" className="font-medium text-brand underline underline-offset-4">
            Lihat cara mengurus IPTM sendiri, gratis
          </Link>
        </p>
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-3" aria-labelledby="tpu-judul">
      <div>
        <h2 id="tpu-judul" className="text-title-3 text-foreground">
          TPU DKI
        </h2>
        <p className="text-small text-muted-foreground">
          Dimakamkan lewat Pengurusan: kami siapkan pemakamannya bersama TPU, lalu mengurus IPTM-nya. Biaya Pengurusan adalah
          biaya jasa kami; Retribusi Pemda ditampilkan terpisah.
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card" role="radiogroup" aria-label="TPU DKI">
        {tpu.map((kartu) => (
          <KartuTpu
            key={kartu.tpuId}
            kartu={kartu}
            dipilih={terpilih?.kind === "tpu_dki" && terpilih.kartu.tpuId === kartu.tpuId}
            onPilih={onPilih}
          />
        ))}
      </ul>
      {tpu[0].bukaSekarang ? null : (
        <p className="flex items-start gap-2 text-small text-muted-foreground">
          <MoonStar className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Di luar jam layanan TPU (pukul 06.00–18.00), pengajuan tetap bisa dikirim dan kami konfirmasi begitu jam layanan
            buka. <CsTanyaCS csContact={csContact} />
          </span>
        </p>
      )}
    </section>
  );
}

/** The radio dot every selectable row ends with, filled and checked once chosen. */
function RadioDot({ dipilih, className }: { dipilih: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full border-2",
        dipilih ? "border-primary bg-primary text-primary-foreground" : "border-border-strong",
        className,
      )}
      aria-hidden
    >
      {dipilih ? <Check className="size-3.5" /> : null}
    </span>
  );
}

/** One TPU: its name, where it is, what the burial costs all-in, and when it will be confirmed. */
function KartuTpu({ kartu, dipilih, onPilih }: { kartu: TpuKartuView; dipilih: boolean; onPilih: (kartu: TpuKartuView) => void }) {
  return (
    <li>
      <button
        type="button"
        role="radio"
        aria-checked={dipilih}
        onClick={() => onPilih(kartu)}
        className={cn(
          "flex w-full items-start gap-3 px-4 py-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          dipilih ? "bg-brand-soft" : "hover:bg-accent",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="block text-body font-semibold text-foreground">{kartu.tpuName}</span>
            <span className="shrink-0 text-body-lg font-semibold tabular-nums text-foreground">{formatRupiah(kartu.total)}</span>
          </span>
          <span className="mt-0.5 block text-small text-muted-foreground">{kartu.kota}</span>
          <span className="mt-0.5 block text-small text-muted-foreground">{kartu.alamat}</span>
          <span className="mt-1.5 flex items-start gap-2 text-small text-muted-foreground">
            <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
            {kartu.konfirmasi}
          </span>
        </span>
        <RadioDot dipilih={dipilih} className="mt-0.5" />
      </button>
    </li>
  );
}

/**
 * Said once per Lokasi Mitra: inside Jam Operasional, when it will confirm;
 * outside it, the same deadline plus the Kontak Siaga to phone for a burial
 * that cannot wait.
 */
function KonfirmasiPromise({ grup }: { grup: GrupView }) {
  if (grup.bukaSekarang) {
    return (
      <p className="flex items-start gap-2 text-small text-muted-foreground">
        <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
        {grup.konfirmasi}
      </p>
    );
  }
  return (
    <div className="rounded-xl bg-warning-soft px-3 py-2.5 text-small text-warning-soft-foreground" data-testid="di luar jam operasional">
      <p className="flex items-start gap-2">
        <MoonStar className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          Sekarang di luar Jam Operasional Lokasi Mitra ini. <strong className="font-semibold">{grup.konfirmasi}</strong>
        </span>
      </p>
      {grup.kontakSiaga ? (
        <p className="mt-1 pl-6">
          Perlu lebih cepat? Kontak Siaga: {grup.kontakSiaga.nama ? `${grup.kontakSiaga.nama}, ` : ""}
          <a href={`tel:${grup.kontakSiaga.telepon}`} className="font-semibold underline underline-offset-2">
            {grup.kontakSiaga.telepon}
          </a>
        </p>
      ) : null}
    </div>
  );
}

/** "Tanya CS": the wa.me link to the CS number from Pengaturan Operator. */
function CsTanyaCS({ csContact }: { csContact: CsContact | null }) {
  if (!csContact) return <>Tanya CS lewat nomor yang tampil di halaman Hubungi Kami.</>;
  return (
    <a href={csWhatsAppLink(csContact)} target="_blank" rel="noopener noreferrer" className="font-medium text-brand underline underline-offset-4">
      Tanya CS
    </a>
  );
}
