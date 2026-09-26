import { PlusIcon } from "lucide-react";
import { PageHeader } from "@/components/makam/page-header";
import { Button } from "@/components/ui/button";
import { lokasiMitra } from "../_mock/data";
import { LokasiTable } from "./lokasi-table";

/** PROTOTYPE (b): the Lokasi Mitra list. */
export default function LokasiPratinjau() {
  return (
    <>
      <PageHeader
        title="Lokasi Mitra"
        description="Semua Lokasi Mitra, dari onboarding sampai tayang. Buka satu untuk profil, Tarif, Jam Operasional dan Admin Lokasi-nya."
        actions={
          <Button>
            <PlusIcon aria-hidden /> Tambah Lokasi Mitra
          </Button>
        }
      />
      <LokasiTable data={lokasiMitra} />
    </>
  );
}
