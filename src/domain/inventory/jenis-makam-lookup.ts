import type { InventoryDeps } from "./deps";
import type { Actor } from "@/domain/identity";

/** Whether `jenisMakamId` is a Jenis Makam of `lokasiId` (Tariffs module), as this actor may see it. */
export async function jenisMakamBelongsToLokasi(deps: InventoryDeps, by: Actor, lokasiId: string, jenisMakamId: string): Promise<boolean> {
  const tariffs = await deps.tariffs.asStaff(by).lokasiTariffs(lokasiId, deps.clock.now());
  return tariffs.jenisMakam.some((jenisMakam) => jenisMakam.id === jenisMakamId);
}
