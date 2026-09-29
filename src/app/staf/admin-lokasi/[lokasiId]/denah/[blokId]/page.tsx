import { notFound } from "next/navigation";
import { isPortConfigured } from "@/adapters/live/not-configured";
import { serverRuntime } from "@/server/runtime";
import { adminLokasiScope } from "../../../scope";
import { DenahEditor } from "./denah-editor";

/** Admin Lokasi: one Blok's Denah editor, with the Lokasi's other Blok as tabs. */
export default async function BlokDenahPage({ params }: PageProps<"/staf/admin-lokasi/[lokasiId]/denah/[blokId]">) {
  const { lokasiId, blokId } = await params;
  const { actor, current } = await adminLokasiScope(lokasiId);
  const runtime = serverRuntime();
  const reads = runtime.inventory.asStaff(actor);
  const [bloks, denah, tariffs, bolehHapus] = await Promise.all([
    reads.bloks(current.id),
    reads.blok(current.id, blokId),
    runtime.tariffs.asStaff(actor).lokasiTariffs(current.id, runtime.adapters.clock.now()),
    runtime.inventory.bolehHapusBlok(actor, current.id, blokId),
  ]);
  if (!denah) notFound();

  const fileStoreConfigured = isPortConfigured(runtime.adapters.files);
  const photoUrl = fileStoreConfigured ? await reads.photoUrl(current.id, blokId) : null;

  return (
    <DenahEditor
      lokasiId={current.id}
      bloks={bloks.map((b) => ({ id: b.id, name: b.name }))}
      blok={{ id: denah.blok.id, name: denah.blok.name, rows: denah.blok.rows, cols: denah.blok.cols, numberPattern: denah.blok.numberPattern }}
      cells={denah.cells}
      kavling={denah.kavling}
      jenisMakam={tariffs.jenisMakam.map((jenis) => ({ id: jenis.id, name: jenis.name }))}
      fileStoreConfigured={fileStoreConfigured}
      photoUrl={photoUrl}
      bolehHapus={bolehHapus.boleh}
    />
  );
}
