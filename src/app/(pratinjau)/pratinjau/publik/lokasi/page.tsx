/* PROTOTYPE, throwaway. Daftar Lokasi Makam. */
import { DaftarLokasi } from "./daftar-lokasi";

export default async function DaftarLokasiPratinjau({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return <DaftarLokasi terencana={params.terencana === "1"} />;
}
