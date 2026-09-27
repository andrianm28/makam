import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AllInPrice } from "@/domain/tariffs";
import { formatTanggalPanjang } from "@/lib/format-tanggal";
import { directionsUrl, embedMapUrl, mapsQueryFor } from "@/lib/maps";
import { formatRupiah } from "@/lib/rupiah";
import { serverRuntime } from "@/server/runtime";

export async function generateMetadata({ params }: PageProps<"/tpu/[tpuId]">) {
  const { tpuId } = await params;
  const tpu = await serverRuntime().lokasi.publicTpuDki(tpuId);
  return { title: tpu ? `${tpu.name} — Makam.co.id` : "TPU tidak ditemukan — Makam.co.id" };
}

/** One price the TPU page shows: the amount, when it applies, and when it changes. */
function PriceBox({ label, description, price }: { label: string; description: string; price: AllInPrice | null }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-body font-medium">{label}</span>
        <span className="text-lg font-semibold">{price ? formatRupiah(price.total) : "Belum tersedia"}</span>
      </div>
      <p className="text-small text-muted-foreground">{description}</p>
      {price ? <p className="text-small text-muted-foreground">Harga berlaku sejak {formatTanggalPanjang(price.inForceSince)}</p> : null}
      {price?.scheduledChange ? (
        <p className="text-small text-muted-foreground">
          Harga baru {formatRupiah(price.scheduledChange.total)} mulai {formatTanggalPanjang(price.scheduledChange.effectiveOn)}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The public TPU page (ticket 43): a TPU is a government cemetery, so the page
 * says exactly that instead of the Lokasi Mitra's "Terverifikasi", and it leads
 * with the one fact a family needs before choosing it — whether the TPU takes
 * new plots, and when that was last checked.
 */
export default async function TpuPage({ params }: PageProps<"/tpu/[tpuId]">) {
  const { tpuId } = await params;
  const { lokasi, tariffs, adapters } = serverRuntime();
  const tpu = await lokasi.publicTpuDki(tpuId);
  if (!tpu) notFound();

  const pricing = await tariffs.tpuPricing(adapters.clock.now());
  const mapsQuery = mapsQueryFor(tpu);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-3">
        <p className="text-small text-sage-strong">TPU resmi Pemerintah Provinsi DKI Jakarta</p>
        <h1 className="text-2xl font-semibold tracking-tight">{tpu.name}</h1>
        <p className="text-muted-foreground">{tpu.address}</p>
        <p className="text-body">
          <span className="font-medium">{tpu.newPlot ? "Menerima makam baru" : "Tidak menerima makam baru"}</span>{" "}
          <span className="text-muted-foreground">· diperbarui {formatTanggalPanjang(tpu.flagUpdatedOn)}</span>
        </p>
        {mapsQuery ? (
          <a
            href={directionsUrl(mapsQuery)}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-brand underline underline-offset-4"
          >
            Petunjuk arah
          </a>
        ) : null}
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/pengurusan-tpu" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Urus di TPU DKI
          </Link>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Harga</CardTitle>
          <CardDescription>
            Biaya Pengurusan adalah biaya jasa Makam.co.id untuk mengurus berkas Anda, bukan biaya pemerintah. Retribusi
            Pemda ditampilkan sebagai baris tersendiri, Rp 0 di tempat pemerintah daerah tidak memungut biaya.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <PriceBox
            label="Biaya Pengurusan (mengatur pemakaman)"
            description="Kami menyiapkan pemakamannya bersama TPU, lalu mengurus IPTM-nya untuk Anda."
            price={pricing.pengurusanPemakaman}
          />
          <PriceBox
            label="Biaya Pengurusan (hanya berkas)"
            description="Keluarga sudah memakamkan sendiri di TPU ini; kami mengurus IPTM-nya saja."
            price={pricing.pengurusanBerkas}
          />
          <PriceBox
            label="Retribusi Pemda (IPTM)"
            description="Diteruskan apa adanya ke pemerintah daerah, sebagai barisnya sendiri."
            price={pricing.retribusiIptm}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Izin IPTM gratis; yang kami kenai adalah biaya untuk kami bekerja</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-body">
          <p>
            Izin Penggunaan Tanah Makam (IPTM) adalah izin dari pemerintah daerah, dan pendaftaran makam di TPU pun gratis.
            Anda juga bisa mengurus izin itu sendiri, tanpa biaya apa pun.
          </p>
          <p className="text-muted-foreground">
            Yang kami kenai adalah waktu dan pengalaman kami mengurus berkas: surat pengantar, pengajuan di JakEVO atau PTSP,
            sampai IPTM benar-benar terbit.
          </p>
          <Link href="/pengurusan-tpu" className="text-brand underline underline-offset-4">
            Cara mengurus IPTM sendiri, gratis
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data TPU ini</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-body">
          <p>
            <span className="text-muted-foreground">Kota / kabupaten: </span>
            {tpu.city}
          </p>
          <p>
            <span className="text-muted-foreground">Sumber data: </span>
            {tpu.dataSource}
          </p>
          <p className="text-small text-muted-foreground">
            Status makam baru terakhir diperiksa pada {formatTanggalPanjang(tpu.flagUpdatedOn)}. Makam.co.id tidak mengelola TPU:
            petak dan kelolanya milik pemerintah daerah, jadi tidak ada Hak Pakai yang kami pegang di sini.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lokasi dan petunjuk arah</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {mapsQuery ? (
            <iframe
              src={embedMapUrl(mapsQuery)}
              loading="lazy"
              title={`Peta ${tpu.name}`}
              className="h-64 w-full rounded-lg border border-border"
            />
          ) : null}
          <p className="text-body">{tpu.address}</p>
          {mapsQuery ? (
            <a
              href={directionsUrl(mapsQuery)}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-brand underline underline-offset-4"
            >
              Petunjuk arah
            </a>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
