import { CalendarClockIcon } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/makam/empty-state";
import { PageHeader } from "@/components/makam/page-header";
import { buttonVariants } from "@/components/ui/button";
import { staffMenuActor } from "@/server/staff-area";

/** Jadwal is not built yet: Petugas Lapangan sees their Tugas Lapangan through Tugas, by planned date. */
export default async function JadwalPage() {
  await staffMenuActor("petugas_lapangan");
  return (
    <>
      <PageHeader title="Jadwal" />
      <EmptyState
        icon={CalendarClockIcon}
        title="Jadwal"
        description="Tugas Lapangan Anda menurut tanggal rencana. Segera hadir."
        action={
          <Link href="/staf/petugas-lapangan/tugas" className={buttonVariants({ variant: "outline" })}>
            Buka Tugas
          </Link>
        }
      />
    </>
  );
}
