import { BriefcaseIcon } from "lucide-react";
import { EmptyState } from "@/components/makam/empty-state";
import { PageHeader } from "@/components/makam/page-header";
import { staffMenuActor } from "@/server/staff-area";

/** Pekerjaan (Pekerjaan Layanan) is not built yet for Mitra Jasa; page titles use the full CONTEXT.md term. */
export default async function PekerjaanPage() {
  await staffMenuActor("mitra_jasa");
  return (
    <>
      <PageHeader title="Pekerjaan Layanan" />
      <EmptyState
        icon={BriefcaseIcon}
        title="Pekerjaan Layanan"
        description="Satu Layanan yang Anda kerjakan di satu Petak Makam pada satu tanggal target, dengan status dan bukti fotonya. Segera hadir."
      />
    </>
  );
}
