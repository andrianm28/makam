import { asc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { wibDateOf } from "@/lib/time/jakarta";
import { hariLiburNasionalResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { tanggalSchema, type Tanggal } from "./jam-operasional-schema";
import { actingRole, type LokasiDeps, type NotFound } from "./lokasi-mitra";
import { lokasiHariLiburNasional } from "./schema";
import { adminPlatformCalendar, type HariLiburNasional } from "./working-time";

/** The most characters a Hari Libur Nasional's name may be typed in. */
export const HARI_LIBUR_NASIONAL_NAME_MAX = 120;

/** A valid Hari Libur Nasional: a real date and a name. */
export const hariLiburNasionalSchema = z.object({
  date: tanggalSchema,
  name: z.string().trim().min(1).max(HARI_LIBUR_NASIONAL_NAME_MAX),
});

/** A Hari Libur Nasional to take off the list: its date, and optionally why. */
export const hapusHariLiburSchema = z.object({ date: tanggalSchema, reason: z.string().trim().max(500) });

/** Both shapes as a form or a Server Action holds them. */
export type HariLiburNasionalInput = z.infer<typeof hariLiburNasionalSchema>;
export type HapusHariLiburInput = z.infer<typeof hapusHariLiburSchema>;

/** The Hari Libur Nasional list Admin Platform keeps, by date. */
export async function hariLiburNasional(deps: Pick<LokasiDeps, "db">): Promise<HariLiburNasional[]> {
  return deps.db
    .select({ date: lokasiHariLiburNasional.date, name: lokasiHariLiburNasional.name })
    .from(lokasiHariLiburNasional)
    .orderBy(asc(lokasiHariLiburNasional.date));
}

/** The first Hari Libur Nasional on the list from today (WIB, on the Clock), today included; null when none is ahead. */
export async function nextHariLiburNasional(deps: Pick<LokasiDeps, "db" | "clock">): Promise<HariLiburNasional | null> {
  const [next] = await deps.db
    .select({ date: lokasiHariLiburNasional.date, name: lokasiHariLiburNasional.name })
    .from(lokasiHariLiburNasional)
    .where(gte(lokasiHariLiburNasional.date, wibDateOf(deps.clock.now())))
    .orderBy(asc(lokasiHariLiburNasional.date))
    .limit(1);
  return next ?? null;
}

/** The Admin Platform Hari Kerja calendar: Monday–Friday minus the Hari Libur Nasional on the list. */
export async function readAdminPlatformCalendar(deps: Pick<LokasiDeps, "db">) {
  return adminPlatformCalendar(await hariLiburNasional(deps));
}

export type AddHariLiburNasionalResult =
  | { ok: true }
  | WriteRefusal
  | { ok: false; reason: "hari_libur_tidak_valid" | "hari_libur_sudah_ada" };

/** Admin Platform adds a Hari Libur Nasional (a real date, a name) to the list, audited. */
export async function addHariLiburNasional(
  deps: LokasiDeps,
  by: Actor,
  input: HariLiburNasional,
): Promise<AddHariLiburNasionalResult> {
  const refusal = writeRefusal(by, "hari_libur.ubah", hariLiburNasionalResource());
  if (refusal) return refusal;
  const parsed = hariLiburNasionalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "hari_libur_tidak_valid" };
  const libur = parsed.data;
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const inserted = await tx
      .insert(lokasiHariLiburNasional)
      .values({ ...libur, createdAt: deps.clock.now() })
      .onConflictDoNothing()
      .returning({ date: lokasiHariLiburNasional.date });
    if (inserted.length === 0) return { ok: false, reason: "hari_libur_sudah_ada" } as const;
    await record({
      actor: { accountId: by.accountId, role: actingRole(by) },
      action: "hari_libur.tambah",
      entity: { kind: "hari_libur_nasional", id: libur.date },
      before: null,
      after: { ...libur },
      reason: null,
    });
    return { ok: true } as const;
  });
}

export type RemoveHariLiburNasionalResult = { ok: true } | WriteRefusal | NotFound;

/** Admin Platform removes a Hari Libur Nasional from the list (optional reason), audited. */
export async function removeHariLiburNasional(
  deps: LokasiDeps,
  by: Actor,
  input: { date: Tanggal; reason: string | null },
): Promise<RemoveHariLiburNasionalResult> {
  const refusal = writeRefusal(by, "hari_libur.ubah", hariLiburNasionalResource());
  if (refusal) return refusal;
  if (!tanggalSchema.safeParse(input.date).success) return { ok: false, reason: "tidak_ditemukan" };
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [removed] = await tx
      .delete(lokasiHariLiburNasional)
      .where(eq(lokasiHariLiburNasional.date, input.date))
      .returning({ date: lokasiHariLiburNasional.date, name: lokasiHariLiburNasional.name });
    if (!removed) return { ok: false, reason: "tidak_ditemukan" } as const;
    await record({
      actor: { accountId: by.accountId, role: actingRole(by) },
      action: "hari_libur.hapus",
      entity: { kind: "hari_libur_nasional", id: removed.date },
      before: { ...removed },
      after: null,
      reason: input.reason?.trim() || null,
    });
    return { ok: true } as const;
  });
}
