import type { ReactNode } from "react";
import { CheckIcon, CircleSlashIcon, FileTextIcon, MapPinIcon, NavigationIcon } from "lucide-react";
import { VerifiedPopover } from "@/app/(site)/lokasi/[lokasiId]/verified-popover";
import { lokasiFacilities, weekdays, type LokasiFacility, type Weekday } from "@/domain/lokasi";
import { formatBulanTahun, formatTanggalPanjang } from "@/lib/format-tanggal";
import { directionsUrl, embedMapUrl, mapsQueryFor } from "@/lib/maps";
import { serverRuntime } from "@/server/runtime";

const namaHari: Record<Weekday, string> = {
  monday: "Senin",
  tuesday: "Selasa",
  wednesday: "Rabu",
  thursday: "Kamis",
  friday: "Jumat",
  saturday: "Sabtu",
  sunday: "Minggu",
};
const semuaFasilitas = Object.keys(lokasiFacilities) as LokasiFacility[];

/** The Lokasi Mitra's own page, split around the tipe kavling cards: its photos above, everything else below. */
export interface ProfilLokasi {
  galeri: ReactNode;
  rincian: ReactNode;
}

/**
 * The full Lokasi Mitra page on the Pilih Tipe Kavling step (dri, 6 Nov 2026: "tampilkan laman mitra lokasi penuh
 * dengan seluruh informasinya"): its photos, who manages it and its verification, documents, facilities, Jam
 * Operasional and map, read from the same public queries as /lokasi/[lokasiId]. No price here: the tipe and its total
 * are read at Data & kirim.
 */
export async function profilLokasi(lokasiId: string): Promise<ProfilLokasi | null> {
  const { lokasi } = serverRuntime();
  const profil = await lokasi.publicLokasiMitraProfil(lokasiId);
  if (!profil) return null;
  const [galeri, fotoKunjungan] = await Promise.all([lokasi.publicFotoGaleri(lokasiId), lokasi.publicVisitPhotoUrls(lokasiId)]);
  const foto =
    galeri.length > 0
      ? galeri.map((satu) => ({ url: satu.url!, alt: satu.keterangan }))
      : fotoKunjungan.map((url, index) => ({ url, alt: `Foto lokasi ${profil.name}${index === 0 ? "" : ` ${index + 1}`}` }));
  const dikunjungi = profil.kunjunganVerifikasi ? formatBulanTahun(profil.kunjunganVerifikasi.visitedOn) : null;
  const peta = mapsQueryFor(profil);

  return {
    galeri:
      foto.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label={`Foto ${profil.name}`}>
          {foto.slice(0, 8).map((satu, index) => (
            <li key={satu.url} className={index === 0 ? "col-span-2 row-span-2" : undefined}>
              <figure className="relative h-full overflow-hidden rounded-2xl">
                {/* A short-lived signed URL: plain <img>, next/image cannot cache a URL that expires. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={satu.url} alt={satu.alt} className="aspect-[4/3] h-full w-full object-cover" />
              </figure>
            </li>
          ))}
        </ul>
      ) : null,
    rincian: (
      <div className="flex flex-col gap-10" data-testid="profil-lokasi">
        <div className="flex flex-col gap-3">
          <p className="text-lg text-foreground">
            Dikelola oleh <span className="font-bold">{profil.pengelolaName}</span>, yang memberikan Hak Pakai kepada keluarga.
          </p>
          {profil.belumTerverifikasi ? null : <VerifiedPopover dikunjungi={dikunjungi} />}
        </div>

        <Bagian judul="Dokumen yang perlu disiapkan">
          {profil.documentChecklist.length === 0 ? (
            <p className="text-lg text-muted-foreground">Belum ada daftar dokumen.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {profil.documentChecklist.map((dokumen) => (
                <li key={dokumen} className="flex items-start gap-2 text-lg text-foreground">
                  <FileTextIcon className="mt-1 size-5 shrink-0 text-forest" aria-hidden /> {dokumen}
                </li>
              ))}
            </ul>
          )}
        </Bagian>

        <Bagian judul="Fasilitas">
          <ul className="grid gap-3 sm:grid-cols-2">
            {semuaFasilitas.map((fasilitas) => {
              const ada = profil.facilities.checked.includes(fasilitas);
              return (
                <li key={fasilitas} className={ada ? "flex items-center gap-2 text-lg text-foreground" : "flex items-center gap-2 text-lg text-muted-foreground"}>
                  {ada ? <CheckIcon className="size-5 text-forest" aria-label="ada" /> : <CircleSlashIcon className="size-5" aria-label="tidak ada" />}
                  {lokasiFacilities[fasilitas]}
                </li>
              );
            })}
          </ul>
          {profil.facilities.note ? <p className="mt-3 text-body text-muted-foreground">{profil.facilities.note}</p> : null}
        </Bagian>

        <Bagian judul="Jam Operasional">
          {profil.jamOperasional ? (
            <div className="flex flex-col gap-3">
              <ul className="flex max-w-md flex-col gap-1 text-lg text-foreground">
                {weekdays.map((hari) => {
                  const jam = profil.jamOperasional!.weekly[hari];
                  return (
                    <li key={hari} className="flex justify-between gap-4">
                      <span>{namaHari[hari]}</span>
                      <span className="tabular-nums text-muted-foreground">{jam ? `${jam.opens}–${jam.closes}` : "Tutup"}</span>
                    </li>
                  );
                })}
              </ul>
              {profil.jamOperasional.tanggalTutup.length > 0 ? (
                <ul className="flex flex-col gap-0.5 text-body text-muted-foreground">
                  {profil.jamOperasional.tanggalTutup.map((tutup) => (
                    <li key={tutup.date}>
                      Tutup {formatTanggalPanjang(tutup.date)}: {tutup.note}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="text-lg text-muted-foreground">Jam Operasional belum tersedia.</p>
          )}
        </Bagian>

        <Bagian judul="Lokasi dan petunjuk arah">
          <p className="flex items-start gap-2 text-lg text-foreground">
            <MapPinIcon className="mt-1 size-5 shrink-0 text-forest" aria-hidden /> {profil.address}
          </p>
          {peta ? (
            <>
              <div className="mt-4 overflow-hidden rounded-3xl border border-border bg-muted">
                <iframe
                  src={embedMapUrl(peta)}
                  title={`Peta ${profil.name}`}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  className="block aspect-[16/10] w-full md:aspect-[16/7]"
                />
              </div>
              <a
                href={directionsUrl(peta)}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex h-14 items-center gap-2 rounded-xl border-2 border-forest px-6 text-lg font-bold text-forest hover:bg-accent"
              >
                <NavigationIcon className="size-5" aria-hidden /> Petunjuk arah
              </a>
            </>
          ) : null}
        </Bagian>
      </div>
    ),
  };
}

function Bagian({ judul, children }: { judul: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t-4 border-forest pt-6">
      <h2 className="font-heading text-2xl font-extrabold tracking-tight text-forest md:text-3xl">{judul}</h2>
      {children}
    </section>
  );
}
