import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { csWhatsAppLink, type CsContact } from "@/components/kode-masuk/state";
import type { AllInPrice } from "@/domain/tariffs";
import { formatTanggalPanjang } from "@/lib/format-tanggal";
import { formatRupiah } from "@/lib/rupiah";
import { serverRuntime } from "@/server/runtime";

export const metadata: Metadata = {
  title: "Pengurusan di TPU DKI — Makam.co.id",
  description: "Cara mengurus IPTM di TPU DKI sendiri secara gratis, dan berapa biaya jasanya bila kami yang menguruskan.",
};

/** The three steps a family can take on its own, in order (spec, content pages). */
const langkahSendiri: { judul: string; isi: string }[] = [
  {
    judul: "Ke TPU pada hari pemakaman",
    isi: "Petak dan jam kerjanya diurus langsung dengan petugas TPU. Tidak ada biaya Makam.co.id pada langkah ini.",
  },
  {
    judul: "Ambil surat pengantar",
    isi: "Surat pengantar dari kelurahan atau RT/RW, yang menjadi dasar pengajuan izin ini.",
  },
  {
    judul: "Ajukan izin di JakEVO atau PTSP",
    isi: "Pengajuan dilakukan sendiri, dan gratis. Izin yang terbit adalah IPTM.",
  },
];

function PriceRow({ label, price }: { label: string; price: AllInPrice | null }) {
  return (
    <li className="flex items-baseline justify-between gap-2 py-1">
      <span>{label}</span>
      <span className="font-medium">{price ? formatRupiah(price.total) : "Belum tersedia"}</span>
    </li>
  );
}

/**
 * "Pengurusan di TPU DKI" (spec, content pages): the free DIY guide first, then
 * what our help costs, then the three ways in. Saat Duka at a TPU is the wizard's
 * own TPU section (ticket 44), so that entry opens it; Perpanjangan TPU and
 * filing-only Pengurusan IPTM (tickets 48 and 47) each say they are not open yet
 * instead of linking nowhere.
 */
export default async function PengurusanTpuPage() {
  await connection(); // the prices come from the database, so this page is never prerendered
  const { tariffs, adapters, operatorSettings } = serverRuntime();
  const [pricing, settings] = await Promise.all([tariffs.tpuPricing(adapters.clock.now()), operatorSettings.current()]);
  const cs: CsContact | null = settings ? { whatsApp: settings.csWhatsApp, replyHours: settings.csReplyHours } : null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Pengurusan di TPU DKI</h1>
        <p className="text-body text-muted-foreground">
          Izin Penggunaan Tanah Makam (IPTM) adalah izin dari pemerintah daerah, dan Anda bisa mengurusnya sendiri secara
          gratis. Kami membantu kalau Anda ingin berkas itu dikerjakan oleh orang yang sudah terbiasa.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Mengurus sendiri, gratis</CardTitle>
          <CardDescription>Tiga langkah ini tidak dipungut biaya apa pun.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="flex list-decimal flex-col gap-3 pl-5 text-body">
            {langkahSendiri.map((step) => (
              <li key={step.judul}>
                <span className="font-medium">{step.judul}</span>
                <p className="text-muted-foreground">{step.isi}</p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kalau kami yang menguruskan</CardTitle>
          <CardDescription>
            Biaya Pengurusan adalah biaya jasa kami, bukan biaya pemerintah. Pesan di TPU tidak pernah memakai Biaya Layanan
            Platform.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-body">
          <ul className="flex flex-col divide-y">
            <PriceRow label="Mengatur pemakaman, lalu mengurus IPTM" price={pricing.pengurusanPemakaman} />
            <PriceRow label="Hanya mengurus IPTM (keluarga sudah memakamkan sendiri)" price={pricing.pengurusanBerkas} />
            <PriceRow label="Retribusi Pemda (IPTM)" price={pricing.retribusiIptm} />
          </ul>
          {pricing.pengurusanPemakaman ? (
            <p className="text-small text-muted-foreground">
              Harga ini berlaku sejak {formatTanggalPanjang(pricing.pengurusanPemakaman.inForceSince)}.
            </p>
          ) : null}
          <p className="text-small text-muted-foreground">
            Retribusi Pemda diteruskan apa adanya ke pemerintah daerah sebagai baris tersendiri, dan ditampilkan Rp 0 di
            tempat pemerintah daerah tidak memungut biaya.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Harga Layanan di TPU DKI</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-body text-muted-foreground">
            Daftar harga Layanan di TPU DKI (perawatan makam, batu nisan, bunga) belum tersedia. Segera hadir.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tiga jalan masuk lewat Makam.co.id</CardTitle>
          <CardDescription>Perpanjang IPTM dan mengurus berkas sendiri menyusul.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-body">
          <p>
            <Link href="/pesan-makam/saat-duka?jenis=tpu_dki" className="font-medium text-brand underline underline-offset-4">
              Saat Duka di TPU
            </Link>{" "}
            — kami siapkan pemakamannya bersama TPU lalu mengurus IPTM-nya.
          </p>
          <p>
            <span className="font-medium">Perpanjang IPTM</span> — memperpanjang izin makam yang akan berakhir. Segera
            hadir.
          </p>
          <p>
            <span className="font-medium">Sudah dimakamkan? Kami urus IPTM-nya</span> — kalau keluarga sudah memakamkan
            sendiri, Anda hanya perlu berkas ini saja. Segera hadir.
          </p>
          {cs ? (
            <p className="text-small text-muted-foreground">
              Sudah siap lebih dulu? Hubungi CS di{" "}
              <a href={csWhatsAppLink(cs)} target="_blank" rel="noreferrer" className="text-brand underline underline-offset-4">
                WhatsApp
              </a>{" "}
              ({cs.replyHours}).
            </p>
          ) : null}
        </CardContent>
      </Card>

      <p className="text-small text-muted-foreground">
        Lihat juga <Link href="/lokasi" className="text-brand underline underline-offset-4">Daftar Lokasi Makam</Link> untuk
        Lokasi Mitra dan TPU yang bisa kami layani.
      </p>
    </main>
  );
}
