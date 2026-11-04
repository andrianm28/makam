import { notFound, redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FOTO_GALERI_MAKS, kategoriFotoGaleri, labelKategoriFotoGaleri } from "@/domain/lokasi";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { GambarTipeKavlingForm, HapusFotoForm, UnggahFotoForm } from "./foto-forms";

/**
 * Admin Platform: the Galeri Lokasi (facilities and landscape photos) and each
 * Jenis Makam's Gambar Tipe Kavling, the images the public page and the wizard
 * show. Never headstones or the burial area: every upload confirms it.
 */
export default async function FotoLokasiPage({ params }: PageProps<"/staf/admin-platform/lokasi/[lokasiId]/foto">) {
  const actor = await staffMenuActor("admin_platform");
  const { lokasiId } = await params;
  const { lokasi, tariffs, adapters } = serverRuntime();
  const read = await lokasi.lokasiMitra(actor, lokasiId);
  if (!read.ok) {
    if (read.reason === "tidak_ditemukan") notFound();
    redirect("/staf");
  }
  const [galeri, priced] = await Promise.all([lokasi.fotoGaleri(actor, lokasiId), tariffs.asStaff(actor).lokasiTariffs(lokasiId, adapters.clock.now())]);
  const foto = galeri.ok ? galeri.foto : [];
  const gambar = await tariffs.staffGambarTipeKavling(priced.jenisMakam.map((one) => one.id));
  const opsi = kategoriFotoGaleri.map((value) => ({ value, label: labelKategoriFotoGaleri[value] }));

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Galeri Lokasi</CardTitle>
          <CardDescription>
            Foto fasilitas dan lanskap yang tampil di halaman lokasi dan di pemesanan, paling banyak {FOTO_GALERI_MAKS} foto: gerbang,
            taman, bangunan, akses jalan dan parkir. Jangan unggah foto nisan, makam berjajar, atau area pemakaman. Tampil setelah lokasi
            Terverifikasi.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6 text-sm">
          {foto.length === 0 ? <p className="text-muted-foreground">Belum ada foto.</p> : null}
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {foto.map((satu) => (
              <li key={satu.id} className="flex flex-col gap-2 rounded-xl border border-border p-3">
                {satu.url ? (
                  // A short-lived signed URL: plain <img>, next/image cannot cache a URL that expires.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={satu.url} alt={satu.keterangan} className="aspect-[4/3] w-full rounded-lg object-cover" />
                ) : (
                  <p className="text-muted-foreground">Berkas tidak bisa dibaca.</p>
                )}
                <p>{satu.keterangan}</p>
                <p className="text-muted-foreground">{labelKategoriFotoGaleri[satu.kategori]}</p>
                <HapusFotoForm lokasiId={lokasiId} fotoId={satu.id} />
              </li>
            ))}
          </ul>
          {foto.length < FOTO_GALERI_MAKS ? <UnggahFotoForm lokasiId={lokasiId} kategori={opsi} /> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gambar Tipe Kavling</CardTitle>
          <CardDescription>
            Satu gambar per Jenis Makam: ilustrasi atau denah ukuran kavling, tampil di kartu tipe kavling. Bukan foto nisan atau area
            pemakaman.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6 text-sm">
          {priced.jenisMakam.length === 0 ? <p className="text-muted-foreground">Belum ada Jenis Makam. Tambahkan di tab Tarif.</p> : null}
          {priced.jenisMakam.map((jenis) => {
            const ada = gambar[jenis.id];
            return (
              <section key={jenis.id} className="flex flex-col gap-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
                <h3 className="font-semibold">{jenis.name}</h3>
                {ada ? (
                  <figure className="flex flex-col gap-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ada.url} alt={ada.keterangan} className="aspect-[4/3] w-full max-w-sm rounded-lg object-cover" />
                    <figcaption className="text-muted-foreground">{ada.keterangan}</figcaption>
                  </figure>
                ) : (
                  <p className="text-muted-foreground">Belum ada gambar.</p>
                )}
                <GambarTipeKavlingForm lokasiId={lokasiId} jenisMakamId={jenis.id} ada={Boolean(ada)} />
              </section>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
