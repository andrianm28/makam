import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import type { AntreanRow } from "@/domain/queues";
import { cn } from "@/lib/utils";
import { formatTanggalJam } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { AmbilForm, CatatanInternalForm, KonfirmasiSyaratTayangForm } from "./row-forms";

/** One Antrean row (spec, Work Queues): its own state, Ambil claim and Catatan Internal thread. */
export async function AntreanRowCard({ row, emailByAccountId }: { row: AntreanRow; emailByAccountId: Map<string, string> }) {
  const actor = await staffMenuActor("admin_platform");
  const { queues } = serverRuntime();
  const catatan = await queues.catatanInternal(actor, row.subjectKind, row.subjectId);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-caption text-muted-foreground">{row.label}</p>
          <Link href={row.href} className="text-body font-medium text-foreground underline-offset-4 hover:underline">
            {row.subjectLabel}
          </Link>
          <p className={cn("text-small", row.pastDeadline ? "text-danger-soft-foreground" : "text-muted-foreground")}>
            {row.deadline
              ? `Tenggat ${formatTanggalJam(row.deadline)}${row.pastDeadline ? " — lewat tenggat" : ""}`
              : "Tidak ada tenggat"}
          </p>
          <p className="text-small text-muted-foreground">
            {row.ambil
              ? `Diambil oleh ${emailByAccountId.get(row.ambil.accountId) ?? row.ambil.accountId}, ${formatTanggalJam(row.ambil.claimedAt)}`
              : "Belum diambil"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <AmbilForm
            type={row.type}
            subjectId={row.subjectId}
            subjectKind={row.subjectKind}
            sudahDiambil={row.ambil !== null}
          />
          {row.type === "lokasi_syarat_tayang_ulang" ? <KonfirmasiSyaratTayangForm lokasiId={row.subjectId} /> : null}
        </div>
      </CardContent>
      <CardContent className="flex flex-col gap-3 border-t pt-(--card-spacing)">
        <p className="text-small font-medium text-foreground">Catatan Internal</p>
        {catatan.length === 0 ? (
          <p className="text-small text-muted-foreground">Belum ada catatan.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {catatan.map((note) => (
              <li key={note.id} className="text-small text-foreground">
                <span className="text-muted-foreground">
                  {formatTanggalJam(note.createdAt)}, {emailByAccountId.get(note.authorAccountId) ?? note.authorAccountId}
                  {" — "}
                </span>
                {note.body}
              </li>
            ))}
          </ul>
        )}
        <CatatanInternalForm subjectKind={row.subjectKind} subjectId={row.subjectId} />
      </CardContent>
    </Card>
  );
}
