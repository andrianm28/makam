import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Lokasi } from "@/domain/lokasi";
import type { Clock } from "@/ports/clock";

export interface TariffDeps {
  db: Database;
  clock: Clock;
  /** Every tariff write records an Entri Audit here. */
  audit: AuditLog;
  /** A Lokasi Mitra is looked up through the Lokasi module, never its table: by a staff actor, or whether it is listed. */
  lokasi: Pick<Lokasi, "lokasiMitra" | "isTerverifikasi">;
}
