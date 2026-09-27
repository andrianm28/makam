"use client";

import { DataTable, type DataTableColumn } from "@/components/makam/data-table";
import { StatusBadge, type StatusKey } from "@/components/makam/status-badge";

interface ContohBaris {
  nama: string;
  status: StatusKey;
}

const contoh: ContohBaris[] = [
  { nama: "Makam Wakaf Al-Ikhlas", status: "terverifikasi" },
  { nama: "TPU Keluarga Sentosa", status: "belum_tayang" },
  { nama: "Taman Damai Abadi", status: "ditangguhkan" },
];

const columns: DataTableColumn<ContohBaris>[] = [
  { accessorKey: "nama", header: "Nama" },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
];

/**
 * `DataTable` needs functions in its column defs and row actions, which
 * cannot cross the Server → Client boundary as props: this small, entirely
 * self-contained demo is the one place the Katalog Desain page needs a
 * client component of its own.
 */
export function DataTableDemo() {
  return (
    <DataTable
      columns={columns}
      data={contoh}
      searchPlaceholder="Cari Lokasi Mitra"
      caption="Contoh DataTable dengan tiga baris"
      rowActions={() => [{ label: "Lihat", onSelect: () => {} }]}
    />
  );
}
