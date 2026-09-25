import type { AuditEntry, AuditLog } from "@/domain/audit";
import { auditLogLokasiResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { isLokasiId } from "./lokasi-mitra";

export type LokasiAuditLogResult = { ok: true; entries: AuditEntry[] } | WriteRefusal;

/**
 * One Lokasi Mitra's Audit Log as its Admin Lokasi see it (Admin Platform too),
 * oldest first: Admin Platform's changes to its record, bank account, status,
 * tariffs and Admin Lokasi included; Catatan Internal and Antrean claims left out.
 */
export async function lokasiAuditLog(
  deps: { audit: AuditLog },
  by: Actor,
  lokasiId: string,
): Promise<LokasiAuditLogResult> {
  const refusal = writeRefusal(by, "audit.lihat", auditLogLokasiResource(lokasiId));
  if (refusal) return refusal;
  if (!isLokasiId(lokasiId)) return { ok: true, entries: [] };
  return { ok: true, entries: await deps.audit.entriesForLokasi(lokasiId) };
}
