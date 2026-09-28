/**
 * "Telepon Pemesan" (ticket 20): the call row opened when a money message
 * finally fails or when a family must act and the order has no email, closed
 * once a staff member logs the call. Ticket 23 routes Lokasi-work subjects
 * here too, with the `lokasiId` that puts the row in the **Antrean Lokasi** and
 * in the hands of that Lokasi's own Admin Lokasi; tickets 29 and 42 open rows
 * for their own subjects.
 *
 * Today a Lokasi-work subject is a Saat Duka order's own message (placed,
 * confirmed, or an order with no email at all). The Bukti Pemesanan, the
 * Perpanjangan documents, the Hak Pakai expiry and the Lokasi Layanan senders
 * arrive with their own tickets, and each of them opens its row the same way:
 * queue with the Lokasi's `lokasiId`.
 */
import { and, asc, count, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import { antreanResource, lokasiMitraResource, staffRoles, writeRefusal, type Actor, type StaffRole, type WriteRefusal } from "@/domain/identity";
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
  nomorPemesanan: string | null;
  /** The Lokasi Mitra whose own staff makes this call; null for Admin Platform's money subjects. */
  lokasiId: string | null;
  /** What the staff member has to tell the family, in one sentence. */
  perihal: string | null;
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
  nomorPemesanan?: string | null;
  /** The Lokasi Mitra whose Admin Lokasi makes this call; null leaves the row with Admin Platform. */
  lokasiId?: string | null;
  /** What the staff member has to tell the family, in one sentence. */
  perihal?: string | null;
  sebab: (typeof teleponSebab)[number];
  pesanId?: string | null;
}

/**
 * Opens a "Telepon Pemesan" row, unless one is already open for the subject:
 * retries and re-announcements never stack rows for the same subject. The
 * open row is unique in the database, so two ticks escalating the same failed
 * message at once still leave the queue one row.
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
      nomorPemesanan: input.nomorPemesanan ?? null,
      lokasiId: input.lokasiId ?? null,
      perihal: input.perihal ?? null,
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

/** One "Telepon Pemesan" row as a call log entry: open, or closed with what the staff member found. */
export interface TeleponPemesanRiwayat extends TeleponPemesan {
  ditutupPada: Date | null;
  hasil: (typeof teleponHasil)[number] | null;
  catatan: string | null;
}

/**
 * Every "Telepon Pemesan" row ever opened for one subject, oldest first: the
 * overdue list's own call log (ticket 29's AC 2, 3), where a subject expects
 * several calls over time and each is its own row (the mechanism reopens once
 * the last one closes).
 */
export async function teleponPemesanRiwayat(db: Database, subjectKind: string, subjectId: string): Promise<TeleponPemesanRiwayat[]> {
  const rows = await db
    .select()
    .from(notificationsTeleponPemesan)
    .where(and(eq(notificationsTeleponPemesan.subjectKind, subjectKind), eq(notificationsTeleponPemesan.subjectId, subjectId)))
    .orderBy(asc(notificationsTeleponPemesan.dibukaPada), asc(notificationsTeleponPemesan.id));
  return rows.map((row) => ({ ...toTeleponPemesan(row), ditutupPada: row.ditutupPada, hasil: row.hasil, catatan: row.catatan }));
}

/** Every open "Telepon Pemesan" row, oldest first: what the two Antrean's rows read. */
export async function teleponPemesanTerbuka(db: Database): Promise<TeleponPemesan[]> {
  const rows = await db
    .select()
    .from(notificationsTeleponPemesan)
    .where(isNull(notificationsTeleponPemesan.ditutupPada))
    .orderBy(asc(notificationsTeleponPemesan.dibukaPada), asc(notificationsTeleponPemesan.id));
  return rows.map(toTeleponPemesan);
}

/**
 * Whether a "Telepon Pemesan" row has ever been opened for this subject and
 * this `sebab`, open or closed: the H+1 Chasing escalation's own guard (ticket
 * 29), so opening the call row and sending the Admin Lokasi push happen once
 * per Tagihan even though the row itself reopens for every later call the
 * overdue list still expects (around H+14).
 */
export async function teleponPemesanAdaUntukSebab(
  db: Database,
  subjectKind: string,
  subjectId: string,
  sebab: (typeof teleponSebab)[number],
): Promise<boolean> {
  const [row] = await db
    .select({ n: count() })
    .from(notificationsTeleponPemesan)
    .where(
      and(
        eq(notificationsTeleponPemesan.subjectKind, subjectKind),
        eq(notificationsTeleponPemesan.subjectId, subjectId),
        eq(notificationsTeleponPemesan.sebab, sebab),
      ),
    );
  return (row?.n ?? 0) > 0;
}

/**
 * Whether the call to one subject has been logged: a row of that subject that
 * carries a `ditutupPada`. The Tier 1 "Saat Duka ditolak" row reads it, so a
 * declined family stays a row until somebody has actually phoned, and stops
 * being one the moment that call is recorded.
 */
export async function teleponPemesanTercatat(db: Database, subjectKind: string, subjectId: string): Promise<boolean> {
  if (subjectId.trim() === "") return false;
  // "Any call to this subject was logged", not "the newest row is closed": a
  // subject may be called twice, and the first call already happened.
  const [row] = await db
    .select({ n: count() })
    .from(notificationsTeleponPemesan)
    .where(
      and(
        eq(notificationsTeleponPemesan.subjectKind, subjectKind),
        eq(notificationsTeleponPemesan.subjectId, subjectId),
        isNotNull(notificationsTeleponPemesan.ditutupPada),
      ),
    );
  return (row?.n ?? 0) > 0;
}

/**
 * A staff member logs the call: the row closes. Audited, like every other staff
 * write on a queue. Which staff member may log it is the row's own fact: a row
 * with a `lokasiId` is that Lokasi Mitra's work, so its Admin Lokasi (and
 * Admin Platform) may call; a money subject is Admin Platform's alone.
 */
export async function catatPanggilan(
  deps: TeleponPemesanDeps,
  by: Actor,
  input: CatatPanggilanInput,
): Promise<CatatPanggilanResult> {
  const parsed = catatPanggilanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "telepon_tidak_valid" };
  const [subject] = await deps.db
    .select({ lokasiId: notificationsTeleponPemesan.lokasiId })
    .from(notificationsTeleponPemesan)
    .where(eq(notificationsTeleponPemesan.id, parsed.data.teleponId));
  // Which staff member may log a call is the row's own fact, so the row is read
  // first; a caller who may log no call at all is refused before this tells it
  // anything about the row.
  const refusal = writeRefusal(
    by,
    subject?.lokasiId ? "telepon_pemesan.catat_lokasi" : "telepon_pemesan.catat",
    subject?.lokasiId ? lokasiMitraResource(subject.lokasiId) : antreanResource(),
  );
  if (refusal) return refusal;
  if (!subject) return { ok: false, reason: "tidak_ditemukan" };
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
      actor: { accountId: by.accountId, role: staffRoleOf(by) },
      action: "telepon_pemesan.catat_panggilan",
      entity: { kind: "telepon_pemesan", id: row.id },
      lokasiId: row.lokasiId,
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
    nomorPemesanan: row.nomorPemesanan,
    lokasiId: row.lokasiId,
    perihal: row.perihal,
    sebab: row.sebab,
    dibukaPada: row.dibukaPada,
  };
}

/** The role the Entri Audit names: whichever staff role the caller holds first (both may log a call). */
function staffRoleOf(by: Actor): StaffRole {
  const role = staffRoles.find((held) => by.roles.includes(held));
  if (!role) throw new Error("a call is only ever logged by a staff member");
  return role;
}
