import { Skeleton } from "@/components/ui/skeleton";

/** A Lokasi Mitra's detail, while its header, tabs or a tab's content streams in. */
export default function LokasiMitraDetailLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-5 w-40" />
      </div>
      <Skeleton className="h-10 w-full max-w-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
