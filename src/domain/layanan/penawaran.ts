import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { wibDateOf } from "@/lib/time/jakarta";
import { layananKatalogResource, lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { LayananDeps } from "./deps";
import { layananPenawaran, layananVarian } from "./schema";
import { findVarian, type VarianLayanan } from "./varian";

/**
 * Which Layanan a place offers, and Admin Platform's hand-set "boleh di TPU DKI"
 * mark on a variant (spec, Layanan > Catalog; decision 2026-09-25,
 * clarification 8: the mark is set by hand, no Pemda rule is encoded).
 *
 * A Lokasi Mitra's offer is a row of this module, kept with the moment it
 * stopped when it does; a TPU offers nothing that is not marked. The price of
 * an offered variant is a versioned tariff (the Tariffs module): an offered
 * variant without a price in force is not offered, so there is no free pricing
 * (see `penawaranLokasi` / `penawaranTpu`).
 */

export type TawarkanLayananResult = { ok: true } | WriteRefusal | { ok: false; reason: "tidak_ditemukan" };

export type StopLayananResult = { ok: true } | WriteRefusal | { ok: false; reason: "tidak_ditawarkan" };

export type TandaiBolehDiTpuResult = { ok: true; varian: VarianLayanan } | WriteRefusal | { ok: false; reason: "tidak_ditemukan" };

const idSchema = z.uuid();
const reasonOf = (reason: string | null): string | null => reason?.trim() || null;

/** Admin Platform switches one Layanan variant on at a Lokasi Mitra; audited on that Lokasi. */
export async function tawarkanLayanan(deps: LayananDeps, by: Actor, lokasiId: string, layananVariantId: string, input: { reason: string | null }): Promise<TawarkanLayananResult> {
  // Defence in depth behind guarded(): the module checks the actor itself, before anything else.
  const refusal = writeRefusal(by, "layanan.tawarkan", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  if (!idSchema.safeParse(lokasiId).success || !idSchema.safeParse(layananVariantId).success) {
    return { ok: false, reason: "tidak_ditemukan" };
  }
  const now = deps.clock.now();

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const variant = await findVarian(tx, layananVariantId);
    if (!variant) return { ok: false as const, reason: "tidak_ditemukan" as const };
    // The offering this one replaces: a Lokasi Mitra that stopped a variant keeps
    // its row, so offering it again is a change, and the log says so.
    const [sebelumnya] = await tx
      .select({ berhentiPada: layananPenawaran.stoppedAt })
      .from(layananPenawaran)
      .where(and(eq(layananPenawaran.lokasiId, lokasiId), eq(layananPenawaran.layananVariantId, layananVariantId)))
      .limit(1);
    // Offering a variant a Lokasi already offers is the same offering: the row comes back, never stopped.
    await tx
      .insert(layananPenawaran)
      .values({ lokasiId, layananVariantId, createdAt: now, createdByAccountId: by.accountId })
      .onConflictDoUpdate({
        target: [layananPenawaran.lokasiId, layananPenawaran.layananVariantId],
        set: { stoppedAt: null, stoppedByAccountId: null },
      });
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "layanan.tawarkan",
      entity: { kind: "layanan_varian", id: layananVariantId },
      lokasiId,
      before: sebelumnya?.berhentiPada ? { berhentiPada: wibDateOf(sebelumnya.berhentiPada) } : null,
      after: { name: variant.name },
      reason: reasonOf(input.reason),
    });
    return { ok: true as const };
  });
}

/** Admin Platform stops a Lokasi Mitra offering a Layanan variant; audited on that Lokasi. */
export async function stopLayanan(deps: LayananDeps, by: Actor, lokasiId: string, layananVariantId: string, input: { reason: string | null }): Promise<StopLayananResult> {
  const refusal = writeRefusal(by, "layanan.tawarkan", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  if (!idSchema.safeParse(layananVariantId).success) return { ok: false, reason: "tidak_ditawarkan" };
  const now = deps.clock.now();

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const variant = await findVarian(tx, layananVariantId);
    if (!variant) return { ok: false as const, reason: "tidak_ditawarkan" as const };
    const [row] = await tx
      .update(layananPenawaran)
      .set({ stoppedAt: now, stoppedByAccountId: by.accountId })
      .where(
        and(eq(layananPenawaran.lokasiId, lokasiId), eq(layananPenawaran.layananVariantId, layananVariantId), isNull(layananPenawaran.stoppedAt)),
      )
      .returning();
    if (!row) return { ok: false as const, reason: "tidak_ditawarkan" as const };
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "layanan.stop_tawarkan",
      entity: { kind: "layanan_varian", id: layananVariantId },
      lokasiId,
      before: { name: variant.name },
      after: { berhentiPada: wibDateOf(now) },
      reason: reasonOf(input.reason),
    });
    return { ok: true as const };
  });
}

/**
 * Admin Platform marks a Layanan variant "boleh di TPU DKI" by hand, or takes the
 * mark off: only a marked variant is offered at a TPU, and nothing here decides
 * which. Audited.
 */
export async function tandaiBolehDiTpu(deps: LayananDeps, by: Actor, layananVariantId: string, input: { boleh: boolean; reason: string | null }): Promise<TandaiBolehDiTpuResult> {
  const refusal = writeRefusal(by, "layanan.kelola", layananKatalogResource());
  if (refusal) return refusal;
  if (!idSchema.safeParse(layananVariantId).success) return { ok: false, reason: "tidak_ditemukan" };

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const before = await findVarian(tx, layananVariantId);
    if (!before) return { ok: false as const, reason: "tidak_ditemukan" as const };
    const [row] = await tx.update(layananVarian).set({ bolehDiTpu: input.boleh }).where(eq(layananVarian.id, layananVariantId)).returning();
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "layanan.tandai_tpu_dki",
      entity: { kind: "layanan_varian", id: layananVariantId },
      before: { name: before.name, bolehDiTpu: before.bolehDiTpu },
      after: { name: row.name, bolehDiTpu: row.bolehDiTpu },
      reason: reasonOf(input.reason),
    });
    return { ok: true as const, varian: { id: row.id, layananId: row.layananId, name: row.name, bolehDiTpu: row.bolehDiTpu } };
  });
}
