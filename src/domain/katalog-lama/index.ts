/**
 * Katalog Lama: the catalog codes an import brought across, kept beside the
 * Lokasi Mitra and Jenis Makam it created (ticket 86). The name is the role, not
 * one source: any catalog export carries a stable code per row (the old app's
 * `cemeteries.slug`, a CSV's own id), and that code is what the ledger keys on.
 *
 * Owns tables: katalog_lama_lokasi, katalog_lama_jenis_makam.
 *
 * The old app's own code is the key, never a v1 id: it is the one identifier
 * both databases agree on. So the import claims a code before it creates
 * anything, binds it to what it created afterwards, and a second run over the
 * same export finds every claim taken and creates nothing twice. A claim with
 * nothing bound to it is an import that was cut short: it stays visible here,
 * and the import refuses it rather than creating a second Lokasi Mitra.
 *
 * Only Admin Platform writes here, under `lokasi.buat` (the action an import
 * is, whichever catalog row it touches): where a row came from is an operator's
 * record, not something a Lokasi Mitra decides for itself. Each bind records an
 * Entri Audit in its own transaction, on the Lokasi Mitra it names; a claim
 * records none, being a reservation that every finished import audits through
 * its bind.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import type { AuditLog, RecordEntry } from "@/domain/audit";
import { semuaLokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { Clock } from "@/ports/clock";
import { katalogLamaJenisMakam, katalogLamaLokasi } from "./schema";

/** A claim of an old catalog code, and whatever this import has bound to it. */
export interface ImporLokasi {
  /** The source's own code for this Lokasi: the key the whole import is idempotent on. */
  kode: string;
  /** The Lokasi Mitra the Lokasi module created; null while the claim is unbound. */
  lokasiId: string | null;
  diklaimPada: Date;
  diimporPada: Date | null;
  /** Whether a Lokasi Mitra is bound to this claim. */
  sudahTerikat: boolean;
}

/** A claim of an old Jenis Makam code, under the old code of the Lokasi it sits in. */
export interface ImporJenisMakam {
  kode: string;
  /** The old app's code of the Lokasi this Jenis Makam sits under. */
  lokasiKode: string;
  jenisMakamId: string | null;
  diklaimPada: Date;
  diimporPada: Date | null;
  sudahTerikat: boolean;
}

export type ClaimLokasiResult =
  | { ok: true; impor: ImporLokasi }
  | WriteRefusal
  /** The code is already claimed: imported before, or an import that was cut short. */
  | { ok: false; reason: "sudah_diklaim"; milik: ImporLokasi };

export type CatatLokasiResult =
  | { ok: true; impor: ImporLokasi }
  | WriteRefusal
  | { ok: false; reason: "tidak_diklaim" }
  | { ok: false; reason: "sudah_diimpor" };

export type ClaimJenisMakamResult =
  | { ok: true; impor: ImporJenisMakam }
  | WriteRefusal
  | { ok: false; reason: "sudah_diklaim"; milik: ImporJenisMakam }
  /** The old Lokasi code has not been imported, so this Jenis Makam has no Lokasi Mitra to sit in. */
  | { ok: false; reason: "lokasi_belum_diimpor" };

export type CatatJenisMakamResult =
  | { ok: true; impor: ImporJenisMakam }
  | WriteRefusal
  | { ok: false; reason: "tidak_diklaim" }
  | { ok: false; reason: "lokasi_belum_diimpor" }
  | { ok: false; reason: "sudah_diimpor" };

export interface KatalogLamaDeps {
  db: Database;
  clock: Clock;
  audit: AuditLog;
}

/** The reason an import writes carry, so the Audit Log says where a row came from. */
export const IMPOR_KATALOG_LAMA = "impor katalog aplikasi lama";

export interface KatalogLama {
  /** What is claimed or bound to this old Lokasi code, or null when the code was never seen. */
  lokasi(kode: string): Promise<ImporLokasi | null>;
  /** Reserves an old Lokasi code for this import; refused when the code is already claimed. */
  claimLokasi(by: Actor, input: { kode: string }): Promise<ClaimLokasiResult>;
  /** Binds a claimed code to the Lokasi Mitra the Lokasi module created, audited on that Lokasi Mitra. */
  catatLokasi(by: Actor, input: { kode: string; lokasiId: string; reason: string | null }): Promise<CatatLokasiResult>;
  /** What is claimed or bound to this old Jenis Makam code, or null when the code was never seen. */
  jenisMakam(kode: string): Promise<ImporJenisMakam | null>;
  /** Reserves an old Jenis Makam code under its old Lokasi code, which must itself be imported. */
  claimJenisMakam(by: Actor, input: { kode: string; lokasiKode: string }): Promise<ClaimJenisMakamResult>;
  /** Binds a claimed code to the Jenis Makam the Tariffs module created, audited on its Lokasi Mitra. */
  catatJenisMakam(by: Actor, input: { kode: string; jenisMakamId: string; reason: string | null }): Promise<CatatJenisMakamResult>;
  /** Every claim so far, in code order: what this import has already brought across. */
  diimpor(): Promise<{ lokasi: ImporLokasi[]; jenisMakam: ImporJenisMakam[] }>;
}

const kodeSchema = z.string().trim().min(1).max(60);
const kodeDanUuid = (uuid: string) => z.object({ kode: kodeSchema, [uuid]: z.uuid() });

/**
 * The old code, or a thrown error: every code here comes from the catalog export
 * contract, which has already checked it, so a code that is not one is a bug in
 * the caller rather than anything to store.
 */
function kode(input: string): string {
  const parsed = kodeSchema.safeParse(input);
  if (!parsed.success) throw new Error(`Katalog Lama: kode katalog lama tidak valid: ${JSON.stringify(input)}`);
  return parsed.data;
}

function toImporLokasi(row: typeof katalogLamaLokasi.$inferSelect): ImporLokasi {
  return {
    kode: row.kode,
    lokasiId: row.lokasiId,
    diklaimPada: row.diklaimPada,
    diimporPada: row.diimporPada,
    sudahTerikat: row.lokasiId !== null,
  };
}

function toImporJenisMakam(row: typeof katalogLamaJenisMakam.$inferSelect): ImporJenisMakam {
  return {
    kode: row.kode,
    lokasiKode: row.lokasiKode,
    jenisMakamId: row.jenisMakamId,
    diklaimPada: row.diklaimPada,
    diimporPada: row.diimporPada,
    sudahTerikat: row.jenisMakamId !== null,
  };
}

export function createKatalogLama(deps: KatalogLamaDeps): KatalogLama {
  /** What is claimed or bound to this old Lokasi code, or null when the code was never seen. */
  async function lokasiOf(kodeLama: string): Promise<ImporLokasi | null> {
    const [row] = await deps.db.select().from(katalogLamaLokasi).where(eq(katalogLamaLokasi.kode, kode(kodeLama)));
    return row ? toImporLokasi(row) : null;
  }

  /** What is claimed or bound to this old Jenis Makam code, or null when the code was never seen. */
  async function jenisMakamOf(kodeLama: string): Promise<ImporJenisMakam | null> {
    const [row] = await deps.db.select().from(katalogLamaJenisMakam).where(eq(katalogLamaJenisMakam.kode, kode(kodeLama)));
    return row ? toImporJenisMakam(row) : null;
  }

  /**
   * The one Entri Audit entry a bind records: the old code beside the v1 id it
   * became, on the Lokasi Mitra it names. It is written inside the bind's own
   * transaction (`record`), never beside it: a bind that committed without its
   * entry would be skipped by the next run with nothing to show for it.
   */
  async function catatImport(
    record: RecordEntry,
    input: {
      aktorAccountId: string;
      entity: "lokasi_mitra" | "jenis_makam";
      id: string;
      lokasiId: string;
      kode: string;
      reason: string | null;
    },
  ): Promise<void> {
    await record({
      actor: { accountId: input.aktorAccountId, role: "admin_platform" },
      action: "katalog_lama.impor",
      entity: { kind: input.entity, id: input.id },
      lokasiId: input.lokasiId,
      before: null,
      after: { kode: input.kode, [input.entity === "lokasi_mitra" ? "lokasiId" : "jenisMakamId"]: input.id },
      reason: input.reason,
    });
  }

  return {
    lokasi: lokasiOf,

    async claimLokasi(by, input) {
      const refusal = writeRefusal(by, "lokasi.buat", semuaLokasiMitraResource());
      if (refusal) return refusal;
      const kodeLama = kode(input.kode);
      const claimed = await deps.db
        .insert(katalogLamaLokasi)
        .values({ kode: kodeLama, diklaimPada: deps.clock.now() })
        .onConflictDoNothing()
        .returning();
      if (!claimed[0]) return { ok: false, reason: "sudah_diklaim", milik: (await lokasiOf(kodeLama))! };
      return { ok: true, impor: toImporLokasi(claimed[0]) };
    },

    async catatLokasi(by, input) {
      const refusal = writeRefusal(by, "lokasi.buat", semuaLokasiMitraResource());
      if (refusal) return refusal;
      const parsed = kodeDanUuid("lokasiId").parse(input);
      return deps.audit.staffWrite(deps.db, async (tx, record) => {
        const [claim] = await tx
          .select()
          .from(katalogLamaLokasi)
          .where(eq(katalogLamaLokasi.kode, kode(parsed.kode)))
          .for("update");
        if (!claim) return { ok: false as const, reason: "tidak_diklaim" as const };
        if (claim.lokasiId !== null) return { ok: false as const, reason: "sudah_diimpor" as const };
        const [bound] = await tx
          .update(katalogLamaLokasi)
          .set({ lokasiId: parsed.lokasiId, diimporPada: deps.clock.now(), diimporOleh: by.accountId })
          .where(and(eq(katalogLamaLokasi.kode, parsed.kode), isNull(katalogLamaLokasi.lokasiId)))
          .returning();
        await catatImport(record, {
          aktorAccountId: by.accountId,
          entity: "lokasi_mitra",
          id: parsed.lokasiId,
          lokasiId: parsed.lokasiId,
          kode: parsed.kode,
          reason: input.reason,
        });
        return { ok: true as const, impor: toImporLokasi(bound) };
      });
    },

    jenisMakam: jenisMakamOf,

    async claimJenisMakam(by, input) {
      const refusal = writeRefusal(by, "lokasi.buat", semuaLokasiMitraResource());
      if (refusal) return refusal;
      const parsed = z.object({ kode: kodeSchema, lokasiKode: kodeSchema }).parse(input);
      if (!(await lokasiOf(parsed.lokasiKode))?.sudahTerikat) {
        return { ok: false, reason: "lokasi_belum_diimpor" };
      }
      const claimed = await deps.db
        .insert(katalogLamaJenisMakam)
        .values({ kode: parsed.kode, lokasiKode: parsed.lokasiKode, diklaimPada: deps.clock.now() })
        .onConflictDoNothing()
        .returning();
      if (!claimed[0]) return { ok: false, reason: "sudah_diklaim", milik: (await jenisMakamOf(parsed.kode))! };
      return { ok: true, impor: toImporJenisMakam(claimed[0]) };
    },

    async catatJenisMakam(by, input) {
      const refusal = writeRefusal(by, "lokasi.buat", semuaLokasiMitraResource());
      if (refusal) return refusal;
      const parsed = kodeDanUuid("jenisMakamId").parse(input);
      const klaim = await jenisMakamOf(parsed.kode);
      if (!klaim) return { ok: false, reason: "tidak_diklaim" };
      const indukLokasiId = (await lokasiOf(klaim.lokasiKode))?.lokasiId ?? null;
      if (!indukLokasiId) return { ok: false, reason: "lokasi_belum_diimpor" };
      return deps.audit.staffWrite(deps.db, async (tx, record) => {
        const [claim] = await tx
          .select()
          .from(katalogLamaJenisMakam)
          .where(eq(katalogLamaJenisMakam.kode, parsed.kode))
          .for("update");
        if (!claim) return { ok: false as const, reason: "tidak_diklaim" as const };
        if (claim.jenisMakamId !== null) return { ok: false as const, reason: "sudah_diimpor" as const };
        const [bound] = await tx
          .update(katalogLamaJenisMakam)
          .set({ jenisMakamId: parsed.jenisMakamId, diimporPada: deps.clock.now(), diimporOleh: by.accountId })
          .where(and(eq(katalogLamaJenisMakam.kode, parsed.kode), isNull(katalogLamaJenisMakam.jenisMakamId)))
          .returning();
        await catatImport(record, {
          aktorAccountId: by.accountId,
          entity: "jenis_makam",
          id: parsed.jenisMakamId,
          lokasiId: indukLokasiId,
          kode: parsed.kode,
          reason: input.reason,
        });
        return { ok: true as const, impor: toImporJenisMakam(bound) };
      });
    },

    async diimpor() {
      const [lokasi, jenisMakam] = await Promise.all([
        deps.db.select().from(katalogLamaLokasi).orderBy(asc(katalogLamaLokasi.kode)),
        deps.db.select().from(katalogLamaJenisMakam).orderBy(asc(katalogLamaJenisMakam.kode)),
      ]);
      return { lokasi: lokasi.map(toImporLokasi), jenisMakam: jenisMakam.map(toImporJenisMakam) };
    },
  };
}
