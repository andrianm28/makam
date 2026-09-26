import { z } from "zod";

/** Every id in this module (a Jenis Makam, a Lokasi Mitra) is a UUID. */
export const idSchema = z.uuid();

/** Whether `id` has the shape of an id; anything else names nothing, so a read finds nothing. */
export function isUuid(id: string): boolean {
  return idSchema.safeParse(id).success;
}
