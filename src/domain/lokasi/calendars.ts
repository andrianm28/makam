import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { hariLiburNasionalResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { scheduleOf } from "./jam-operasional";
import { actingRole, type LokasiDeps, type NotFound } from "./lokasi-mitra";
import { lokasiNationalHoliday } from "./schema";
import type { NationalHoliday, WorkingDayCalendar } from "./working-time";

const nationalHolidaySchema = z.object({ date: z.iso.date(), name: z.string().trim().min(1).max(120) });

/** The national holiday list Admin Platform keeps, by date. */
export async function nationalHolidays(deps: Pick<LokasiDeps, "db">): Promise<NationalHoliday[]> {
  return deps.db
    .select({ date: lokasiNationalHoliday.date, name: lokasiNationalHoliday.name })
    .from(lokasiNationalHoliday)
    .orderBy(asc(lokasiNationalHoliday.date));
}

/** The Admin Platform working-day calendar: Monday–Friday minus the national holidays on the list. */
export async function adminPlatformCalendar(deps: Pick<LokasiDeps, "db">): Promise<WorkingDayCalendar> {
  return { kind: "admin_platform", nationalHolidays: await nationalHolidays(deps) };
}

/** A Lokasi Mitra's working-day calendar (its Jam Operasional), or null for no such Lokasi. */
export async function lokasiCalendar(deps: Pick<LokasiDeps, "db">, lokasiId: string): Promise<WorkingDayCalendar | null> {
  const jamOperasional = await scheduleOf(deps, lokasiId);
  return jamOperasional ? { kind: "lokasi", jamOperasional } : null;
}

export type AddNationalHolidayResult =
  | { ok: true }
  | WriteRefusal
  | { ok: false; reason: "hari_libur_tidak_valid" | "hari_libur_sudah_ada" };

/** Admin Platform adds a national holiday (a real date, a name) to the list, audited. */
export async function addNationalHoliday(
  deps: LokasiDeps,
  by: Actor,
  input: NationalHoliday,
): Promise<AddNationalHolidayResult> {
  const refusal = writeRefusal(by, "hari_libur.ubah", hariLiburNasionalResource());
  if (refusal) return refusal;
  const parsed = nationalHolidaySchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "hari_libur_tidak_valid" };
  const holiday = parsed.data;
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const inserted = await tx
      .insert(lokasiNationalHoliday)
      .values({ ...holiday, createdAt: deps.clock.now() })
      .onConflictDoNothing()
      .returning({ date: lokasiNationalHoliday.date });
    if (inserted.length === 0) return { ok: false, reason: "hari_libur_sudah_ada" } as const;
    await record({
      actor: { accountId: by.accountId, role: actingRole(by) },
      action: "hari_libur.tambah",
      entity: { kind: "hari_libur_nasional", id: holiday.date },
      before: null,
      after: { ...holiday },
      reason: null,
    });
    return { ok: true } as const;
  });
}

export type RemoveNationalHolidayResult = { ok: true } | WriteRefusal | NotFound;

/** Admin Platform removes a national holiday from the list (optional reason), audited. */
export async function removeNationalHoliday(
  deps: LokasiDeps,
  by: Actor,
  input: { date: string; reason: string | null },
): Promise<RemoveNationalHolidayResult> {
  const refusal = writeRefusal(by, "hari_libur.ubah", hariLiburNasionalResource());
  if (refusal) return refusal;
  if (!z.iso.date().safeParse(input.date).success) return { ok: false, reason: "tidak_ditemukan" };
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [removed] = await tx
      .delete(lokasiNationalHoliday)
      .where(eq(lokasiNationalHoliday.date, input.date))
      .returning({ date: lokasiNationalHoliday.date, name: lokasiNationalHoliday.name });
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
