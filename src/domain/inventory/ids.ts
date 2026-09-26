import { z } from "zod";

/** Every id in this module (a Blok, a Petak, a Kavling Keluarga) is a UUID. */
export const idSchema = z.uuid();

/** Whether `id` has the shape of an id; anything else names nothing, so a read finds nothing. */
export function isUuid(id: string): boolean {
  return idSchema.safeParse(id).success;
}

/** Folds a name or number for a uniqueness check: lower case, single internal spaces, trimmed. */
export function foldKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
