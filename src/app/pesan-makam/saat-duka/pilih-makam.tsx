"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Check, ChevronUp, Clock, MoonStar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "./progress";
import { ingatKota } from "./actions";
import { formatRupiah } from "@/lib/rupiah";
import { cn } from "@/lib/utils";
import { csWhatsAppLink, type CsContact } from "@/components/kode-masuk/state";
import type { KartuView, GrupView, TpuKartuView } from "./tampilan";

export interface PilihMakamProps {
  grup: GrupView[];
  /** The TPU section: only the TPUs taking new plots, each at the TPU price. */
  tpu: TpuKartuView[];
  /** Every city with a Terverifikasi Lokasi Mitra, for the filter. */
  semuaKota: string[];
  /** The city the list is filtered to; null is "Semua kota". */
  kota: string | null;
  /** The type chip the combined list is filtered by. */
  jenis: JenisPilihan;
  /** The "Pilih makam" URL to come back to, keeping the deep-linked Lokasi. */
  kembali: string;
  /** The Lokasi Mitra the visitor came from; null when the list decides alone. */
  preselect: string | null;
  /**
   * The card the screen starts on, which the Pemesanan module chose: the deep
   * linked Lokasi Mitra's cheapest card, else the list's own first one.
   */
  awal: KartuAwal | null;
  csContact: CsContact | null;
}

/** The ids of the card "Pilih makam" starts on, as the Pemesanan module's `kartuAwal` returns it. */
export type KartuAwal = { lokasiId: string; jenisMakamId: string } | null;

/** The type chip over the combined list, as the screen read it off the URL. */
type JenisPilihan = "semua" | "lokasi_mitra" | "tpu_dki";

/** What is selected: one Lokasi Mitra card, or one TPU of the section. */
type Terpilih = { kind: "lokasi_mitra"; lokasiId: string; kartu: KartuView } | { kind: "tpu_dki"; kartu: TpuKartuView };

/** Every choice on the screen, the way the sticky bar reads its total and its lines. */
interface Baris {
  label: string;
  amount: number;
}

/**
 * "Pilih makam": every Lokasi Mitra that still has a Jenis Makam with a cleared
 * Tersedia unit, cheapest all-in total first, then the TPU section below
 * (spec, story 19), with the type chip over the combined list and the sticky
 * "Total semua biaya" bar that expands to the itemised lines. The selected card
 * carries on to the next step in its own URL, so the browser's back button
 * returns to the same choice.
 */
export function PilihMakam({ grup, tpu, semuaKota, kota, jenis, kembali, preselect, awal, csContact }: PilihMakamProps) {
  const router = useRouter();
  const [terpilih, setTerpilih] = useState<Terpilih | null>(() => pilihanAwal(grup, tpu, jenis, awal));
  const [rincianTerbuka, setRincianTerbuka] = useState(false);
  const total = terpilih?.kartu.total ?? null;
  const rincian: Baris[] = terpilih?.kartu.rincian ?? [];
  const lokasiSaja = jenis === "lokasi_mitra";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-5 pb-40">
      <Progress
        langkah={1}
        total={2}
        onBack={() => router.push(preselect ? `/lokasi/${preselect}` : "/")}
        backLabel="Kembali"
      />
      <div className="mt-6 flex flex-col gap-6">
        <div>
          <h1 className="text-title-1 text-forest md:text-3xl md:leading-tight">Pilih makam</h1>
          <p className="mt-1 text-body-lg text-muted-foreground">
            Diurutkan dari total biaya terendah. Hanya makam yang masih tersedia yang ditampilkan.
          </p>
        </div>

        <JenisFilter jenis={jenis} kembali={kembali} kota={kota} />

        <KotaFilter semuaKota={semuaKota} kota={kota} kembali={kembali} jenis={jenis} />

        {!lokasiSaja ? (
          grup.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border-strong p-6 text-center text-body text-muted-foreground">
              Belum ada makam tersedia di kota ini. Coba kota lain, atau tanyakan kepada CS kami.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {grup.map((satu) => (
                <GrupKartu
                  key={satu.lokasiId}
                  grup={satu}
                  terpilih={terpilih}
                  onPilih={(kartu) => setTerpilih({ kind: "lokasi_mitra", lokasiId: satu.lokasiId, kartu })}
                />
              ))}
            </ul>
          )
        ) : null}

        {!lokasiSaja ? (
          <TpuSection tpu={tpu} terpilih={terpilih} onPilih={(kartu) => setTerpilih({ kind: "tpu_dki", kartu })} csContact={csContact} />
        ) : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card shadow-[0_-8px_24px_-12px] shadow-forest/20">
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
              onClick={() => terpilih && router.push(langkahBerikut(terpilih))}
              className="h-12 shrink-0 px-6 text-body-lg"
            >
              Lanjut <ArrowRight aria-hidden />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The next step's URL for a choice: a Lokasi Mitra card's own, a TPU's own submission screen. */
function langkahBerikut(terpilih: Terpilih): string {
  return terpilih.kind === "tpu_dki"
    ? `/pesan-makam/saat-duka/tpu?tpuId=${encodeURIComponent(terpilih.kartu.tpuId)}`
    : `/pesan-makam/saat-duka/data?lokasiId=${encodeURIComponent(terpilih.lokasiId)}&jenisMakamId=${encodeURIComponent(terpilih.kartu.jenisMakamId)}`;
}

/**
 * The card the screen starts on: a Lokasi Mitra card when the list offers one and
 * the chip has not narrowed the list to the TPUs, else the first TPU. A visitor
 * who filtered to TPU DKI is offered a TPU, never a Lokasi Mitra card they
 * cannot see.
 */
function pilihanAwal(grup: GrupView[], tpu: TpuKartuView[], jenis: JenisPilihan, awal: KartuAwal): Terpilih | null {
  if (jenis === "tpu_dki") return tpu[0] ? { kind: "tpu_dki", kartu: tpu[0] } : null;
  const group = grup.find((satu) => satu.lokasiId === awal?.lokasiId) ?? grup[0];
  const kartu = group?.pilihan.find((satu) => satu.jenisMakamId === awal?.jenisMakamId) ?? group?.pilihan[0];
  return group && kartu ? { kind: "lokasi_mitra", lokasiId: group.lokasiId, kartu } : null;
}

/**
 * The type chip (spec, story 19): Semua / Lokasi Mitra / TPU DKI over the
 * combined list. It is a plain link with the city's own filter kept in the URL,
 * so choosing a type changes the list and nothing else — no cookie, no data.
 */
function JenisFilter({ jenis, kembali, kota }: { jenis: JenisPilihan; kembali: string; kota: string | null }) {
  const pilihan: [JenisPilihan, string][] = [
    ["semua", "Semua"],
    ["lokasi_mitra", "Lokasi Mitra"],
    ["tpu_dki", "TPU DKI"],
  ];
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Jenis makam">
      {pilihan.map(([value, label]) => (
        <Link key={value} href={hrefJenis(value, kembali, kota)} scroll={false} aria-current={jenis === value ? "true" : undefined}>
          <Button
            variant={jenis === value ? "default" : "outline"}
            tabIndex={jenis === value ? 0 : -1}
            className={cn("h-10 rounded-full px-4", jenis === value ? "" : "bg-card hover:bg-accent")}
          >
            {jenis === value ? <Check aria-hidden /> : null}
            {label}
          </Button>
        </Link>
      ))}
    </div>
  );
}

/** One chip's own URL: the screen it came back to, with the type and the city filter it already had. */
function hrefJenis(value: JenisPilihan, kembali: string, kota: string | null): string {
  const asal = new URLSearchParams(kembali.split("?")[1] ?? "");
  if (value === "semua") asal.delete("jenis");
  else asal.set("jenis", value);
  if (kota) asal.set("kota", kota);
  const query = asal.toString();
  return query === "" ? "/pesan-makam/saat-duka" : `/pesan-makam/saat-duka?${query}`;
}

/** "Semua kota" and every city, as one filter: each a form that remembers the choice for the next visit. */
function KotaFilter({ semuaKota, kota, kembali, jenis }: { semuaKota: string[]; kota: string | null; kembali: string; jenis: JenisPilihan }) {
  const pilihan = [null, ...semuaKota];
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Kota">
      {pilihan.map((satu) => (
        <form key={satu ?? "semua"} action={ingatKota}>
          <input type="hidden" name="kota" value={satu ?? ""} />
          <input type="hidden" name="kembali" value={kembali} />
          <input type="hidden" name="jenis" value={jenis} />
          <Button
            type="submit"
            variant={kota === satu ? "default" : "outline"}
            className={cn("h-10 rounded-full px-4", kota === satu ? "" : "bg-card hover:bg-accent")}
          >
            {kota === satu ? <Check aria-hidden /> : null}
            {satu ?? "Semua kota"}
          </Button>
        </form>
      ))}
    </div>
  );
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
        <span
          className={cn(
            "mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border-2",
            dipilih ? "border-primary bg-primary text-primary-foreground" : "border-border-strong",
          )}
          aria-hidden
        >
          {dipilih ? <Check className="size-3.5" /> : null}
        </span>
      </button>
    </li>
  );
}

/** One Lokasi Mitra: its photo, its promise said once, then each of its Jenis Makam with a Tersedia unit. */
function GrupKartu({
  grup,
  terpilih,
  onPilih,
}: {
  grup: GrupView;
  terpilih: Terpilih | null;
  onPilih: (kartu: KartuView) => void;
}) {
  const adaTerpilih = terpilih?.kind === "lokasi_mitra" && terpilih.lokasiId === grup.lokasiId;
  return (
    <li>
      <div
        className={cn(
          "flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:p-5",
          adaTerpilih ? "border-primary ring-1 ring-primary" : "border-border",
        )}
      >
        <div className="flex gap-4">
          {grup.photoUrl ? (
            // Kunjungan Verifikasi photo, a short-lived signed URL: plain <img>, next/image cannot cache a URL that expires.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={grup.photoUrl} alt="" className="size-16 shrink-0 rounded-xl object-cover sm:size-20" />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-title-3 text-foreground">{grup.lokasiName}</p>
            <p className="text-small text-muted-foreground">
              {grup.kota} · {grup.pilihan.length} Jenis Makam tersedia
            </p>
            <Link href={`/lokasi/${grup.lokasiId}`} className="mt-1 inline-block text-small font-medium text-brand underline-offset-2 hover:underline">
              Lihat lokasi
            </Link>
          </div>
        </div>

        <KonfirmasiPromise grup={grup} />

        <ul
          className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border"
          role="radiogroup"
          aria-label={`Jenis Makam di ${grup.lokasiName}`}
        >
          {grup.pilihan.map((kartu) => (
            <KartuJenis
              key={kartu.jenisMakamId}
              kartu={kartu}
              dipilih={terpilih?.kind === "lokasi_mitra" && terpilih.kartu.jenisMakamId === kartu.jenisMakamId}
              onPilih={onPilih}
            />
          ))}
        </ul>
      </div>
    </li>
  );
}

/** One Jenis Makam card: the all-in total and the Tersedia count, selectable by keyboard as well as by tap. */
function KartuJenis({ kartu, dipilih, onPilih }: { kartu: KartuView; dipilih: boolean; onPilih: (kartu: KartuView) => void }) {
  return (
    <li>
      <button
        type="button"
        role="radio"
        aria-checked={dipilih}
        onClick={() => onPilih(kartu)}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-4",
          dipilih ? "bg-brand-soft" : "hover:bg-accent",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-body font-semibold text-foreground">{kartu.jenisMakamName}</span>
          <span className="block text-small text-muted-foreground">
            {kartu.masaHakPakai} · {kartu.tersedia} tersedia
          </span>
        </span>
        <span className="text-right">
          <span className="block text-body-lg font-semibold tabular-nums text-foreground">{formatRupiah(kartu.total)}</span>
          <span className="block text-caption text-muted-foreground">semua biaya</span>
        </span>
        <span
          className={cn(
            "inline-flex size-6 shrink-0 items-center justify-center rounded-full border-2",
            dipilih ? "border-primary bg-primary text-primary-foreground" : "border-border-strong",
          )}
          aria-hidden
        >
          {dipilih ? <Check className="size-3.5" /> : null}
        </span>
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
