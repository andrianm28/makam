import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

/** One Lokasi Mitra's Audit Log, oldest first (already filtered by the Lokasi module). */
export function LokasiAuditLogTable({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">Belum ada Entri Audit.</p>;
  return (
    <Table aria-label="Audit Log Lokasi">
      <TableHeader>
        <TableRow>
          <TableHead>Waktu</TableHead>
          <TableHead>Oleh</TableHead>
          <TableHead>Perubahan</TableHead>
          <TableHead>Sebelum</TableHead>
          <TableHead>Sesudah</TableHead>
          <TableHead>Alasan</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell className="whitespace-nowrap">{formatWib(entry.at)}</TableCell>
            <TableCell>{auditActorLabel(entry.actor.role)}</TableCell>
            <TableCell>{auditActionLabels[entry.action] ?? entry.action}</TableCell>
            <TableCell className="max-w-xs whitespace-normal break-words text-xs">{describe(entry.before)}</TableCell>
            <TableCell className="max-w-xs whitespace-normal break-words text-xs">{describe(entry.after)}</TableCell>
            <TableCell className="whitespace-normal">{entry.reason ?? "–"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
