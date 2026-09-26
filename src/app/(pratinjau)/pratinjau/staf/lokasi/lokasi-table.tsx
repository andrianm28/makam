"use client";

import { CheckIcon, MinusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DataTable, type DataTableColumn } from "@/components/makam/data-table";
import { StatusBadge, statusVocabulary } from "@/components/makam/status-badge";
import type { MockLokasi } from "../_mock/data";
import { BASE } from "../_shell/nav";
import { usePratinjau } from "../_shell/pratinjau-context";

function Yes({ yes, no }: { yes: boolean; no: string }) {
  return yes ? (
    <span className="inline-flex items-center gap-1.5 text-small text-foreground">
      <CheckIcon className="size-4 text-success" aria-hidden /> Sudah
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-small text-muted-foreground">
      <MinusIcon className="size-4" aria-hidden /> {no}
    </span>
  );
}

const columns: DataTableColumn<MockLokasi>[] = [
  {
    id: "name",
    // Search matches the name and the kota.
    accessorFn: (row) => `${row.name} ${row.kota}`,
    header: "Lokasi Mitra",
    cell: ({ row }) => (
      <Link
        href={`${BASE}/lokasi/${row.original.id}`}
        className="flex flex-col gap-0.5 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="font-medium text-foreground hover:underline hover:underline-offset-4">{row.original.name}</span>
        <span className="text-small text-muted-foreground">{row.original.kota}</span>
      </Link>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    filterFn: "equalsString",
    enableGlobalFilter: false,
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: "jamOperasional",
    header: "Jam Operasional",
    enableGlobalFilter: false,
    cell: ({ row }) => <Yes yes={row.original.jamOperasional} no="Belum diisi" />,
  },
  {
    accessorKey: "tarifDiperiksa",
    header: "Tarif Diperiksa",
    enableGlobalFilter: false,
    cell: ({ row }) => <Yes yes={row.original.tarifDiperiksa} no="Belum" />,
  },
  {
    accessorKey: "adminLokasi",
    header: "Admin Lokasi",
    enableGlobalFilter: false,
    cell: ({ row }) => <span className="tabular-nums">{row.original.adminLokasi}</span>,
  },
  {
    accessorKey: "diubah",
    header: "Terakhir diubah",
    enableGlobalFilter: false,
    cell: ({ row }) => <span className="text-small text-muted-foreground tabular-nums">{row.original.diubah}</span>,
  },
];

const statusOptions = (["belum_tayang", "terverifikasi", "ditangguhkan", "berhenti"] as const).map((key) => ({
  value: key,
  label: statusVocabulary[key].label,
}));

export function LokasiTable({ data }: { data: MockLokasi[] }) {
  const router = useRouter();
  const { density } = usePratinjau();
  return (
    <DataTable
      caption="Daftar Lokasi Mitra"
      columns={columns}
      data={data}
      density={density}
      searchPlaceholder="Cari nama atau kota"
      filter={{ columnId: "status", label: "Filter status", allLabel: "Semua status", options: statusOptions }}
      rowActions={(row) => [
        { label: "Buka", onSelect: () => router.push(`${BASE}/lokasi/${row.id}`) },
        { label: "Ubah Tarif", onSelect: () => router.push(`${BASE}/lokasi/${row.id}?tab=tarif`) },
        { label: "Lihat Audit Log", onSelect: () => router.push(`${BASE}/lokasi/${row.id}?tab=audit-log`) },
        {
          label: row.status === "ditangguhkan" ? "Aktifkan kembali" : "Tangguhkan",
          destructive: row.status !== "ditangguhkan",
          onSelect: () => toast("Pratinjau: tidak ada yang disimpan", { description: `Di aplikasi nyata ini membuka konfirmasi untuk ${row.name}.` }),
        },
      ]}
    />
  );
}
