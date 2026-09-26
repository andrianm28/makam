import { notFound } from "next/navigation";
import { lokasiById } from "../../_mock/data";
import { LokasiDetail } from "./lokasi-detail";

const tabs = ["ringkasan", "tarif", "jam-operasional", "admin-lokasi", "audit-log"] as const;
export type LokasiTab = (typeof tabs)[number];

/** PROTOTYPE (c): one Lokasi Mitra, with tabs. `?tab=` picks the tab so each one has a URL. */
export default async function LokasiDetailPratinjau({ params, searchParams }: PageProps<"/pratinjau/staf/lokasi/[lokasiId]">) {
  const { lokasiId } = await params;
  const { tab } = await searchParams;
  const lokasi = lokasiById(lokasiId);
  if (!lokasi) notFound();
  const initial = (tabs as readonly string[]).includes(String(tab)) ? (tab as LokasiTab) : "ringkasan";
  return <LokasiDetail lokasi={lokasi} initialTab={initial} />;
}
