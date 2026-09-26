"use client";

import { FileClockIcon } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/makam/data-table";
import { EmptyState } from "@/components/makam/empty-state";
import type { AuditEntry, AuditSnapshot } from "@/domain/audit";
import { formatWib } from "@/lib/time/jakarta";
import { auditActionLabels, auditActorLabel } from "@/lib/lokasi-labels";

/** A snapshot as short readable text: `key: value` pairs, nested values as JSON. */
function describe(snapshot: AuditSnapshot): string {
  if (!snapshot) return "–";
  return Object.entries(snapshot)
    .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join("; ");
}

const columns: DataTableColumn<AuditEntry>[] = [
  {
    id: "waktu",
    accessorFn: (entry) => formatWib(entry.at),
    header: "Waktu",
    enableGlobalFilter: false,
    cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{formatWib(row.original.at)}</span>,
  },
  {
    id: "oleh",
    accessorFn: (entry) => auditActorLabel(entry.actor.role),
    header: "Oleh",
  },
  {
    id: "perubahan",
    accessorFn: (entry) => auditActionLabels[entry.action] ?? entry.action,
    header: "Perubahan",
  },
  {
    id: "sebelum",
    accessorFn: (entry) => describe(entry.before),
    header: "Sebelum",
    enableGlobalFilter: false,
    cell: ({ row }) => <span className="block max-w-xs text-small break-words whitespace-normal">{describe(row.original.before)}</span>,
  },
  {
    id: "sesudah",
    accessorFn: (entry) => describe(entry.after),
    header: "Sesudah",
    enableGlobalFilter: false,
    cell: ({ row }) => <span className="block max-w-xs text-small break-words whitespace-normal">{describe(row.original.after)}</span>,
  },
  {
    id: "alasan",
    accessorFn: (entry) => entry.reason ?? "",
    header: "Alasan",
    cell: ({ row }) => <span className="block whitespace-normal">{row.original.reason ?? "–"}</span>,
  },
];

/** One Lokasi Mitra's Audit Log, oldest first (already filtered by the Lokasi module). */
export function LokasiAuditLogTable({ entries }: { entries: AuditEntry[] }) {
  return (
    <DataTable
      caption="Audit Log Lokasi"
      columns={columns}
      data={entries}
      pageSize={15}
      searchPlaceholder="Cari oleh, perubahan atau alasan"
      empty={
        <EmptyState icon={FileClockIcon} title="Belum ada Entri Audit" description="Setiap perubahan pada Lokasi ini akan tercatat di sini." />
      }
    />
  );
}
