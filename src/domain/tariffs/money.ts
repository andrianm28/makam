import { z } from "zod";
import { wibDateOf } from "@/lib/time/jakarta";

/** An amount of money everywhere in this module: `Rupiah`, whole rupiah from Rp 0 to Rp 100.000.000.000. */
export { rupiahSchema, type Rupiah } from "@/lib/rupiah";

/** An effective date: a real WIB calendar date, "YYYY-MM-DD". */
export const effectiveOnSchema = z.iso.date();

export type EffectiveDateRefusal = { ok: false; reason: "tanggal_berlaku_lampau" };
export type InvalidTariff = { ok: false; reason: "tarif_tidak_valid" };

/** An effective date may be today or later (WIB): entering a tariff never rewrites a past price. */
export function effectiveDateRefusal(effectiveOn: string, now: Date): EffectiveDateRefusal | null {
  return effectiveOn < wibDateOf(now) ? { ok: false, reason: "tanggal_berlaku_lampau" } : null;
}
