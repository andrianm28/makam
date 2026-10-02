import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { serverRuntime } from "@/server/runtime";
import { adminLokasiScope } from "../../../scope";

/** A Petak on the Denah leads to its current Hak Pakai's page; a Petak with none is nothing found here. */
export default async function PetakPage({ params }: PageProps<"/staf/admin-lokasi/[lokasiId]/petak/[petakId]">) {
  const { lokasiId, petakId } = await params;
  const parsed = z.uuid().safeParse(petakId);
  if (!parsed.success) notFound();
  const { actor, current } = await adminLokasiScope(lokasiId);
  const hakPakai = await serverRuntime().inventory.asStaff(actor).hakPakaiOfPetak(current.id, parsed.data);
  if (!hakPakai) notFound();
  redirect(`/staf/admin-lokasi/${current.id}/hak-pakai/${hakPakai.id}`);
}
