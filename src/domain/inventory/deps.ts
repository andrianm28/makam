import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Tariffs } from "@/domain/tariffs";
import type { Clock } from "@/ports/clock";
import type { FileStore } from "@/ports/file-store";

export interface InventoryDeps {
  db: Database;
  clock: Clock;
  /** Every Denah write records an Entri Audit here. */
  audit: AuditLog;
  /** The private FileStore for a Blok's site-plan photo. */
  files: FileStore;
  /** Jenis Makam are defined by the Tariffs module; a Petak or Kavling Keluarga only ever carries one that belongs to its own Lokasi. */
  tariffs: Pick<Tariffs, "asStaff">;
}
