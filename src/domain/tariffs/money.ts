import { z } from "zod";
import { wibDateOf } from "@/lib/time/jakarta";

/**
 * An amount of money: whole rupiah, zero or more, never a float. Every sum of
 * such amounts is exact (all stay below Number.MAX_SAFE_INTEGER).
 */
export const rupiahSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/** An effective date: a real WIB calendar date, "YYYY-MM-DD". */
export const effectiveOnSchema = z.iso.date();

export type EffectiveDateRefusal = { ok: false; reason: "tanggal_berlaku_lampau" };
export type InvalidTariff = { ok: false; reason: "tarif_tidak_valid" };

/** An effective date may be today or later (WIB): entering a tariff never rewrites a past price. */
export function effectiveDateRefusal(effectiveOn: string, now: Date): EffectiveDateRefusal | null {
  return effectiveOn < wibDateOf(now) ? { ok: false, reason: "tanggal_berlaku_lampau" } : null;
}
