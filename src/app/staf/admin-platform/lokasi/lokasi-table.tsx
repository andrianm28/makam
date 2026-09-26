"use client";

import { MapPinnedIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/makam/data-table";
import { EmptyState } from "@/components/makam/empty-state";
import { StatusBadge, statusVocabulary } from "@/components/makam/status-badge";
import { LOKASI_LIST_DEFAULT_PAGE_SIZE, LOKASI_MITRA_STATUSES, type LokasiMitraListRow, type LokasiMitraStatus } from "@/domain/lokasi";

const BASE = "/staf/admin-platform/lokasi";

const statusOptions = LOKASI_MITRA_STATUSES.map((key) => ({ value: key, label: statusVocabulary[key].label }));

const columns: DataTableColumn<LokasiMitraListRow>[] = [
  {
    id: "name",
    header: "Lokasi Mitra",
    cell: ({ row }) => (
      <Link
        href={`${BASE}/${row.original.id}`}
        className="flex flex-col gap-0.5 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="font-medium text-foreground hover:underline hover:underline-offset-4">{row.original.name}</span>
        <span className="text-small text-muted-foreground">{row.original.city}</span>
      </Link>
    ),
  },
  { accessorKey: "pengelolaName", header: "Pengelola" },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
];

/**
 * The Lokasi Mitra list's DataTable: search, status filter and pagination are
 * driven by the URL (`searchLokasiMitra`, a server-side query), not by the
 * table itself.
 */
export function LokasiMitraTable({
  rows,
  total,
  page,
  pageCount,
  search,
  status,
  isFiltering,
}: {
  rows: LokasiMitraListRow[];
  total: number;
  page: number;
  pageCount: number;
  search: string;
  status: LokasiMitraStatus | undefined;
  isFiltering: boolean;
}) {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState(search);
  const [syncedSearch, setSyncedSearch] = useState(search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The URL is the source of truth; keep the input in step when it changes from outside typing (e.g. "Hapus pencarian").
  if (search !== syncedSearch) {
    setSyncedSearch(search);
    setSearchValue(search);
  }

  function navigate(next: { q?: string; status?: string; page?: number }) {
    const params = new URLSearchParams();
    const q = next.q ?? searchValue;
    const nextStatus = next.status ?? status ?? "";
    const nextPage = next.page ?? page;
    if (q.trim()) params.set("q", q);
    if (nextStatus) params.set("status", nextStatus);
    if (nextPage > 1) params.set("page", String(nextPage));
    const query = params.toString();
    router.push(query ? `${BASE}?${query}` : BASE, { scroll: false });
  }

  function onSearchChange(value: string) {
    setSearchValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => navigate({ q: value, page: 1 }), 300);
  }

  return (
    <DataTable
      caption="Daftar Lokasi Mitra"
      columns={columns}
      data={rows}
      densityToggle
      searchPlaceholder="Cari nama, kota atau pengelola"
      filter={{ columnId: "status", label: "Filter status", allLabel: "Semua status", options: statusOptions }}
      empty={
        <EmptyState
          icon={MapPinnedIcon}
          title="Belum ada Lokasi Mitra"
          description="Lokasi Mitra baru berstatus Belum Tayang sampai profil, perjanjian, rekening, kebijakan dan Admin Lokasi-nya lengkap."
        />
      }
      rowActions={(row) => [
        { label: "Buka", onSelect: () => router.push(`${BASE}/${row.id}`) },
        { label: "Tarif", onSelect: () => router.push(`${BASE}/${row.id}/tarif`) },
        { label: "Audit Log", onSelect: () => router.push(`${BASE}/${row.id}/audit-log`) },
      ]}
      manual={{
        search: searchValue,
        onSearchChange,
        filterValue: status ?? "",
        onFilterChange: (value) => navigate({ status: value, page: 1 }),
        page,
        pageCount,
        onPageChange: (next) => navigate({ page: next }),
        pageSize: LOKASI_LIST_DEFAULT_PAGE_SIZE,
        total,
        isFiltering,
      }}
    />
  );
}
