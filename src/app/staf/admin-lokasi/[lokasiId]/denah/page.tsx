import { redirect } from "next/navigation";
import { PageHeader } from "@/components/makam/page-header";
import { serverRuntime } from "@/server/runtime";
import { adminLokasiScope } from "../../scope";
import { DenahEmptyState } from "./_parts/empty-state";

/**
 * Admin Lokasi: the Denah's landing page. A Lokasi with any Blok goes
 * straight to its first Blok's editor (the Blok tabs there cover the rest);
 * only an empty Lokasi renders here, matching ticket 13's prototype.
 */
export default async function DenahPage({ params }: PageProps<"/staf/admin-lokasi/[lokasiId]/denah">) {
  const { lokasiId } = await params;
  const { actor, current } = await adminLokasiScope(lokasiId);
  const runtime = serverRuntime();
  const [bloks, tariffs] = await Promise.all([
    runtime.inventory.asStaff(actor).bloks(current.id),
    runtime.tariffs.asStaff(actor).lokasiTariffs(current.id, runtime.adapters.clock.now()),
  ]);

  if (bloks.length) redirect(`/staf/admin-lokasi/${current.id}/denah/${bloks[0].id}`);

  return (
    <>
      <PageHeader title="Denah" description="Susun Blok, Petak Makam, Jalan, Bukan Petak dan Kavling Keluarga sesuai kondisi di lapangan." />
      <DenahEmptyState lokasiId={current.id} jenisMakam={tariffs.jenisMakam.map((jenis) => ({ id: jenis.id, name: jenis.name }))} />
    </>
  );
}
