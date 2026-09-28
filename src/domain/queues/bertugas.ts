/**
 * Bertugas (CONTEXT.md; spec, Work Queues: "Ambil soft claims, Bertugas (who is
 * Bertugas now is shown at the top of the Antrean; switching it on needs at
 * least one active Perangkat Push, ADR 0004)"; ticket 28).
 *
 * **Bertugas is an attribute of the Antrean, not an identity.** It is a row of
 * this module's own `antrean_bertugas` table with the Akun Staf on duty in its
 * `petugas_account_id` column: switching it on creates no Akun, grants no role
 * and starts no session, and a person with no Akun has no row at all and cannot
 * be Bertugas — there is no placeholder row, no name-only row, and no seed to
 * stand in for one. The table holds **no Lokasi column**, so being on duty is
 * never scoped to one Lokasi Mitra: one person is Bertugas for the whole Antrean
 * whatever else the Akun is, which is what "one Akun may hold many roles"
 * (spec, Identity & Access) requires. A `bertugas` column on the Akun Staf was
 * the alternative, and it equated "staff" with "on call" while making a person
 * Bertugas at exactly one Lokasi. The rota behind all this lives outside the
 * platform, so no shift is ever read from here either.
 *
 * The duty ends two ways, and the row keeps how: by hand, which asks about each
 * Ambil claim still held — release it, or hand the work over with a Catatan
 * Internal — or by the auto-off tick at 18:00 WIB or 12 h after the duty began,
 * whichever comes first, which leaves the claims alone and notes the event on
 * each of them.
 */
import { and, asc, eq, gt, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import { antreanResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { nextDaytimeEnd } from "@/domain/lokasi";
import { formatWib } from "@/lib/time/jakarta";
import type { Clock } from "@/ports/clock";
import { rowKeyOf } from "./antrean";
import { catatOtomatis, catatTulis } from "./catatan-internal";
import { antreanAmbil, antreanBertugas } from "./schema";

const JAM = 3_600_000;

/** The longest a duty may run however it was switched on (spec, Work Queues: "or after 12 h"). */
export const JAM_MAKS_BERTUGAS = 12;

export interface BertugasDeps {
  db: Database;
  clock: Clock;
  audit: AuditLog;
  /** The Perangkat Push that decide whether a duty may start at all (ADR 0004). */
  notifications: {
    pushDevices(accountId: string): Promise<{ endpoint: string; enabledAt: Date }[]>;
  };
}

/** One Akun Staf on duty now, as the Antrean header lists it. */
export interface PetugasBertugas {
  accountId: string;
  /** When the duty started, and the instant it ends by rule (18:00 WIB or 12 h after it started). */
  sejak: Date;
  berakhirPada: Date;
}

export type NyalakanBertugasResult = { ok: true } | WriteRefusal | { ok: false; reason: "perangkat_push_kosong" };

/**
 * An Admin Platform switches itself Bertugas: refused unless it holds at least
 * one active Perangkat Push (CONTEXT.md, ADR 0004 — a duty nobody's browser
 * would ring is not a duty). Switching on while already on duty is not an error:
 * the 12 h runs again from this moment. Audited.
 */
export async function nyalakanBertugas(deps: BertugasDeps, by: Actor): Promise<NyalakanBertugasResult> {
  const refusal = writeRefusal(by, "antrean.bertugas", antreanResource());
  if (refusal) return refusal;
  // Read before the write, and the read is the whole check: a Perangkat Push
  // whose browser has dropped it is removed when the next Peringatan Staf finds it.
  if ((await deps.notifications.pushDevices(by.accountId)).length === 0) {
    return { ok: false, reason: "perangkat_push_kosong" };
  }
  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [sebelumnya] = await tx
      .select({
        sejak: antreanBertugas.dinyalakanPada,
        berakhirPada: antreanBertugas.berakhirPada,
      })
      .from(antreanBertugas)
      .where(eq(antreanBertugas.petugasAccountId, by.accountId));
    const berakhirPada = berakhiran(now);
    await tx
      .insert(antreanBertugas)
      .values({
        petugasAccountId: by.accountId,
        dinyalakanPada: now,
        berakhirPada,
        dimatikanPada: null,
        alasan: null,
      })
      .onConflictDoUpdate({
        target: antreanBertugas.petugasAccountId,
        set: {
          dinyalakanPada: now,
          berakhirPada,
          dimatikanPada: null,
          alasan: null,
        },
      });
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "antrean.bertugas_nyalakan",
      entity: { kind: "antrean_bertugas", id: by.accountId },
      lokasiId: null,
      before: sebelumnya ? { sejak: sebelumnya.sejak, berakhirPada: sebelumnya.berakhirPada } : null,
      after: { sejak: now, berakhirPada },
      reason: null,
    });
    return { ok: true } as const;
  });
}

/** What one claimed row is asked when its holder comes off duty: release it, or hand it over in writing. */
export const klaimBertugasSchema = z.object({
  type: z.string().trim().min(1).max(50),
  subjectId: z.string().trim().min(1).max(100),
  /** True releases the claim; false keeps it and needs a `catatan` to hand it over. */
  lepas: z.boolean(),
  catatan: z.string().trim().min(1).max(2000).nullish(),
});

export const matikanBertugasInputSchema = z.object({
  klaim: z.array(klaimBertugasSchema).max(200),
});
export type MatikanBertugasInput = z.infer<typeof matikanBertugasInputSchema>;

export type MatikanBertugasResult =
  | { ok: true; dilepas: string[]; dicatat: string[] }
  | WriteRefusal
  | {
      ok: false;
      reason: "tidak_bertugas" | "klaim_belum_diputuskan" | "catatan_wajib";
    };

/**
 * An Admin Platform switches itself off duty by hand, and is asked about every
 * Ambil claim it still holds: release the claim, or keep it and hand the work
 * over with a Catatan Internal on the row. A held claim with no decision refuses
 * the whole thing, so coming off duty can never drop work without a word; a claim
 * that is no longer held is ignored, because its row closed on its own in the
 * meantime.
 *
 * One transaction: the duty, the released claims and the hand-over notes, with
 * an Entri Audit for the duty and one for each note. Audited.
 */
export async function matikanBertugas(
  deps: BertugasDeps,
  by: Actor,
  input: MatikanBertugasInput,
): Promise<MatikanBertugasResult> {
  const refusal = writeRefusal(by, "antrean.bertugas", antreanResource());
  if (refusal) return refusal;
  const parsed = matikanBertugasInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "klaim_belum_diputuskan" };
  const keputusan = new Map(parsed.data.klaim.map((klaim) => [rowKeyOf(klaim.type, klaim.subjectId), klaim]));
  for (const klaim of parsed.data.klaim) {
    if (!klaim.lepas && !klaim.catatan) return { ok: false, reason: "catatan_wajib" };
  }

  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [bertugas] = await tx
      .select()
      .from(antreanBertugas)
      .where(eq(antreanBertugas.petugasAccountId, by.accountId))
      .for("update");
    if (!bertugas || bertugas.dimatikanPada !== null) return { ok: false, reason: "tidak_bertugas" } as const;

    const diklaim = await tx
      .select({
        rowKey: antreanAmbil.rowKey,
        subjectKind: antreanAmbil.subjectKind,
      })
      .from(antreanAmbil)
      .where(eq(antreanAmbil.claimedByAccountId, by.accountId));
    const dipegang = diklaim.map((klaim) => klaim.rowKey);
    // Every claim held is answered: one undecided claim puts the whole duty back.
    if (dipegang.some((rowKey) => !keputusan.has(rowKey)))
      return { ok: false, reason: "klaim_belum_diputuskan" } as const;

    const dilepas: string[] = [];
    const dicatat: string[] = [];
    for (const { rowKey, subjectKind } of diklaim) {
      const klaim = keputusan.get(rowKey);
      if (!klaim) continue;
      if (klaim.lepas) {
        await tx.delete(antreanAmbil).where(eq(antreanAmbil.rowKey, rowKey));
        dilepas.push(rowKey);
        continue;
      }
      // The note belongs to the row's own Catatan Internal thread, keyed on the
      // subject its row type reported — which the claim carries. A claim from
      // before that column existed keeps its work and gets no note.
      if (!subjectKind) continue;
      const id = await catatTulis(tx, {
        authorAccountId: by.accountId,
        subjectKind,
        subjectId: klaim.subjectId,
        body: klaim.catatan ?? "",
        now,
      });
      await record({
        actor: { accountId: by.accountId, role: "admin_platform" },
        action: "catatan_internal.tulis",
        entity: { kind: "catatan_internal", id },
        lokasiId: null,
        before: null,
        after: { subjectKind, subjectId: klaim.subjectId },
        reason: "Serah terima saat turun dari Bertugas",
      });
      dicatat.push(rowKey);
    }
    await tx
      .update(antreanBertugas)
      .set({ dimatikanPada: now, alasan: "manual" })
      .where(eq(antreanBertugas.petugasAccountId, by.accountId));
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "antrean.bertugas_matikan",
      entity: { kind: "antrean_bertugas", id: by.accountId },
      lokasiId: null,
      before: {
        bertugas: true,
        sejak: bertugas.dinyalakanPada,
        klaim: dipegang,
      },
      after: { bertugas: false, dilepas, dicatat },
      reason: null,
    });
    return { ok: true, dilepas, dicatat } as const;
  });
}

/** Every Akun Staf on duty at `now`, oldest first: what the Antrean header lists. */
export async function petugasBertugas(
  deps: Pick<BertugasDeps, "db" | "clock">,
  now: Date = deps.clock.now(),
): Promise<PetugasBertugas[]> {
  const rows = await deps.db
    .select()
    .from(antreanBertugas)
    .where(and(isNull(antreanBertugas.dimatikanPada), gt(antreanBertugas.berakhirPada, now)))
    .orderBy(asc(antreanBertugas.dinyalakanPada), asc(antreanBertugas.petugasAccountId));
  return rows.map((row) => ({
    accountId: row.petugasAccountId,
    sejak: row.dinyalakanPada,
    berakhirPada: row.berakhirPada,
  }));
}

/** The account ids of everyone on duty at `now`, in one query, for the Tier 1 alerts' recipients. */
export async function petugasBertugasIds(tx: Database, now: Date): Promise<string[]> {
  const rows = await tx
    .select({ accountId: antreanBertugas.petugasAccountId })
    .from(antreanBertugas)
    .where(and(isNull(antreanBertugas.dimatikanPada), gt(antreanBertugas.berakhirPada, now)));
  return rows.map((row) => row.accountId);
}

/** The subject a row key names, or null for a key that has no ":". */
function subjectIdOf(rowKey: string): string | null {
  const pemisah = rowKey.indexOf(":");
  return pemisah < 1 ? null : rowKey.slice(pemisah + 1);
}

/** The instant a duty begun at `mulai` ends by rule: 18:00 WIB, or 12 h later, whichever is first. */
export function berakhiran(mulai: Date): Date {
  const duaBelasJam = new Date(mulai.getTime() + JAM_MAKS_BERTUGAS * JAM);
  const pukulEnamBelum = nextDaytimeEnd(mulai);
  return pukulEnamBelum < duaBelasJam ? pukulEnamBelum : duaBelasJam;
}

/** What one auto-off did. */
export interface HasilBertugasTick {
  /** The duties the tick ended, and the claims each one left in place. */
  dimatikan: { accountId: string; klaim: string[] }[];
}

/**
 * Scheduler tick: a duty ends by itself at 18:00 WIB or 12 h after it began,
 * whichever came first, and the claims it held are **left alone** — the staff
 * member never chose to hand those over, so the tick notes the event as a Catatan
 * Internal on each row rather than releasing work nobody decided to drop (spec,
 * Work Queues).
 *
 * Idempotent: the row that flips `dimatikan_pada` from null is the claim, so a
 * second run at the same `now` (or two workers at once) finds every duty already
 * off and writes neither a second note nor a second Entri Audit.
 */
export async function tickBertugasMati(deps: BertugasDeps, now: Date): Promise<HasilBertugasTick> {
  const lewat = await deps.db
    .select()
    .from(antreanBertugas)
    .where(and(isNull(antreanBertugas.dimatikanPada), lte(antreanBertugas.berakhirPada, now)));
  const dimatikan: { accountId: string; klaim: string[] }[] = [];
  for (const tugas of lewat) {
    const diklaim = (
      await deps.db
        .select({
          rowKey: antreanAmbil.rowKey,
          subjectKind: antreanAmbil.subjectKind,
        })
        .from(antreanAmbil)
        .where(eq(antreanAmbil.claimedByAccountId, tugas.petugasAccountId))
    ).map((satu) => ({
      rowKey: satu.rowKey,
      subjectKind: satu.subjectKind,
      subjectId: subjectIdOf(satu.rowKey),
    }));
    const klaim = diklaim.map((satu) => satu.rowKey);
    const jadi = await deps.audit.staffWrite(deps.db, async (tx, record) => {
      const diupdate = await tx
        .update(antreanBertugas)
        .set({ dimatikanPada: now, alasan: "otomatis" })
        .where(and(eq(antreanBertugas.petugasAccountId, tugas.petugasAccountId), isNull(antreanBertugas.dimatikanPada)))
        .returning({ id: antreanBertugas.petugasAccountId });
      if (diupdate.length === 0) return { ok: false };
      for (const satu of diklaim) {
        // A claim from before the subject column existed keeps its work and gets
        // no note; every other one says where the hand-over stands.
        if (!satu.subjectKind || satu.subjectId === null) continue;
        await catatOtomatis(tx, {
          authorAccountId: tugas.petugasAccountId,
          subjectKind: satu.subjectKind,
          subjectId: satu.subjectId,
          body: `Bertugas berakhir otomatis ${formatWib(now)}. Klaim Ambil baris ini sengaja tidak dilepas: orang yang memegang boleh lanjut, dan serah terimanya lewat catatan di sini.`,
          now,
        });
      }
      await record({
        // No one is signed in: the entry names the Akun whose duty ended, acting
        // as the server's tick, as the ops CLI entries do.
        actor: { accountId: tugas.petugasAccountId, role: "ops_cli" },
        action: "antrean.bertugas_matikan",
        entity: { kind: "antrean_bertugas", id: tugas.petugasAccountId },
        lokasiId: null,
        before: {
          bertugas: true,
          sejak: tugas.dinyalakanPada,
          berakhirPada: tugas.berakhirPada,
          klaim,
        },
        after: { bertugas: false, alasan: "otomatis", dicatat: klaim },
        reason: "Auto-off 18:00 WIB atau 12 jam",
      });
      return { ok: true };
    });
    if (jadi.ok) dimatikan.push({ accountId: tugas.petugasAccountId, klaim });
  }
  return { dimatikan };
}
