/**
 * Setor Retribusi (spec, Work Queues Tier 3 and Tariffs; ticket 45): a Retribusi
 * Daerah line the family paid is not the Operator's to keep — it is handed to
 * the town. So every Lunas Tagihan with a **non-zero** Retribusi Daerah line
 * opens a Tier 3 "Setor Retribusi" row, due two working days after Lunas on the
 * Admin Platform calendar (ticket 11), and recording the payment to the town
 * with its proof closes it.
 *
 * Who records it: Admin Platform, or the Petugas Lapangan who paid in person
 * out of their own pocket and uploads the receipt on a "Setor Retribusi" Tugas
 * Lapangan. Both go through this one function, so the row closes the same way
 * whoever paid; the recording is audited either way.
 *
 * What it refuses, in order: no Tagihan, a Tagihan that never went out to a
 * town (one with no Retribusi Daerah line, or a Rp 0 one — every Retribusi is
 * Rp 0 today, so this is the only case v1 can actually refuse), a Tagihan
 * already recorded, a date in the future, a proof that is not a photo or a scan,
 * and a private FileStore that will not keep it.
 *
 * Nothing is invented here: the amount, the Tagihan and its number come from
 * Billing's own read of the Retribusi line, and the Tier 3 row is a projection
 * of that read minus the recordings below (the queues module's row type), never
 * a stored row of its own.
 */
import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import { setorRetribusiResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { documentExtension, type DocumentContentType } from "@/lib/files/document-type";
import { wib, wibDateOf } from "@/lib/time/jakarta";
import type { Clock } from "@/ports/clock";
import type { FileStore } from "@/ports/file-store";
import type { Billing, RetribusiTagihan } from "@/domain/billing";
import { addWorkingDays, type Lokasi } from "@/domain/lokasi";
import { fieldworkSetorRetribusi, fieldworkTugas } from "./schema";

/** What Admin Platform, or the Petugas who paid in person, sends to record a setor. */
export const catatSetorRetribusiSchema = z.object({
  /** The Tagihan whose Retribusi line is being paid on to the town. */
  tagihanId: z.uuid(),
  /** The date the town took the money, as the receipt says (WIB `YYYY-MM-DD`). */
  dibayarkanPada: z.iso.date(),
  /** The receipt: a phone photo or a scan, whatever the town's office gave. */
  bukti: z.object({ body: z.instanceof(Uint8Array), contentType: z.string().trim().min(1).max(100) }),
  catatan: z.string().trim().max(2000).default(""),
});
export type CatatSetorRetribusiInput = z.infer<typeof catatSetorRetribusiSchema>;

export type CatatSetorRetribusiResult =
  | { ok: true; setor: SetorRetribusi }
  | WriteRefusal
  | { ok: false; reason: "input_tidak_valid" | "tanggal_di_masa_depan" | "berkas_tidak_didukung" | "berkas_gagal_disimpan" }
  /** No Tagihan of that id, or it never went out to a town (no Retribusi line, or a Rp 0 one). */
  | { ok: false; reason: "tagihan_tidak_ada" }
  /** That Tagihan's setor is already recorded: a town is paid once. */
  | { ok: false; reason: "sudah_disetor" };

/** One recorded payment to a town, as the screen and the audit trail show it. */
export interface SetorRetribusi {
  id: string;
  tagihanId: string;
  nomorTagihan: string;
  amount: number;
  dibayarkanPada: Date;
  dicatatOleh: string;
  tugasLapanganId: string | null;
}

/** One open Setor Retribusi: a Lunas Retribusi Tagihan nobody has paid on to the town yet. */
export interface SetorRetribusiTerbuka {
  tagihanId: string;
  nomorTagihan: string;
  /** The order the Retribusi line was charged on, when it is about one. */
  nomorPemesanan: string | null;
  placeName: string | null;
  lunasAt: Date;
  /** What has to reach the town: the Retribusi line's own amount. */
  amount: number;
  /** Two working days after Lunas on the Admin Platform calendar (ticket 11), so a weekend or a Hari Libur moves it. */
  dueAt: Date | null;
  /** The Setor Retribusi Tugas a Petugas has been given, when one was; null while nobody has been handed it. */
  tugasLapanganId: string | null;
  assigneeAccountId: string | null;
}

/** The kinds of file a setoran proof may be: a phone photo or a scan of the receipt. */
const BUKTI_TYPES: readonly DocumentContentType[] = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/** The largest receipt we keep: a phone photo of one page of paper, like any other evidence. */
const BUKTI_MAX_BYTES = 4 * 1024 * 1024;

export interface SetorRetribusiDeps {
  db: Database;
  clock: Clock;
  files: FileStore;
  audit: AuditLog;
  /** Billing's own read of the Lunas Retribusi Tagihan: the amount and the number are its facts, not ours. */
  billing: Pick<Billing, "tagihanRetribusiLunas">;
  /** The Admin Platform Hari Kerja calendar, for the row's two-working-day deadline (ticket 11). */
  lokasi: Pick<Lokasi, "adminPlatformCalendar">;
}

/**
 * Records the payment of a Tagihan's Retribusi Daerah line to the town, with
 * the proof, and so closes the Tier 3 row. `tugasLapanganId` is the "Setor
 * Retribusi" Tugas whose upload carried the proof when a Petugas paid in
 * person; null when an Admin Platform recorded it themselves.
 */
export async function catatSetorRetribusi(
  deps: SetorRetribusiDeps,
  by: Actor,
  rawInput: unknown,
  tugasLapanganId: string | null = null,
): Promise<CatatSetorRetribusiResult> {
  const refusal = writeRefusal(by, "setor_retribusi.kelola", setorRetribusiResource());
  if (refusal) return refusal;
  const parsed = catatSetorRetribusiSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const data = parsed.data;

  const now = deps.clock.now();
  // A WIB calendar date the receipt names, turned into the instant it starts.
  // `wib()` is the one way that conversion happens, as everywhere in the app.
  const dibayarkanPada = wib(`${data.dibayarkanPada} 00:00`);
  if (dibayarkanPada.getTime() > now.getTime()) return { ok: false, reason: "tanggal_di_masa_depan" };

  if (data.bukti.body.byteLength > BUKTI_MAX_BYTES) return { ok: false, reason: "input_tidak_valid" };
  const extension = documentExtension(data.bukti, BUKTI_TYPES);
  if (!extension) return { ok: false, reason: "berkas_tidak_didukung" };

  // Billing's own read is the only place the amount, the number and "was this
  // ever a Retribusi at all" come from, so a Rp 0 or retribusi-free Tagihan
  // cannot be recorded as paid to a town.
  const [tagihan] = (await deps.billing.tagihanRetribusiLunas()).filter((row) => row.tagihanId === data.tagihanId);
  if (!tagihan) return { ok: false, reason: "tagihan_tidak_ada" };

  const buktiKey = `setor-retribusi/${tagihan.tagihanId}/${randomUUID()}.${extension}`;
  try {
    await deps.files.put({ key: buktiKey, body: data.bukti.body, contentType: data.bukti.contentType });
  } catch {
    return { ok: false, reason: "berkas_gagal_disimpan" };
  }

  const written = await tulisSetor(deps, by, {
    tagihan,
    dibayarkanPada,
    buktiKey,
    catatan: data.catatan,
    tugasLapanganId,
    now,
  });
  // A key nothing references is a dead file.
  if (!written.ok) await deps.files.delete(buktiKey).catch(() => undefined);
  return written;
}

/** What the one write needs, from whichever door it was reached through. */
interface SetorWrite {
  tagihan: RetribusiTagihan;
  dibayarkanPada: Date;
  /** The private FileStore key of the receipt, whichever upload put it there. */
  buktiKey: string;
  catatan: string;
  /** The "Setor Retribusi" Tugas whose upload carried the proof, when there was one. */
  tugasLapanganId: string | null;
  now: Date;
}

/**
 * The one write behind both doors — Admin Platform's own recording and a
 * Petugas's completed Setor Retribusi Tugas — so a town is paid once and the
 * Tier 3 row closes the same way whoever paid. Callers hold an open transaction
 * when they have one, so the recording commits with the work that produced it.
 */
export async function tulisSetor(
  deps: SetorRetribusiDeps,
  by: Actor,
  write: SetorWrite,
): Promise<CatatSetorRetribusiResult> {
  const { tagihan, dibayarkanPada, buktiKey, catatan, tugasLapanganId, now } = write;
  const role = by.roles.includes("admin_platform") ? "admin_platform" : "petugas_lapangan";
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    // The unique index on tagihan_id is the real guard: two staff pressing the
    // button at once cannot record two payments to one town.
    const [row] = await tx
      .insert(fieldworkSetorRetribusi)
      .values({
        tagihanId: tagihan.tagihanId,
        nomorTagihan: tagihan.nomorTagihan,
        amount: tagihan.amount,
        dibayarkanPada,
        buktiKey,
        dicatatOleh: by.accountId,
        dicatatOlehPeran: role,
        tugasLapanganId,
        catatan: catatan === "" ? null : catatan,
        dicatatPada: now,
      })
      .onConflictDoNothing()
      .returning();
    if (!row) return { ok: false as const, reason: "sudah_disetor" as const };
    await record({
      actor: { accountId: by.accountId, role },
      action: "setor_retribusi.catat",
      entity: { kind: "setor_retribusi", id: row.id },
      lokasiId: null,
      before: null,
      after: {
        nomorTagihan: tagihan.nomorTagihan,
        amount: tagihan.amount,
        dibayarkanPada: wibDateOf(dibayarkanPada),
        tugasLapanganId,
      },
      reason: catatan === "" ? null : catatan,
    });
    return {
      ok: true as const,
      setor: {
        id: row.id,
        tagihanId: row.tagihanId,
        nomorTagihan: row.nomorTagihan,
        amount: row.amount,
        dibayarkanPada: row.dibayarkanPada,
        dicatatOleh: row.dicatatOleh,
        tugasLapanganId: row.tugasLapanganId,
      },
    };
  });
}

/**
 * Every open Setor Retribusi, oldest Lunas first: a Lunas Tagihan with a
 * non-zero Retribusi Daerah line that nobody has paid on to the town yet. The
 * Antrean's Tier 3 row type is a plain projection of this, so recording the
 * payment closes the row without the row knowing anything about it.
 *
 * The deadline is two working days after Lunas on the Admin Platform calendar
 * (Monday–Friday less the Hari Libur Nasional list, ticket 11), counted by
 * Lokasi's own calculator and never re-implemented here. It is null only when
 * that calculator refuses, which for the fixed calendar it never does.
 */
export async function setorRetribusiTerbuka(deps: SetorRetribusiDeps): Promise<SetorRetribusiTerbuka[]> {
  const semua = await deps.billing.tagihanRetribusiLunas();
  if (semua.length === 0) return [];

  const [recorded, calendar] = await Promise.all([
    deps.db
      .select({ tagihanId: fieldworkSetorRetribusi.tagihanId })
      .from(fieldworkSetorRetribusi)
      .where(inArray(fieldworkSetorRetribusi.tagihanId, semua.map((row) => row.tagihanId))),
    deps.lokasi.adminPlatformCalendar(),
  ]);
  const settled = new Set(recorded.map((row) => row.tagihanId));
  const open = semua.filter((row) => !settled.has(row.tagihanId));
  if (open.length === 0) return [];

  // The Petugas a Setor Retribusi Tugas was handed for each of them, so the
  // row can say who is going.
  const tugas = await deps.db
    .select({ id: fieldworkTugas.id, tagihanId: fieldworkTugas.tagihanId, assigneeAccountId: fieldworkTugas.assigneeAccountId })
    .from(fieldworkTugas)
    .where(and(eq(fieldworkTugas.type, "setor_retribusi"), inArray(fieldworkTugas.tagihanId, open.map((row) => row.tagihanId))));

  return open.map((row) => {
    const deadline = addWorkingDays(calendar, row.lunasAt, SETOR_RETRIBUSI_HARI_KERJA);
    const ditugaskan = tugas.find((satu) => satu.tagihanId === row.tagihanId);
    return {
      tagihanId: row.tagihanId,
      nomorTagihan: row.nomorTagihan,
      nomorPemesanan: row.nomorPemesanan,
      placeName: row.placeName,
      lunasAt: row.lunasAt,
      amount: row.amount,
      dueAt: deadline.ok ? deadline.at : null,
      tugasLapanganId: ditugaskan?.id ?? null,
      assigneeAccountId: ditugaskan?.assigneeAccountId ?? null,
    };
  });
}

/** Two working days, the deadline the Tier 3 row is given (spec, Work Queues). */
export const SETOR_RETRIBUSI_HARI_KERJA = 2;
