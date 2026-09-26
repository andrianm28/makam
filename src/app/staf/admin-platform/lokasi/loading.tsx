import { DataTableSkeleton } from "@/components/makam/data-table";
import { Skeleton } from "@/components/ui/skeleton";

/** The Lokasi Mitra list, while a search or page change streams in. */
export default function LokasiMitraListLoading() {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-80" />
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
      <DataTableSkeleton columnCount={3} withFilter />
    </>
  );
}
