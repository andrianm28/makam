import { JobList } from "../_parts/job-list";
import { pekerjaanMitraJasa } from "../_mock/data";

/** PROTOTYPE (e): Mitra Jasa on a phone, bottom navigation and the Pekerjaan Layanan list. */
export default function MitraJasaPratinjau() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-title-1">Pekerjaan</h1>
        <p className="text-body text-muted-foreground">Pekerjaan Layanan Anda di TPU. Selesaikan dengan foto bukti sebelum tanggal target.</p>
      </header>
      <JobList rows={pekerjaanMitraJasa} noun="Pekerjaan Layanan" />
    </div>
  );
}
