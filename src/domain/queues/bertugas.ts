/**
 * Bertugas (CONTEXT.md; spec, Work Queues; ticket 28): an Admin Platform marks
 * themselves on duty and so receives the Tier 1 alerts. Switching it on needs at
 * least one active Perangkat Push (ADR 0004); it switches itself off at 18:00 WIB
 * or 12 h after it was switched on, whichever comes first; switching it off by
 * hand asks the staff member to release, or leave a Catatan Internal on, each row
 * they hold an Ambil claim on, while the automatic switch-off leaves the claims
 * where they are.
 *
 * Every write here is one audited transaction. The automatic switch-off has no
 * staff writer, so it is no Entri Audit: the Bertugas stretch keeps `selesai_oleh`.
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import { antreanResource, writeRefusal, type Actor, type Identity, type WriteRefusal } from "@/domain/identity";
import type { Notifications } from "@/domain/notifications";
import { addWibDays, wibDayStart } from "@/lib/time/jakarta";
import type { Clock } from "@/ports/clock";
import { antrean, rowKeyOf, type QueuesAntreanDeps } from "./antrean";
import { antreanAmbil, antreanBertugas, catatanInternal } from "./schema";

const HOUR_MS = 3_600_000;

/** Bertugas ends 12 h after it was switched on … */
export const BERTUGAS_MAKSIMUM_JAM = 12;
/** … or at this hour WIB, whichever comes first. */
export const BERTUGAS_BERAKHIR_JAM_WIB = 18;

/** When a Bertugas switched on at `mulaiAt` ends by itself: 18:00 WIB or 12 h later, the earlier. */
export function bertugasBerakhirAt(mulaiAt: Date): Date {
  const habisJam = new Date(mulaiAt.getTime() + BERTUGAS_MAKSIMUM_JAM * HOUR_MS);
  const hariIni18 = new Date(wibDayStart(mulaiAt).getTime() + BERTUGAS_BERAKHIR_JAM_WIB * HOUR_MS);
  const berikut18 = hariIni18.getTime() > mulaiAt.getTime() ? hariIni18 : addWibDays(hariIni18, 1);
  return berikut18.getTime() < habisJam.getTime() ? berikut18 : habisJam;
}

export interface BertugasDeps {
  db: Database;
  clock: Clock;
  audit: AuditLog;
  /** Switching on needs at least one active Perangkat Push. */
  notifications: Pick<Notifications, "pushDevices">;
  /** The Admin Platform's name for the header, and which Akun are still Admin Platform. */
  identity: Pick<Identity, "staffAccounts">;
}

export interface BertugasAkun {
  accountId: string;
  name: string;
  mulaiAt: Date;
  berakhirAt: Date;
}

export interface BertugasStatus {
  /** Who is Bertugas now (the Antrean's header). */
  sekarang: BertugasAkun[];
  saya: {
    bertugas: boolean;
    berakhirAt: Date | null;
    /** Active Perangkat Push of the signed-in Akun: none, and switching on is refused with a pointer to turn push on. */
    perangkatPush: number;
    /** When the last stretch ended by itself, if it was the last one and no new one has begun (the note the staff member sees). */
    dimatikanOtomatisAt: Date | null;
  };
}

/** The open stretches that have not yet run out at `now`, oldest first. */
async function stretchTerbuka(db: Database, now: Date) {
  const rows = await db.select().from(antreanBertugas).where(isNull(antreanBertugas.selesaiAt)).orderBy(antreanBertugas.mulaiAt);
  return rows.map((row) => ({ ...row, berakhirAt: bertugasBerakhirAt(row.mulaiAt) })).filter((row) => row.berakhirAt.getTime() > now.getTime());
}

/** The Akun Staf who are Bertugas at `now` and still Admin Platform (not Dinonaktifkan). */
export async function bertugasSekarang(deps: Pick<BertugasDeps, "db" | "identity">, now: Date): Promise<BertugasAkun[]> {
  const [stretches, accounts] = await Promise.all([stretchTerbuka(deps.db, now), deps.identity.staffAccounts()]);
  const adminPlatform = new Map(accounts.filter((account) => account.roles.includes("admin_platform") && !account.deactivated).map((account) => [account.accountId, account]));
  return stretches.flatMap((row) => {
    const account = adminPlatform.get(row.accountId);
    return account
      ? [{ accountId: row.accountId, name: account.name.trim() || account.email || account.accountId, mulaiAt: row.mulaiAt, berakhirAt: row.berakhirAt }]
      : [];
  });
}

/** Who is Bertugas now, and the signed-in Admin Platform's own state (null for anyone else). */
export async function bertugasStatus(deps: BertugasDeps, by: Actor): Promise<BertugasStatus | null> {
  if (writeRefusal(by, "antrean.lihat", antreanResource())) return null;
  const now = deps.clock.now();
  const [sekarang, perangkat, [terakhir]] = await Promise.all([
    bertugasSekarang(deps, now),
    deps.notifications.pushDevices(by.accountId),
    deps.db.select().from(antreanBertugas).where(eq(antreanBertugas.accountId, by.accountId)).orderBy(desc(antreanBertugas.mulaiAt)).limit(1),
  ]);
  const saya = sekarang.find((akun) => akun.accountId === by.accountId);
  // A stretch whose time ran out before the tick closed it counts as ended by itself.
  const berakhir = terakhir ? (terakhir.selesaiAt ?? bertugasBerakhirAt(terakhir.mulaiAt)) : null;
  const otomatis = terakhir && !saya && (terakhir.selesaiOleh === "otomatis" || terakhir.selesaiAt === null) ? berakhir : null;
  return {
    sekarang,
    saya: { bertugas: Boolean(saya), berakhirAt: saya?.berakhirAt ?? null, perangkatPush: perangkat.length, dimatikanOtomatisAt: otomatis },
  };
}

export type AktifkanBertugasResult =
  | { ok: true; berakhirAt: Date }
  | WriteRefusal
  /** No active Perangkat Push: the page points to where push is turned on (ADR 0004). */
  | { ok: false; reason: "perlu_perangkat_push" }
  | { ok: false; reason: "sudah_bertugas" };

/** The signed-in Admin Platform goes on duty; refused without an active Perangkat Push. Audited. */
export async function aktifkanBertugas(deps: BertugasDeps, by: Actor): Promise<AktifkanBertugasResult> {
  const refusal = writeRefusal(by, "bertugas.ubah", antreanResource());
  if (refusal) return refusal;
  if ((await deps.notifications.pushDevices(by.accountId)).length === 0) return { ok: false, reason: "perlu_perangkat_push" };
  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    // A stretch whose time ran out but which the tick has not closed yet ends here, by itself, so a new one can begin.
    const [terbuka] = await tx.select().from(antreanBertugas).where(and(eq(antreanBertugas.accountId, by.accountId), isNull(antreanBertugas.selesaiAt)));
    if (terbuka) {
      const berakhirAt = bertugasBerakhirAt(terbuka.mulaiAt);
      if (berakhirAt.getTime() > now.getTime()) return { ok: false, reason: "sudah_bertugas" } as const;
      await tx.update(antreanBertugas).set({ selesaiAt: berakhirAt, selesaiOleh: "otomatis" }).where(eq(antreanBertugas.id, terbuka.id));
    }
    const [dibuat] = await tx
      .insert(antreanBertugas)
      .values({ accountId: by.accountId, mulaiAt: now })
      .onConflictDoNothing()
      .returning({ id: antreanBertugas.id });
    if (!dibuat) return { ok: false, reason: "sudah_bertugas" } as const;
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "bertugas.aktifkan",
      entity: { kind: "bertugas", id: by.accountId },
      lokasiId: null,
      before: { bertugas: false },
      after: { bertugas: true, mulaiAt: now.toISOString() },
      reason: null,
    });
    return { ok: true, berakhirAt: bertugasBerakhirAt(now) } as const;
  });
}

/** What the staff member does with one row they hold: let it go, or leave a Catatan Internal on it for whoever takes it next. */
export const penangananBarisSchema = z.object({
  type: z.string().trim().min(1),
  subjectId: z.string().trim().min(1),
  aksi: z.enum(["lepas", "catatan"]),
  catatan: z.string().trim().max(2000).optional(),
});
export const matikanBertugasInputSchema = z.object({ penanganan: z.array(penangananBarisSchema).max(500) });
export type MatikanBertugasInput = z.infer<typeof matikanBertugasInputSchema>;

/** A row the staff member holds and has not yet released or annotated. */
export interface BarisPerluPenanganan {
  type: string;
  subjectId: string;
  label: string;
  subjectLabel: string;
}

export type MatikanBertugasResult =
  | { ok: true; dilepas: number; dicatat: number }
  | WriteRefusal
  | { ok: false; reason: "tidak_bertugas" }
  | { ok: false; reason: "input_tidak_valid" }
  /** Going off duty asks first: every row still claimed must be released or given a Catatan Internal. */
  | { ok: false; reason: "perlu_penanganan"; baris: BarisPerluPenanganan[] };

/**
 * The signed-in Admin Platform goes off duty by hand. Each row they hold (Ambil)
 * is released, or keeps its claim and gets a Catatan Internal for the hand-over;
 * a row not dealt with refuses the switch-off and is named. Audited.
 */
export async function matikanBertugas(deps: BertugasDeps & QueuesAntreanDeps, by: Actor, input: MatikanBertugasInput): Promise<MatikanBertugasResult> {
  const refusal = writeRefusal(by, "bertugas.ubah", antreanResource());
  if (refusal) return refusal;
  const parsed = matikanBertugasInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const now = deps.clock.now();
  // Not on duty: nothing to hand over, so the claims are not asked about.
  if (!(await stretchTerbuka(deps.db, now)).some((row) => row.accountId === by.accountId)) return { ok: false, reason: "tidak_bertugas" };

  const dipegang =(await antrean(deps, by)).filter((row) => row.ambil?.accountId === by.accountId);
  const untuk = new Map(parsed.data.penanganan.map((item) => [rowKeyOf(item.type, item.subjectId), item]));
  const belum = dipegang.filter((row) => {
    const item = untuk.get(rowKeyOf(row.type, row.subjectId));
    return !item || (item.aksi === "catatan" && !item.catatan);
  });
  if (belum.length > 0) {
    return {
      ok: false,
      reason: "perlu_penanganan",
      baris: belum.map((row) => ({ type: row.type, subjectId: row.subjectId, label: row.label, subjectLabel: row.subjectLabel })),
    };
  }

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [terbuka] = await tx.select().from(antreanBertugas).where(and(eq(antreanBertugas.accountId, by.accountId), isNull(antreanBertugas.selesaiAt)));
    if (!terbuka || bertugasBerakhirAt(terbuka.mulaiAt).getTime() <= now.getTime()) return { ok: false, reason: "tidak_bertugas" } as const;
    await tx.update(antreanBertugas).set({ selesaiAt: now, selesaiOleh: "manual" }).where(eq(antreanBertugas.id, terbuka.id));

    let dilepas = 0;
    let dicatat = 0;
    for (const row of dipegang) {
      const item = untuk.get(rowKeyOf(row.type, row.subjectId));
      const rowKey = rowKeyOf(row.type, row.subjectId);
      if (item?.aksi === "catatan" && item.catatan) {
        const [catatan] = await tx
          .insert(catatanInternal)
          .values({ subjectKind: row.subjectKind, subjectId: row.subjectId, authorAccountId: by.accountId, body: item.catatan, createdAt: now })
          .returning({ id: catatanInternal.id });
        await record({
          actor: { accountId: by.accountId, role: "admin_platform" },
          action: "catatan_internal.tulis",
          entity: { kind: "catatan_internal", id: catatan.id },
          lokasiId: null,
          before: null,
          after: { subjectKind: row.subjectKind, subjectId: row.subjectId },
          reason: "Serah terima saat Bertugas dimatikan",
        });
        dicatat += 1;
      } else {
        // Only the claim that is still this staff member's: another Admin Platform may have taken the row since the list was read.
        const dibuang = await tx
          .delete(antreanAmbil)
          .where(and(eq(antreanAmbil.rowKey, rowKey), eq(antreanAmbil.claimedByAccountId, by.accountId)))
          .returning({ rowKey: antreanAmbil.rowKey });
        if (dibuang.length === 0) continue;
        await record({
          actor: { accountId: by.accountId, role: "admin_platform" },
          action: "antrean.lepas",
          entity: { kind: "antrean_row", id: rowKey },
          lokasiId: null,
          before: { claimedByAccountId: by.accountId },
          after: null,
          reason: "Bertugas dimatikan",
        });
        dilepas += 1;
      }
    }
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "bertugas.matikan",
      entity: { kind: "bertugas", id: by.accountId },
      lokasiId: null,
      before: { bertugas: true, mulaiAt: terbuka.mulaiAt.toISOString() },
      after: { bertugas: false, dilepas, dicatat },
      reason: null,
    });
    return { ok: true, dilepas, dicatat } as const;
  });
}

/**
 * The worker's tick: every Bertugas stretch whose 18:00 WIB or 12 h has come is
 * switched off, its Ambil claims and notes left as they are. Ends each stretch at
 * the moment it was due, not at the tick, and only while still open, so a second
 * run (or a second worker) changes nothing.
 */
export async function bertugasOtomatisMatiTick(deps: { db: Database }, now: Date): Promise<{ dimatikan: number }> {
  const terbuka = await deps.db.select().from(antreanBertugas).where(isNull(antreanBertugas.selesaiAt));
  let dimatikan = 0;
  for (const row of terbuka) {
    const berakhirAt = bertugasBerakhirAt(row.mulaiAt);
    if (berakhirAt.getTime() > now.getTime()) continue;
    const diubah = await deps.db
      .update(antreanBertugas)
      .set({ selesaiAt: berakhirAt, selesaiOleh: "otomatis" })
      .where(and(eq(antreanBertugas.id, row.id), isNull(antreanBertugas.selesaiAt)))
      .returning({ id: antreanBertugas.id });
    dimatikan += diubah.length;
  }
  return { dimatikan };
}
