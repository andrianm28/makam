import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Fieldwork } from "@/domain/fieldwork";
import type { Lokasi } from "@/domain/lokasi";
import type { Notifications } from "@/domain/notifications";
import type { Clock } from "@/ports/clock";
import type { FileStore } from "@/ports/file-store";

/**
 * What the Wakaf module needs from its neighbours: only their public functions, never their tables.
 * The Survei Wakaf Tugas Lapangan is Field Work's (created inside the status change's transaction),
 * the 3 working days of first contact count on Admin Platform's calendar (Lokasi), the documents
 * live only in the private FileStore, and every status change is told to the Wakif by Notifications.
 * Money never enters: there is no Billing here, and no Tagihan can be attached to a Pengajuan.
 */
export interface WakafDeps {
  db: Database;
  clock: Clock;
  files: FileStore;
  audit: AuditLog;
  lokasi: Pick<Lokasi, "adminPlatformCalendar">;
  fieldwork: Pick<Fieldwork, "within">;
  notifikasi: Pick<Notifications, "wakafStatusBerubah">;
}
