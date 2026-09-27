import Link from "next/link";
import { notFound } from "next/navigation";
import { isPortConfigured } from "@/adapters/live/not-configured";
import { serverRuntime } from "@/server/runtime";
import { adminLokasiScope } from "../../../scope";
import { DenahEditor } from "./denah-editor";

/** Admin Lokasi: one Blok's Denah editor. */
export default async function BlokDenahPage({ params }: PageProps<"/staf/admin-lokasi/[lokasiId]/denah/[blokId]">) {
  const { lokasiId, blokId } = await params;
  const { actor, current } = await adminLokasiScope(lokasiId);
  const runtime = serverRuntime();
  const reads = runtime.inventory.asStaff(actor);
  const [denah, tariffs] = await Promise.all([
    reads.blok(current.id, blokId),
    runtime.tariffs.asStaff(actor).lokasiTariffs(current.id, runtime.adapters.clock.now()),
  ]);
  if (!denah) notFound();

  const fileStoreConfigured = isPortConfigured(runtime.adapters.files);
  const photoUrl = fileStoreConfigured ? await reads.photoUrl(current.id, blokId) : null;

  return (
    <>
      <Link href={`/staf/admin-lokasi/${current.id}/denah`} className="text-sm underline underline-offset-4">
        Denah {current.name}
      </Link>
      <h1 className="text-title-1 text-foreground">Blok {denah.blok.name}</h1>
      <DenahEditor
        lokasiId={current.id}
        blok={{ id: denah.blok.id, name: denah.blok.name, rows: denah.blok.rows, cols: denah.blok.cols, numberPattern: denah.blok.numberPattern }}
        cells={denah.cells}
        kavling={denah.kavling}
        jenisMakam={tariffs.jenisMakam.map((jenis) => ({ id: jenis.id, name: jenis.name }))}
        fileStoreConfigured={fileStoreConfigured}
        photoUrl={photoUrl}
      />
    </>
  );
}
