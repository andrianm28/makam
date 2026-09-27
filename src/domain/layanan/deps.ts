import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Lokasi } from "@/domain/lokasi";
import type { Tariffs } from "@/domain/tariffs";
import type { Clock } from "@/ports/clock";

export interface LayananDeps {
  db: Database;
  clock: Clock;
  /** Every catalog, offering and Paket write records an Entri Audit here. */
  audit: AuditLog;
  /** A Lokasi Mitra is looked up through the Lokasi module, never its table: by a staff actor, or whether it is listed. */
  lokasi: Pick<Lokasi, "lokasiMitra" | "isTerverifikasi">;
  /**
   * Every price of a Layanan variant is a versioned tariff: quoted here, read for
   * the screens, and written through the Tariffs module — `within(tx)` so an
   * offering and its price commit or roll back together.
   */
  tariffs: Pick<Tariffs, "quote" | "hargaLayananLokasi" | "hargaLayananLokasiSemua" | "within">;
}
