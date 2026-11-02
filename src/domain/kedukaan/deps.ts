import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Lokasi } from "@/domain/lokasi";
import type { Notifications } from "@/domain/notifications";
import type { Clock } from "@/ports/clock";

export interface KedukaanDeps {
  db: Database;
  clock: Clock;
  /** Admin Platform's moves are staff writes with an Entri Audit. */
  audit: AuditLog;
  /** The Hari Kerja calendar a Konsultasi's first-contact deadline is counted on. */
  lokasi: Pick<Lokasi, "adminPlatformCalendar">;
  /** The family hears every filing and status change by email. */
  notifikasi: Pick<Notifications, "kedukaanStatusBerubah">;
}
