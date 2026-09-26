import { JobList } from "../_parts/job-list";
import { tugasLapangan } from "../_mock/data";

/** PROTOTYPE: Petugas Lapangan on a phone, the same bottom navigation with Tugas Lapangan. */
export default function PetugasLapanganPratinjau() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-title-1">Tugas</h1>
        <p className="text-body text-muted-foreground">Tugas Lapangan Anda. Tugas selesai setelah semua unggahan wajib masuk.</p>
      </header>
      <JobList rows={tugasLapangan} noun="Tugas Lapangan" />
    </div>
  );
}
