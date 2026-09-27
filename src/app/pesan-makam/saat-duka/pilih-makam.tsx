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
import type { KartuView, GrupView } from "./tampilan";
import type { RebookPesanan } from "@/domain/pemesanan";

export interface PilihMakamProps {
  grup: GrupView[];
  /** Every city with a Terverifikasi Lokasi Mitra, for the filter. */
  semuaKota: string[];
  /** The city the list is filtered to; null is "Semua kota". */
  kota: string | null;
  /** The "Pilih makam" URL to come back to, keeping the deep-linked Lokasi. */
  kembali: string;
  /**
   * The declined order this visit comes from (spec, Public site: "After a Tolak,
   * the Pilih makam list opens with a banner, the rejecting Lokasi removed and the
   * family's data prefilled"). null on an ordinary visit.
   */
  pemesanUlang: RebookPesanan | null;
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

/**
 * "Pilih makam": every Lokasi Mitra that still has a Jenis Makam with a cleared
 * Tersedia unit, cheapest all-in total first, one decision per card, and the
 * sticky "Total semua biaya" bar that expands to the itemised lines. The
 * selected card carries on to "Data & kirim" in its URL, so the browser's back
 * button returns to the same choice.
 */
export function PilihMakam({ grup, semuaKota, kota, kembali, preselect, awal, csContact, pemesanUlang }: PilihMakamProps) {
  const router = useRouter();
  const [terpilih, setTerpilih] = useState<{ lokasiId: string; kartu: KartuView } | null>(() => kartuAwalDari(grup, awal));
  const [rincianTerbuka, setRincianTerbuka] = useState(false);
  const total = terpilih?.kartu.total ?? null;

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
          <h1 className="text-title-1 text-foreground">Pilih makam</h1>
          <p className="mt-1 text-body-lg text-muted-foreground">
            Diurutkan dari total biaya terendah. Hanya makam yang masih tersedia yang ditampilkan.
          </p>
        </div>

        {pemesanUlang ? <BannerPemesanUlang pemesanUlang={pemesanUlang} /> : null}

        <KotaFilter semuaKota={semuaKota} kota={kota} kembali={kembali} />

        {grup.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-strong p-6 text-center text-body text-muted-foreground">
            Belum ada makam tersedia di kota ini. Coba kota lain, atau tanyakan kepada CS kami.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {grup.map((satu) => (
              <GrupKartu
                key={satu.lokasiId}
                grup={satu}
                terpilih={terpilih}
                onPilih={(kartu) => setTerpilih({ lokasiId: satu.lokasiId, kartu })}
              />
            ))}
          </ul>
        )}

        <p className="text-small text-muted-foreground">
          Pemakaman di TPU DKI lewat Pengurusan segera hadir. Sementara ini, CS kami bisa membantu mengarahkan.{" "}
          <CsTanyaCS csContact={csContact} />
        </p>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card shadow-lg">
        <div className="mx-auto max-w-3xl px-4">
          {rincianTerbuka && terpilih ? (
            <dl id="rincian-total" className="flex flex-col gap-2 border-b border-border py-4 text-body tabular-nums">
              {terpilih.kartu.rincian.map((baris) => (
                <div key={baris.label} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{baris.label}</dt>
                  <dd className="whitespace-nowrap">{formatRupiah(baris.amount)}</dd>
                </div>
              ))}
              <p className="text-small text-muted-foreground">
                Belum ada yang dibayar sekarang. Tagihan terbit setelah Lokasi Mitra mengonfirmasi.
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
              onClick={() => router.push(`${dataPath(terpilih!.lokasiId, terpilih!.kartu.jenisMakamId, pemesanUlang)}`)}
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

/**
 * "Data & kirim" next, carrying `dari` on so the data it opens with is the family's
 * own: the rebook's whole point is that nobody types the same death twice.
 */
function dataPath(lokasiId: string, jenisMakamId: string, pemesanUlang: RebookPesanan | null): string {
  const query = new URLSearchParams({ lokasiId, jenisMakamId });
  if (pemesanUlang) query.set("dari", pemesanUlang.nomor);
  return `/pesan-makam/saat-duka/data?${query.toString()}`;
}

/**
 * The banner a family arrives at after a Tolak: the Lokasi Mitra that could not
 * serve them, in its own words, and the promise that somebody phones. The card
 * they are sent to is another Lokasi Mitra's — the list behind this banner was
 * read without the one named here, so there is nothing of it here to hide.
 */
function BannerPemesanUlang({ pemesanUlang }: { pemesanUlang: RebookPesanan }) {
  return (
    <div className="rounded-xl border border-border bg-warning-soft p-5 text-body text-warning-soft-foreground" data-testid="banner-pemesan-ulang">
      <p className="font-semibold">
        {pemesanUlang.banner.lokasi.name} belum bisa melayani pesanan {pemesanUlang.nomor}.
      </p>
      <p className="mt-1">Alasannya: {pemesanUlang.banner.alasan}.</p>
      <p className="mt-1">
        Pilih makam lain di bawah. Data keluarga dan almarhum sudah terisi, dan {pemesanUlang.banner.lokasi.name} tidak lagi
        muncul di daftar ini. Tim kami juga menelepon maksimal 2 jam.
      </p>
    </div>
  );
}

/** The chosen card as the screen holds it: the group it is in, and the card itself. */
function kartuAwalDari(grup: GrupView[], awal: KartuAwal) {
  const group = grup.find((satu) => satu.lokasiId === awal?.lokasiId);
  const kartu = group?.pilihan.find((satu) => satu.jenisMakamId === awal?.jenisMakamId);
  return group && kartu ? { lokasiId: group.lokasiId, kartu } : null;
}

/** "Semua kota" and every city, as one filter: each a form that remembers the choice for the next visit. */
function KotaFilter({ semuaKota, kota, kembali }: { semuaKota: string[]; kota: string | null; kembali: string }) {
  const pilihan = [null, ...semuaKota];
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Kota">
      {pilihan.map((satu) => (
        <form key={satu ?? "semua"} action={ingatKota}>
          <input type="hidden" name="kota" value={satu ?? ""} />
          <input type="hidden" name="kembali" value={kembali} />
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

/** One Lokasi Mitra: its promise said once, then each of its Jenis Makam with a Tersedia unit. */
function GrupKartu({
  grup,
  terpilih,
  onPilih,
}: {
  grup: GrupView;
  terpilih: { lokasiId: string; kartu: KartuView } | null;
  onPilih: (kartu: KartuView) => void;
}) {
  return (
    <li>
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="min-w-0">
            <p className="text-title-3 text-foreground">{grup.lokasiName}</p>
            <p className="text-small text-muted-foreground">
              {grup.kota} · {grup.pilihan.length} Jenis Makam tersedia
            </p>
          </div>
          <Link href={`/lokasi/${grup.lokasiId}`} className="text-small font-medium text-brand underline underline-offset-4">
            Lihat lokasi
          </Link>
        </div>

        <KonfirmasiPromise grup={grup} />

        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border" role="radiogroup" aria-label={`Jenis Makam di ${grup.lokasiName}`}>
          {grup.pilihan.map((kartu) => (
            <KartuJenis key={kartu.jenisMakamId} kartu={kartu} dipilih={terpilih?.kartu.jenisMakamId === kartu.jenisMakamId} onPilih={onPilih} />
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
    <div className="rounded-lg bg-warning-soft px-3 py-2.5 text-small text-warning-soft-foreground" data-testid="di luar jam operasional">
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
