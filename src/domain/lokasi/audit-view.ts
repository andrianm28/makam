import type { AuditEntry, AuditLog, AuditSnapshot } from "@/domain/audit";
import { auditLogLokasiResource, auditLogResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { isLokasiId } from "./lokasi-mitra";

export type LokasiAuditLogResult = { ok: true; entries: AuditEntry[] } | WriteRefusal;

/**
 * One Lokasi Mitra's Audit Log as its Admin Lokasi see it (Admin Platform may
 * read it too), oldest first: Admin Platform's changes to its record, bank
 * account, status, tariffs and Admin Lokasi included; Catatan Internal and
 * Antrean claims left out. What is Admin Platform's alone stays out of the
 * snapshots: a bank account number shows only its last 4 digits, and an
 * agreement upload shows its signing date but never the scan's file key.
 */
export async function lokasiAuditLog(
  deps: { audit: AuditLog },
  by: Actor,
  lokasiId: string,
): Promise<LokasiAuditLogResult> {
  const refusal = writeRefusal(by, "audit.lihat", auditLogLokasiResource(lokasiId));
  if (refusal) return refusal;
  if (!isLokasiId(lokasiId)) return { ok: true, entries: [] };
  const entries = await deps.audit.entriesForLokasi(lokasiId);
  return { ok: true, entries: entries.map(forAdminLokasi) };
}

/** One Lokasi Mitra's whole Audit Log for Admin Platform, oldest first: nothing hidden or masked. */
export async function fullLokasiAuditLog(
  deps: { audit: AuditLog },
  by: Actor,
  lokasiId: string,
): Promise<LokasiAuditLogResult> {
  const refusal = writeRefusal(by, "audit.lihat", auditLogResource());
  if (refusal) return refusal;
  if (!isLokasiId(lokasiId)) return { ok: true, entries: [] };
  return { ok: true, entries: await deps.audit.allEntriesForLokasi(lokasiId) };
}

function forAdminLokasi(entry: AuditEntry): AuditEntry {
  switch (entry.action) {
    case "lokasi.ubah_rekening":
      return { ...entry, before: maskBankAccount(entry.before), after: maskBankAccount(entry.after) };
    case "lokasi.unggah_perjanjian":
      return { ...entry, before: withoutScanFileKey(entry.before), after: withoutScanFileKey(entry.after) };
    default:
      return entry;
  }
}

/** `{ bankAccount: { accountNumber: "7123456789", … } }` becomes `accountNumber: "****6789"`. */
function maskBankAccount(snapshot: AuditSnapshot): AuditSnapshot {
  const bankAccount = snapshot?.bankAccount as { accountNumber?: unknown } | null | undefined;
  if (!bankAccount || typeof bankAccount.accountNumber !== "string") return snapshot;
  return { ...snapshot, bankAccount: { ...bankAccount, accountNumber: `****${bankAccount.accountNumber.slice(-4)}` } };
}

function withoutScanFileKey(snapshot: AuditSnapshot): AuditSnapshot {
  const agreement = snapshot?.agreement as Record<string, unknown> | null | undefined;
  if (!agreement) return snapshot;
  const { scanFileKey: _hidden, ...rest } = agreement;
  return { ...snapshot, agreement: rest };
}
