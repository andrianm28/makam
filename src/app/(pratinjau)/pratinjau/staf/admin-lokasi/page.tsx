import { PageHeader } from "@/components/makam/page-header";
import { AntreanList } from "../antrean-list";
import { antrean } from "../_mock/data";

/** PROTOTYPE: Admin Lokasi home, the Antrean Lokasi split into Mendesak and Lainnya. */
export default function AdminLokasiPratinjau() {
  const rows = antrean.filter((row) => !row.diambil).map((row) => ({ ...row, lokasi: "Taman Makam Wakaf Al-Ikhlas" }));
  const mendesak = rows.filter((row) => row.sisaMenit < 120);
  const lainnya = rows.filter((row) => row.sisaMenit >= 120);
  return (
    <>
      <PageHeader title="Antrean Lokasi" description="Pekerjaan terbuka untuk Taman Makam Wakaf Al-Ikhlas. Baris hilang sendiri setelah urusannya selesai." />
      <section className="flex flex-col gap-3">
        <h2 className="text-title-2">Mendesak</h2>
        <AntreanList rows={mendesak} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-title-2">Lainnya</h2>
        <AntreanList rows={lainnya} />
      </section>
    </>
  );
}
