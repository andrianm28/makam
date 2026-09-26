/* PROTOTYPE, throwaway. Halaman Lokasi Mitra. */
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CalendarClock, Check, CircleSlash, Clock, FileText, Info, MapPin } from "lucide-react";
import { BASE, BIAYA_LAYANAN_PLATFORM, DOKUMEN, FASILITAS_LABEL, lokasiBySlug, mulaiDari, rupiah, totalSaatDuka, type Fasilitas } from "../../_mock/data";
import { FASILITAS_ICON } from "../../_parts/lokasi-card";
import { VerifiedPopover } from "./verified-popover";

const ALL_FASILITAS = Object.keys(FASILITAS_LABEL) as Fasilitas[];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t border-border pt-8">
      <h2 id={id} className="text-title-1 text-forest">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function LokasiPratinjau({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lokasi = lokasiBySlug(slug);
  if (!lokasi) notFound();
  const [main, ...rest] = lokasi.foto;
  const pesanHref = `${BASE}/pesan?lokasi=${lokasi.slug}`;

  const cta = (
    <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-xs">
      <div>
        <p className="text-caption text-muted-foreground">mulai</p>
        <p className="text-display tabular-nums text-foreground">{rupiah(mulaiDari(lokasi))}</p>
        <p className="text-small text-muted-foreground">semua biaya, untuk pemakaman dalam waktu dekat</p>
      </div>
      <Link href={pesanHref} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-body-lg font-semibold text-primary-foreground hover:bg-primary/90">
        Pesan makam sekarang <ArrowRight className="size-5" aria-hidden />
      </Link>
      <p className="-mt-2 text-center text-small text-muted-foreground">untuk keluarga yang baru saja kehilangan · tidak ada yang dibayar saat mengirim</p>
      <div className="border-t border-border pt-4">
        {lokasi.terencanaAktif ? (
          <Link href={`${BASE}/lokasi?terencana=1`} className="inline-flex items-center gap-1 text-body font-semibold text-forest">
            Siapkan makam untuk nanti <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : (
          <p className="flex items-start gap-2 text-body text-muted-foreground">
            <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <span className="font-medium text-foreground">Pemesanan terencana segera tersedia.</span> Kami sedang mencocokkan denah lokasi ini dengan
              keadaan di lapangan.
            </span>
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[80rem] px-4 pt-6 pb-28 md:px-8 md:pt-8 lg:pb-16">
      <nav aria-label="Jejak halaman" className="text-small text-muted-foreground">
        <Link href={BASE} className="hover:text-forest">
          Beranda
        </Link>{" "}
        /{" "}
        <Link href={`${BASE}/lokasi`} className="hover:text-forest">
          Daftar Lokasi
        </Link>{" "}
        / {lokasi.nama}
      </nav>

      {/* Photos with their visit dates */}
      <div className="mt-4 grid gap-2 md:grid-cols-[2fr_1fr] md:gap-3">
        <figure className="relative aspect-[4/3] overflow-hidden rounded-3xl md:aspect-auto md:min-h-[26rem]">
          <Image src={main.src} alt={main.alt} fill priority sizes="(min-width: 768px) 60vw, 100vw" className="object-cover" />
          <figcaption className="absolute bottom-3 left-3 rounded-full bg-card/90 px-3 py-1 text-caption font-medium text-foreground">
            Foto kunjungan {main.tanggal} · contoh
          </figcaption>
        </figure>
        <div className="grid grid-cols-3 gap-2 md:grid-cols-1 md:gap-3">
          {rest.slice(0, 3).map((f) => (
            <figure key={f.src + f.tanggal} className="relative aspect-[4/3] overflow-hidden rounded-2xl md:aspect-auto md:min-h-0">
              <Image src={f.src} alt={f.alt} fill sizes="(min-width: 768px) 30vw, 33vw" className="object-cover" />
              <figcaption className="absolute bottom-2 left-2 hidden rounded-full bg-card/90 px-2 py-0.5 text-caption text-foreground sm:block">{f.tanggal}</figcaption>
            </figure>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_22rem]">
        <div className="flex min-w-0 flex-col gap-10">
          <header className="flex flex-col gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-forest md:text-4xl">{lokasi.nama}</h1>
            <p className="flex items-start gap-1.5 text-body-lg text-muted-foreground">
              <MapPin className="mt-1 size-4 shrink-0" aria-hidden /> {lokasi.alamat}
            </p>
            <p className="text-body text-foreground">
              Dikelola oleh <span className="font-semibold">{lokasi.pengelola}</span>, yang memberikan Hak Pakai kepada keluarga.
            </p>
            <VerifiedPopover dikunjungi={lokasi.dikunjungi} />
          </header>

          <Section id="harga" title="Harga per Jenis Makam">
            <p className="text-body text-muted-foreground">
              Total sudah termasuk semua biaya untuk pemakaman dalam waktu dekat. Harga ini sama dengan yang tertulis di Tagihan.
            </p>
            <ul className="mt-5 flex flex-col gap-4">
              {lokasi.jenisMakam.map((j) => {
                const habis = j.tersedia === 0;
                return (
                  <li key={j.id} className="rounded-2xl border border-border bg-card p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-title-2 text-foreground">{j.nama}</h3>
                        <p className="text-small text-muted-foreground">
                          {j.ukuran} · Masa Hak Pakai {j.masaHakPakai.toLowerCase()}
                        </p>
                        <p className="mt-1 text-small text-muted-foreground">
                          {j.perpanjangan ? `Perpanjangan ${rupiah(j.perpanjangan)} per ${j.masaHakPakai}` : "Tidak perlu diperpanjang"}
                        </p>
                      </div>
                      <div className="sm:text-right">
                        <p className="text-title-1 tabular-nums text-foreground">{rupiah(totalSaatDuka(lokasi, j))}</p>
                        <p className={habis ? "text-small font-medium text-warning-soft-foreground" : "text-small text-success-soft-foreground"}>
                          {habis ? "Belum tersedia saat ini" : `${j.tersedia} makam tersedia`}
                        </p>
                      </div>
                    </div>
                    <p className="mt-3 border-t border-border pt-3 text-caption text-muted-foreground tabular-nums">
                      Harga Hak Pakai {rupiah(j.hargaHakPakai)} + Biaya Pemakaman {rupiah(lokasi.biayaPemakaman)} + Biaya Layanan Platform{" "}
                      {rupiah(BIAYA_LAYANAN_PLATFORM)}
                    </p>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex flex-col gap-2 text-small">
              <p className="flex items-center gap-2 text-muted-foreground">
                <CalendarClock className="size-4" aria-hidden /> Harga berlaku sejak {lokasi.hargaBerlakuSejak}
              </p>
              {lokasi.hargaBaru ? (
                <p className="flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-info-soft-foreground">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> Harga baru mulai {lokasi.hargaBaru.mulai}: {lokasi.hargaBaru.catatan}.
                </p>
              ) : null}
              <p className="text-muted-foreground">
                Pemakaman berikutnya di makam keluarga yang sama (tumpang): Biaya Pemakaman {rupiah(lokasi.biayaPemakamanTumpang)} + Biaya Layanan
                Platform {rupiah(BIAYA_LAYANAN_PLATFORM)}.
              </p>
            </div>
          </Section>

          <Section id="dokumen" title="Dokumen yang perlu disiapkan">
            <ul className="grid gap-2 sm:grid-cols-2">
              {DOKUMEN.map((d) => (
                <li key={d} className="flex items-start gap-2 text-body text-foreground">
                  <FileText className="mt-0.5 size-4 shrink-0 text-sage-strong" aria-hidden /> {d}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-body text-muted-foreground">Dokumen boleh menyusul: unggah nanti dari halaman pesanan, atau bawa saat hari pemakaman.</p>
          </Section>

          <Section id="fasilitas" title="Fasilitas">
            <p className="text-body text-muted-foreground">Diperiksa petugas kami saat kunjungan {lokasi.dikunjungi}.</p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {ALL_FASILITAS.map((f) => {
                const ada = lokasi.fasilitas.includes(f);
                const Icon = FASILITAS_ICON[f];
                return (
                  <li key={f} className={ada ? "flex items-center gap-3 text-body text-foreground" : "flex items-center gap-3 text-body text-muted-foreground"}>
                    <span className={ada ? "inline-flex size-9 items-center justify-center rounded-full bg-brand-soft text-forest" : "inline-flex size-9 items-center justify-center rounded-full bg-muted"}>
                      <Icon className="size-4" aria-hidden />
                    </span>
                    {FASILITAS_LABEL[f]}
                    {ada ? <Check className="size-4 text-success" aria-label="ada" /> : <CircleSlash className="size-4" aria-label="tidak ada" />}
                  </li>
                );
              })}
            </ul>
          </Section>

          <Section id="jam" title="Jam Operasional">
            <p className="text-body-lg text-foreground">{lokasi.jamOperasional}</p>
            <p className="mt-1 text-body text-muted-foreground">
              Pesanan Saat Duka dikonfirmasi dalam 2 jam di dalam Jam Operasional. Di luar jam itu, halaman pesanan menampilkan kapan konfirmasi
              datang dan nomor Kontak Siaga lokasi ini.
            </p>
          </Section>

          <Section id="pembatalan" title="Pembatalan pemesanan terencana">
            <ul className="flex flex-col gap-2">
              {lokasi.pembatalan.map((p) => (
                <li key={p} className="flex items-start gap-2 text-body text-foreground">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-sage-strong" aria-hidden /> {p}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-body text-muted-foreground">
              Pesanan Saat Duka dapat dibatalkan sebelum pemakaman; pembayaran yang sudah masuk dikembalikan kecuali Biaya Layanan Platform.
            </p>
          </Section>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-24">{cta}</div>
        </aside>
      </div>

      {/* Phone: the booking action stays in reach. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-caption text-muted-foreground">mulai, semua biaya</p>
            <p className="text-title-2 tabular-nums">{rupiah(mulaiDari(lokasi))}</p>
          </div>
          <Link href={pesanHref} className="inline-flex h-12 items-center justify-center rounded-xl bg-primary px-5 text-body font-semibold text-primary-foreground">
            Pesan makam sekarang
          </Link>
        </div>
      </div>
      <div className="mt-10 lg:hidden">{cta}</div>
    </div>
  );
}
