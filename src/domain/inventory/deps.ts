import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Lokasi } from "@/domain/lokasi";
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
  /**
   * Whether a Lokasi Mitra is listed with Pemesanan Terencana on and its own
   * tumpang rules (the public Denah read), and its Perpanjangan policy,
   * including the Masa Tenggang length the "Hak Pakai in masa tenggang" row
   * counts from (story 130).
   */
  lokasi: Pick<Lokasi, "publicLokasiMitra" | "aturanPerpanjanganOf">;
  /**
   * Whether any Pemesanan ever named one of these plots. Pemesanan owns those
   * tables and refers to a Petak with no foreign key, so removing a Blok asks it
   * (composed with `pernahMenyebutPetakAtauKavling` from the Pemesanan module).
   */
  pemesananPernahMenyebut: (db: Database, ids: { petakIds: string[]; kavlingIds: string[] }) => Promise<boolean>;
}
