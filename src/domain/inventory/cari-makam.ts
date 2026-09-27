/**
 * The Makam keluarga hub's lookup (spec, Inventory > lookup, "Also exposes:
 * lookup by Lokasi + Nomor Makam / Nomor Kavling or Almarhum name + year of
 * death, returning only Almarhum names, numbers, status and end date. For a
 * Kavling Keluarga the whole kavling is returned, since a Perpanjangan covers
 * all of it"): a family answering "Di mana makamnya?" without a session, and
 * with no idea who holds the Hak Pakai.
 *
 * What this read may return is the whole point of it, so the return type is the
 * rule and not a comment: a `MakamDitemukan` carries the Almarhum names, the
 * current Nomor Makam / Nomor Kavling, the Hak Pakai status and its end date,
 * and the id of the unit itself, which is what a later ticket addresses the
 * grave by. The Pemegang Hak's name, number and email are not in the type, are
 * never selected into it, and never reach a payload: an heir looking for a
 * deceased holder's plot learns where it is and nothing about the living holder.
 *
 * A number the Petak was renumbered from is matched (ticket 14's hidden alias)
 * and is never returned — only the Petak's current Nomor Makam travels.
 */
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { normaliseEmail } from "@/domain/identity";
import { wibDateOf } from "@/lib/time/jakarta";
import type { InventoryDeps } from "./deps";
import { currentHakPakaiOfKavling, currentHakPakaiOfPetak, type HakPakaiRow } from "./hak-pakai-reads";
import { foldKey } from "./ids";
import { findPetakByNomor } from "./lookup";
import { namaAlmarhumCocok } from "./nama-almarhum";
import { inventoryCariMakamAttempt, inventoryHakPakai, inventoryKavling, inventoryPemakaman, inventoryPemegangHak, inventoryPetak } from "./schema";
import type { HakPakaiStatus } from "./status";

/** How many lookups one IP may make in the window below, hit or miss. */
export const CARI_MAKAM_MAKS_PER_IP = 10;
/** The rolling window those are counted in, in minutes. */
export const CARI_MAKAM_JENDELA_MENIT = 15;
const JENDELA_MS = CARI_MAKAM_JENDELA_MENIT * 60_000;
/** The attempt records are kept this long; the limit itself only ever looks back one window. */
export const CARI_MAKAM_ATTEMPT_KEPT_MS = 24 * 3_600_000;

/** Which of the three ways a family names the grave they are looking for. */
export type PermintaanCariMakam =
  /** Nomor Makam: the plot's current number, or one it was renumbered from. */
  | { bentuk: "nomor_makam"; lokasiId: string; nomor: string }
  /** Nomor Kavling: a Kavling Keluarga's own number. */
  | { bentuk: "nomor_kavling"; lokasiId: string; nomor: string }
  /** Almarhum name + the year they died, in any case and with any spacing. */
  | { bentuk: "nama"; lokasiId: string; nama: string; tahun: number };

/** One family's lookup, with the IP the per-IP limit counts it under. */
export type PermintaanDariIP = PermintaanCariMakam & { ip: string };

/**
 * One grave, and the whole of what a family is told about it. Every key here is
 * one AC 2 allows; a test reads the keys, so a new one has to be argued for.
 */
export interface PetakDitemukan {
  petakId: string;
  /** The current Nomor Makam only: an alias left by a renumber is never returned. */
  nomorMakam: string;
  /** Every Almarhum buried here, oldest first. Names only — this lookup answers where, not when. */
  almarhum: string[];
  statusHakPakai: HakPakaiStatus;
  /** The Hak Pakai's end date as a WIB calendar date; null while perpetual, or before the tenure clock has started. */
  tanggalBerakhir: string | null;
}

export interface MakamDitemukan {
  lokasiId: string;
  /** The Kavling Keluarga, when the match is one of its Petak; the whole kavling is returned then. */
  kavlingId: string | null;
  nomorKavling: string | null;
  /** The one Petak, or every Petak of the Kavling Keluarga, in reading order. */
  petak: PetakDitemukan[];
}

export type HasilCariMakam = { ok: true; ditemukan: MakamDitemukan[] } | { ok: false; reason: "terlalu_sering"; retryAt: Date };

/**
 * Every key a `HasilCariMakam` may carry, at any depth: the answer's own
 * `ditemukan` / `petak` containers, the four data classes AC 2 allows (Almarhum
 * names, numbers, Hak Pakai status, end date), the id of the unit a later ticket
 * addresses the grave by, and the refusal's own `reason` / `retryAt`. A privacy
 * test reads a returned answer's keys against this list, so a field nobody
 * argued for cannot reach a payload and merely be left unrendered.
 */
export const KUNCI_HASIL_CARI_MAKAM = [
  "ok",
  "reason",
  "retryAt",
  "ditemukan",
  "petak",
  "lokasiId",
  "kavlingId",
  "nomorKavling",
  "petakId",
  "nomorMakam",
  "almarhum",
  "statusHakPakai",
  "tanggalBerakhir",
] as const;

/**
 * Where a grave is, as a family is told: every match is a unit somebody holds
 * (a Petak with a Hak Pakai of its own, or a Kavling Keluarga's), so a plot
 * nobody has bought is not a result and cannot be told apart from a number that
 * was never used. A match inside a Kavling Keluarga answers with the whole
 * kavling, because one Hak Pakai and one Perpanjangan cover all of it.
 *
 * The per-IP limit is counted here, in the module, and not in the caller: a
 * Server Action, a route handler and a later ticket's wizard all reach this one
 * function, so none of them can be a way round it.
 */
export async function cariMakam(deps: InventoryDeps, input: PermintaanDariIP): Promise<HasilCariMakam> {
  const klaim = await klaimPercobaan(deps, input.ip);
  if (!klaim.ok) return klaim;

  const units = await unitsOf(deps, input);
  const ditemukan: MakamDitemukan[] = [];
  for (const unit of units) {
    const found = await hasilUnit(deps, input.lokasiId, unit);
    if (found) ditemukan.push(found);
  }
  return { ok: true, ditemukan };
}

/**
 * Every grave whose **current** Pemegang Hak recorded this email, at any Lokasi
 * Mitra: the Makam tab a signed-in Akun sees (CONTEXT.md, Hak Pakai: "it shows
 * in the Akun whose Email Terverifikasi equals the recorded email"). Same shape
 * as a lookup result, so the tab is a list of shortcuts into the hub rather than
 * a second copy of what the lookup says, and the holder's own details are not in
 * it — the Akun already knows its own email.
 *
 * A former holder's row (`end_at` set) is not the Akun's: Ganti Pemegang Hak
 * closes it, and only the current holder's grave belongs in the tab.
 */
export async function makamPemegangHak(deps: InventoryDeps, input: { email: string }): Promise<MakamDitemukan[]> {
  const email = normaliseEmail(input.email);
  if (!email) return [];
  const rows = await deps.db
    .select({ hakPakaiId: inventoryPemegangHak.hakPakaiId })
    .from(inventoryPemegangHak)
    .where(and(eq(inventoryPemegangHak.email, email), isNull(inventoryPemegangHak.endAt)));
  if (rows.length === 0) return [];

  const hakPakai = await deps.db
    .select({ lokasiId: inventoryHakPakai.lokasiId, petakId: inventoryHakPakai.petakId, kavlingId: inventoryHakPakai.kavlingId })
    .from(inventoryHakPakai)
    .where(inArray(inventoryHakPakai.id, rows.map((row) => row.hakPakaiId)))
    // The oldest right first, so the tab lists a family's graves in the order it took them.
    .orderBy(asc(inventoryHakPakai.startAt), asc(inventoryHakPakai.id));
  const ditemukan: MakamDitemukan[] = [];
  for (const hak of hakPakai) {
    const unit: Unit | null = hak.petakId ? { petakId: hak.petakId } : hak.kavlingId ? { kavlingId: hak.kavlingId } : null;
    if (!unit) continue;
    const found = await hasilUnit(deps, hak.lokasiId, unit);
    if (found) ditemukan.push(found);
  }
  return ditemukan;
}

/**
 * Counts one lookup from `ip` against its limit, or refuses it. Every attempt
 * counts, whether or not it finds anything, and the refusal is raised **before**
 * the question is asked, so it says nothing about what the answer would have been.
 * The advisory lock is per IP, so two tabs opened at once cannot both slip past
 * the last slot.
 */
async function klaimPercobaan(deps: InventoryDeps, ip: string): Promise<{ ok: true } | { ok: false; reason: "terlalu_sering"; retryAt: Date }> {
  const now = deps.clock.now();
  return deps.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`inventory.cari:${ip}`}))`);
    const terbaru = await tx
      .select({ dicobaAt: inventoryCariMakamAttempt.dicobaAt })
      .from(inventoryCariMakamAttempt)
      .where(and(eq(inventoryCariMakamAttempt.ip, ip), gt(inventoryCariMakamAttempt.dicobaAt, new Date(now.getTime() - JENDELA_MS))))
      .orderBy(desc(inventoryCariMakamAttempt.dicobaAt));
    if (terbaru.length >= CARI_MAKAM_MAKS_PER_IP) {
      // The window reopens when the attempt that fills it drops out of the window.
      const yangMenuh = terbaru[CARI_MAKAM_MAKS_PER_IP - 1];
      return { ok: false, reason: "terlalu_sering" as const, retryAt: new Date(yangMenuh.dicobaAt.getTime() + JENDELA_MS) };
    }
    await tx.insert(inventoryCariMakamAttempt).values({ ip, dicobaAt: now });
    return { ok: true as const };
  });
}

/**
 * Scheduler tick: deletes the attempt records older than 24 hours at `now`.
 * Idempotent: a second run for the same `now` deletes nothing.
 */
export async function pruneCariMakamAttempts(ctx: { db: Database }, now: Date): Promise<{ deleted: number }> {
  const deleted = await ctx.db
    .delete(inventoryCariMakamAttempt)
    .where(lt(inventoryCariMakamAttempt.dicobaAt, new Date(now.getTime() - CARI_MAKAM_ATTEMPT_KEPT_MS)))
    .returning({ id: inventoryCariMakamAttempt.id });
  return { deleted: deleted.length };
}

/** What a request names before it is loaded: a Petak Makam, or a whole Kavling Keluarga. */
type Unit = { petakId: string } | { kavlingId: string };

/** The units a request names: a Petak Makam, a Kavling Keluarga, or every Petak buried in `tahun` at that Lokasi Mitra. */
async function unitsOf(deps: InventoryDeps, input: PermintaanCariMakam): Promise<Unit[]> {
  switch (input.bentuk) {
    case "nomor_makam": {
      const petak = await findPetakByNomor(deps.db, input.lokasiId, input.nomor);
      return petak ? [{ petakId: petak.petakId }] : [];
    }
    case "nomor_kavling": {
      const key = foldKey(input.nomor);
      const rows = await deps.db
        .select({ kavlingId: inventoryKavling.id })
        .from(inventoryKavling)
        .where(and(eq(inventoryKavling.lokasiId, input.lokasiId), eq(inventoryKavling.nomorKavlingKey, key)));
      return rows.map((row): Unit => ({ kavlingId: row.kavlingId }));
    }
    case "nama": {
      // The year of death is asked for as well as the name, and it narrows the candidates to
      // the burials of one year at one Lokasi Mitra. What a person typed is compared here, in
      // JavaScript, and never put into a `LIKE`, where a `%` or a `_` would be a wildcard over
      // every grave in the cemetery. The year's two bounds are whole dates, bound as values.
      const dariTahun = `${input.tahun}-01-01`;
      const sampaiTahun = `${input.tahun + 1}-01-01`;
      const rows = await deps.db
        .select({ petakId: inventoryPemakaman.petakId, almarhumName: inventoryPemakaman.almarhumName })
        .from(inventoryPemakaman)
        .where(
          and(
            eq(inventoryPemakaman.lokasiId, input.lokasiId),
            gte(inventoryPemakaman.date, dariTahun),
            lt(inventoryPemakaman.date, sampaiTahun),
          ),
        );
      const cocok = new Set(rows.filter((row) => namaAlmarhumCocok(row.almarhumName, input.nama)).map((row) => row.petakId));
      return [...cocok].map((petakId): Unit => ({ petakId }));
    }
  }
}

/**
 * One unit as a family is told, or null when it is nobody's (no Hak Pakai, so
 * nothing is owed to anyone and there is no grave to point at).
 */
async function hasilUnit(deps: InventoryDeps, lokasiId: string, unit: Unit): Promise<MakamDitemukan | null> {
  return "kavlingId" in unit ? hasilKavling(deps, lokasiId, unit.kavlingId) : hasilPetak(deps, lokasiId, unit.petakId);
}

/** A Petak of its own. One that belongs to a Kavling Keluarga is answered with the Kavling: one Hak Pakai covers all of it. */
async function hasilPetak(deps: InventoryDeps, lokasiId: string, petakId: string): Promise<MakamDitemukan | null> {
  const kavlingId = await kavlingIdOfPetak(deps, lokasiId, petakId);
  if (kavlingId !== null) return hasilKavling(deps, lokasiId, kavlingId);

  const hakPakai = await currentHakPakaiOfPetak(deps.db, petakId);
  if (!hakPakai) return null;
  const petak = await petakOf(deps, lokasiId, petakId);
  if (!petak) return null;
  return { lokasiId, kavlingId: null, nomorKavling: null, petak: [await baris(deps, petak, hakPakai)] };
}

/** A whole Kavling Keluarga: every Petak in it, under the one Hak Pakai that covers it. */
async function hasilKavling(deps: InventoryDeps, lokasiId: string, kavlingId: string): Promise<MakamDitemukan | null> {
  const hakPakai = await currentHakPakaiOfKavling(deps.db, kavlingId);
  if (!hakPakai) return null;
  const kavling = await kavlingOf(deps, lokasiId, kavlingId);
  if (!kavling) return null;
  const anggota = await anggotaKavling(deps, kavlingId);
  return { lokasiId, kavlingId, nomorKavling: kavling.nomorKavling, petak: await Promise.all(anggota.map((satu) => baris(deps, satu, hakPakai))) };
}

/** One Petak Makam as a family is told it: its current number, who lies in it, and the Hak Pakai that covers it. */
async function baris(deps: InventoryDeps, petak: { id: string; nomorMakam: string }, hakPakai: HakPakaiRow): Promise<PetakDitemukan> {
  const almarhum = await almarhumPerPetak(deps, [petak.id]);
  return {
    petakId: petak.id,
    nomorMakam: petak.nomorMakam,
    almarhum: almarhum.get(petak.id) ?? [],
    statusHakPakai: hakPakai.status,
    tanggalBerakhir: tanggalBerakhir(hakPakai),
  };
}

/** The Kavling Keluarga a Petak belongs to, or null for a Petak of its own (and null when the id names nothing at that Lokasi Mitra). */
async function kavlingIdOfPetak(deps: InventoryDeps, lokasiId: string, petakId: string): Promise<string | null> {
  const [row] = await deps.db
    .select({ kavlingId: inventoryPetak.kavlingId })
    .from(inventoryPetak)
    .where(and(eq(inventoryPetak.id, petakId), eq(inventoryPetak.lokasiId, lokasiId)))
    .limit(1);
  return row?.kavlingId ?? null;
}

/** The Petak Makam itself, with its current Nomor Makam; null when the id names no Petak of that Lokasi Mitra. */
async function petakOf(deps: InventoryDeps, lokasiId: string, petakId: string): Promise<{ id: string; nomorMakam: string } | null> {
  const [row] = await deps.db
    .select({ id: inventoryPetak.id, nomorMakam: inventoryPetak.nomorMakam })
    .from(inventoryPetak)
    .where(and(eq(inventoryPetak.id, petakId), eq(inventoryPetak.lokasiId, lokasiId)))
    .limit(1);
  if (!row || row.nomorMakam === null) return null;
  return { id: row.id, nomorMakam: row.nomorMakam };
}

/** The Kavling Keluarga itself, with its own Nomor Kavling; null when the id names none at that Lokasi Mitra. */
async function kavlingOf(deps: InventoryDeps, lokasiId: string, kavlingId: string) {
  const [row] = await deps.db
    .select({ id: inventoryKavling.id, nomorKavling: inventoryKavling.nomorKavling })
    .from(inventoryKavling)
    .where(and(eq(inventoryKavling.id, kavlingId), eq(inventoryKavling.lokasiId, lokasiId)))
    .limit(1);
  return row ?? null;
}

/** Every Petak of a Kavling Keluarga, in reading order: the whole kavling is what the family is shown. */
async function anggotaKavling(deps: InventoryDeps, kavlingId: string): Promise<{ id: string; nomorMakam: string }[]> {
  const rows = await deps.db
    .select({ id: inventoryPetak.id, nomorMakam: inventoryPetak.nomorMakam })
    .from(inventoryPetak)
    .where(eq(inventoryPetak.kavlingId, kavlingId))
    .orderBy(asc(inventoryPetak.row), asc(inventoryPetak.col));
  return rows.flatMap((row) => (row.nomorMakam === null ? [] : [{ id: row.id, nomorMakam: row.nomorMakam }]));
}

/** The Almarhum names in each of these Petak, oldest burial first. */
async function almarhumPerPetak(deps: InventoryDeps, petakIds: readonly string[]): Promise<Map<string, string[]>> {
  const perPetak = new Map<string, string[]>();
  if (petakIds.length === 0) return perPetak;
  const rows = await deps.db
    .select({ petakId: inventoryPemakaman.petakId, almarhumName: inventoryPemakaman.almarhumName })
    .from(inventoryPemakaman)
    .where(inArray(inventoryPemakaman.petakId, [...petakIds]))
    .orderBy(asc(inventoryPemakaman.date), asc(inventoryPemakaman.id));
  for (const row of rows) perPetak.set(row.petakId, [...(perPetak.get(row.petakId) ?? []), row.almarhumName]);
  return perPetak;
}

/** The Hak Pakai's end date as a WIB calendar date; null while perpetual or before the tenure clock starts. */
function tanggalBerakhir(hakPakai: HakPakaiRow): string | null {
  return hakPakai.endDate === null ? null : wibDateOf(hakPakai.endDate);
}
