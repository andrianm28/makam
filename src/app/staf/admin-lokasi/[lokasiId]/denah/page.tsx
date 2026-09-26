import Link from "next/link";
import { LandPlot } from "lucide-react";
import { serverRuntime } from "@/server/runtime";
import { adminLokasiScope, LokasiSwitcher } from "../../scope";
import { NewBlokForm } from "./new-blok-form";

/** Admin Lokasi: every Blok of the current Lokasi Mitra's Denah, and the form to create one. */
export default async function DenahPage({ params }: PageProps<"/staf/admin-lokasi/[lokasiId]/denah">) {
  const { lokasiId } = await params;
  const { actor, lokasiMitra, current } = await adminLokasiScope(lokasiId);
  const runtime = serverRuntime();
  const [bloks, tariffs] = await Promise.all([
    runtime.inventory.asStaff(actor).bloks(current.id),
    runtime.tariffs.asStaff(actor).lokasiTariffs(current.id, runtime.adapters.clock.now()),
  ]);

  return (
    <>
      <LokasiSwitcher lokasiMitra={lokasiMitra} current={current.id} />
      <Link href={`/staf/admin-lokasi/${current.id}`} className="text-sm underline underline-offset-4">
        {current.name}
      </Link>
      <h1 className="text-title-1 text-foreground">Denah</h1>
      <p className="text-body text-muted-foreground">
        Peta petak Lokasi ini per Blok: baris × kolom, tiap sel Petak Makam, Jalan, atau Bukan Petak. Petak baru berstatus
        Perlu Verifikasi sampai Admin Lokasi memeriksanya.
      </p>

      {bloks.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {bloks.map((blok) => (
            <li key={blok.id}>
              <Link
                href={`/staf/admin-lokasi/${current.id}/denah/${blok.id}`}
                className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4 hover:border-forest"
              >
                <span className="flex items-center gap-2 text-title-3 text-foreground">
                  <LandPlot className="size-4 text-muted-foreground" aria-hidden /> Blok {blok.name}
                </span>
                <span className="text-small text-muted-foreground">
                  {blok.rows} baris × {blok.cols} kolom · pola {blok.numberPattern}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body text-muted-foreground">Belum ada Blok di Lokasi ini.</p>
      )}

      <div className="rounded-2xl border border-border bg-card p-4">
        <h2 className="text-title-3 text-foreground">Buat Blok baru</h2>
        {tariffs.jenisMakam.length ? (
          <NewBlokForm lokasiId={current.id} jenisMakam={tariffs.jenisMakam.map((jenis) => ({ id: jenis.id, name: jenis.name }))} />
        ) : (
          <p className="mt-2 text-body text-muted-foreground">
            Belum ada Jenis Makam di Lokasi ini. Admin Platform perlu menambahkan Jenis Makam dulu di halaman Tarif sebelum
            Blok bisa dibuat.
          </p>
        )}
      </div>
    </>
  );
}
