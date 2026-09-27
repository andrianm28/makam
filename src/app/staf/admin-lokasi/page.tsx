import { MapPinnedIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/makam/empty-state";
import { PageHeader } from "@/components/makam/page-header";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";

/** The Admin Lokasi start: the first of its Lokasi Mitra (by name), or a note when it has none. */
export default async function AdminLokasiPage() {
  const actor = await staffMenuActor("admin_lokasi");
  const [first] = await serverRuntime().lokasi.lokasiMitraOfAdminLokasi(actor);
  if (first) redirect(`/staf/admin-lokasi/${first.id}`);

  return (
    <>
      <PageHeader title="Admin Lokasi" description="Lokasi Mitra yang Anda kelola." />
      <EmptyState
        icon={MapPinnedIcon}
        title="Belum terhubung ke Lokasi Mitra"
        description="Minta Admin Platform mengundang Anda dari halaman Lokasi Mitra-nya."
      />
    </>
  );
}
