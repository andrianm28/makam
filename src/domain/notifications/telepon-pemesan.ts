/**
 * "Telepon Pemesan" (ticket 20): the call row opened when a money message
 * finally fails or when a family must act and the order has no email, closed
 * once a staff member logs the call. Only Admin Platform opens the Antrean
 * and logs calls here; ticket 23 routes Lokasi-work subjects to the Antrean
 * Lokasi, tickets 29 and 42 open rows for their own subjects.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import { antreanResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { Clock } from "@/ports/clock";
import { notificationsTeleponPemesan, teleponHasil, teleponSebab } from "./schema";

export interface TeleponPemesanDeps {
  db: Database;
  clock: Clock;
  audit: AuditLog;
}

export interface TeleponPemesan {
  id: string;
  subjectKind: string;
  subjectId: string;
  nomorTagihan: string | null;
  sebab: (typeof teleponSebab)[number];
  dibukaPada: Date;
}

export const catatPanggilanSchema = z.object({
  teleponId: z.uuid(),
  hasil: z.enum(teleponHasil),
  catatan: z.string().trim().max(500).optional(),
});
export type CatatPanggilanInput = z.infer<typeof catatPanggilanSchema>;

export type CatatPanggilanResult =
  | { ok: true; telepon: TeleponPemesan & { ditutupPada: Date } }
  | WriteRefusal
  | { ok: false; reason: "telepon_tidak_valid" | "tidak_ditemukan" | "sudah_ditutup" };

export interface BukaTeleponPemesan {
  subjectKind: string;
  subjectId: string;
  nomorTagihan?: string | null;
  sebab: (typeof teleponSebab)[number];
  pesanId?: string | null;
}

/**
 * Opens a "Telepon Pemesan" row, unless one is already open for the subject:
 * retries and re-announcements never stack rows for the same Tagihan. The
 * open row is unique in the database, so two ticks escalating the same failed
 * message at once still leave the Antrean one row.
 */
export async function bukaTeleponPemesan(
  tx: Database,
  now: Date,
  input: BukaTeleponPemesan,
): Promise<{ id: string; baru: boolean }> {
  const inserted = await tx
    .insert(notificationsTeleponPemesan)
    .values({
      subjectKind: input.subjectKind,
      subjectId: input.subjectId,
      nomorTagihan: input.nomorTagihan ?? null,
      sebab: input.sebab,
      pesanId: input.pesanId ?? null,
      dibukaPada: now,
    })
    .onConflictDoNothing()
    .returning({ id: notificationsTeleponPemesan.id });
  if (inserted[0]) return { id: inserted[0].id, baru: true };
  const [open] = await tx
    .select({ id: notificationsTeleponPemesan.id })
    .from(notificationsTeleponPemesan)
    .where(
      and(
        eq(notificationsTeleponPemesan.subjectKind, input.subjectKind),
        eq(notificationsTeleponPemesan.subjectId, input.subjectId),
        isNull(notificationsTeleponPemesan.ditutupPada),
      ),
    )
    .limit(1);
  if (!open) throw new Error("a Telepon Pemesan row for an open subject just vanished");
  return { id: open.id, baru: false };
}

/** Every open "Telepon Pemesan" row, oldest first: what the Antrean's Tier 2 row reads. */
export async function teleponPemesanTerbuka(db: Database): Promise<TeleponPemesan[]> {
  const rows = await db
    .select()
    .from(notificationsTeleponPemesan)
    .where(isNull(notificationsTeleponPemesan.ditutupPada))
    .orderBy(asc(notificationsTeleponPemesan.dibukaPada), asc(notificationsTeleponPemesan.id));
  return rows.map(toTeleponPemesan);
}

/**
 * An Admin Platform logs the call: the row closes. Audited, like every other
 * staff write on the Antrean.
 */
export async function catatPanggilan(
  deps: TeleponPemesanDeps,
  by: Actor,
  input: CatatPanggilanInput,
): Promise<CatatPanggilanResult> {
  const refusal = writeRefusal(by, "telepon_pemesan.catat", antreanResource());
  if (refusal) return refusal;
  const parsed = catatPanggilanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "telepon_tidak_valid" };
  const now = deps.clock.now();
  const closed = await deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [row] = await tx
      .select()
      .from(notificationsTeleponPemesan)
      .where(eq(notificationsTeleponPemesan.id, parsed.data.teleponId));
    if (!row) return { ok: false as const, reason: "tidak_ditemukan" as const };
    if (row.ditutupPada) return { ok: false as const, reason: "sudah_ditutup" as const };
    await tx
      .update(notificationsTeleponPemesan)
      .set({
        ditutupPada: now,
        hasil: parsed.data.hasil,
        catatan: parsed.data.catatan ?? null,
        dicatatOleh: by.accountId,
      })
      .where(eq(notificationsTeleponPemesan.id, row.id));
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "telepon_pemesan.catat_panggilan",
      entity: { kind: "telepon_pemesan", id: row.id },
      before: null,
      after: { hasil: parsed.data.hasil },
      reason: null,
    });
    return { ok: true as const, ditutupPada: now };
  });
  if (!closed.ok) return closed;
  const [row] = await deps.db
    .select()
    .from(notificationsTeleponPemesan)
    .where(eq(notificationsTeleponPemesan.id, parsed.data.teleponId));
  return { ok: true, telepon: { ...toTeleponPemesan(row), ditutupPada: closed.ditutupPada } };
}

function toTeleponPemesan(row: typeof notificationsTeleponPemesan.$inferSelect): TeleponPemesan {
  return {
    id: row.id,
    subjectKind: row.subjectKind,
    subjectId: row.subjectId,
    nomorTagihan: row.nomorTagihan,
    sebab: row.sebab,
    dibukaPada: row.dibukaPada,
  };
}
