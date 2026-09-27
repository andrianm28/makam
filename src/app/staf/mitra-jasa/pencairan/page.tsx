import { BanknoteIcon } from "lucide-react";
import { EmptyState } from "@/components/makam/empty-state";
import { PageHeader } from "@/components/makam/page-header";
import { staffMenuActor } from "@/server/staff-area";

/** Pencairan is not built yet for Mitra Jasa. */
export default async function PencairanPage() {
  await staffMenuActor("mitra_jasa");
  return (
    <>
      <PageHeader title="Pencairan" />
      <EmptyState
        icon={BanknoteIcon}
        title="Pencairan"
        description="Pembayaran Operator untuk Pekerjaan Layanan yang sudah selesai dan tidak lagi bisa dibatalkan. Segera hadir."
      />
    </>
  );
}
