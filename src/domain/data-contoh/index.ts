/**
 * Data Contoh (ticket 109): the example records a beta shows on a stack that
 * has no real operation yet, each marked "(Contoh)", and the one command that
 * removes all of them before real operation starts. The name is the glossary's
 * (CONTEXT.md).
 *
 * Owns table: data_contoh_entri.
 *
 * The registry is a ledger on the Katalog Lama pattern: every entity a set
 * planted is recorded under the fixture's own code (`rilis1/lokasi/...`), at most
 * one active row per code, so planting twice creates nothing twice. The module
 * decides what planting and retiring MEAN; what a set contains (five Lokasi
 * Mitra through the real publish gate, their Denah, staff, prices) is the
 * command's, which hands `tanam` a plan of fixtures and builds each through the
 * owning modules' public functions.
 *
 * A retired Lokasi Mitra is marked `data_contoh` (hidden from every public
 * read, never publishable again, Lokasi module) and its staff Akun are
 * Dinonaktifkan (Identity). A price version cannot be retired: Tariffs only ever
 * inserts versions. A GLOBAL price a set entered (the Biaya Layanan Platform) is
 * therefore retired by being superseded: `cabut` refuses, and changes nothing,
 * while a contoh version of one is still the version in force (or will be, on a
 * date still ahead), because the next real order would be charged an example
 * price. The registry never lets go of such a price any other way either: a
 * `tanam` cleaning up after a build cut short finishes that row instead of
 * retiring it. A price tied to a contoh Lokasi Mitra goes with it: nothing can
 * quote a hidden Lokasi Mitra.
 *
 * A contoh price is one the registry names OR one a `tanam` entered: Tariffs
 * writes an Entri Audit with each version, whose reason is the run's and starts
 * with `AWALAN_ALASAN_TANAM`, which an Operator's own never does. A run killed
 * between entering the price and recording it therefore leaves a price the
 * registry does not hold but still knows of: `cabut` refuses over it, `status`
 * lists it, `aktif` counts it, and the next `tanam` whose fixture names the
 * price's key records it instead of entering a second one. And a version that
 * another example version superseded is no real successor: only a version no
 * `tanam` entered lets a contoh price go.
 *
 * Only Admin Platform writes here, under `lokasi.buat` (the action creating or
 * hiding a Lokasi Mitra is), like the Katalog Lama ledger. Each owning module
 * checks and audits its own write; this module audits its own rows.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import type { AuditEntry, AuditLog } from "@/domain/audit";
import { semuaLokasiMitraResource, writeRefusal, type Actor, type Identity, type WriteRefusal } from "@/domain/identity";
import type { Lokasi } from "@/domain/lokasi";
import type { PesananBerjalan } from "@/domain/pemesanan";
import type { GlobalTariffKey, GlobalTariffVersion, Tariffs } from "@/domain/tariffs";
import { GLOBAL_TARIFF_KEYS } from "@/domain/tariffs";
import type { Clock } from "@/ports/clock";
import { dataContohEntri } from "./schema";

/**
 * How the reason of every `tanam` run starts. It is the one mark the Audit Log keeps of who entered a price version, so
 * `tanam` refuses a reason that does not carry it: its prices could not be told from an Operator's afterwards.
 */
export const AWALAN_ALASAN_TANAM = "data-contoh tanam";

/** The sets a stack can be planted with; ticket 111 adds the next one here. */
export const himpunanDataContoh = ["rilis1"] as const;
export type HimpunanDataContoh = (typeof himpunanDataContoh)[number];

/** What kinds of entity a registry row can name. */
export const jenisDataContoh = ["lokasi_mitra", "jenis_makam", "akun_staf", "tarif_global", "penawaran_layanan"] as const;
export type JenisDataContoh = (typeof jenisDataContoh)[number];

/** One recorded entity: a fixture code, and the entity the owning module created for it. */
export interface EntriDataContoh {
  kode: string;
  himpunan: HimpunanDataContoh;
  jenis: JenisDataContoh;
  /** The owning module's id; for a global price version, `<tariff key>:<version seq>`. */
  entitasId: string;
  /** The code of the Lokasi Mitra entry this one belongs to, or null for a root entry. */
  indukKode: string | null;
  /** False while its build is still running; an active entry left that way is a build cut short. */
  lengkap: boolean;
  dicatatPada: Date;
  dicabutPada: Date | null;
}

export interface CatatInput {
  kode: string;
  himpunan: HimpunanDataContoh;
  jenis: JenisDataContoh;
  entitasId: string;
  indukKode?: string | null;
  reason: string;
}

export type CatatResult =
  | { ok: true; entri: EntriDataContoh; /** False when the code was already recorded for this very entity: nothing changed. */ baru: boolean }
  | WriteRefusal
  | { ok: false; reason: "alasan_wajib" }
  | { ok: false; reason: "kode_dipakai_entitas_lain"; milik: EntriDataContoh };

/** What a fixture's build is handed to record what it creates, the moment it creates it. */
export interface KonteksTanam {
  /** Records the plan item's own entity (its Lokasi Mitra), right after it is created: from then on `cabut` and a cut-short rerun can find it. */
  catatInduk(entitasId: string): Promise<void>;
  /** Records an entity created under the plan item (its Jenis Makam, its staff Akun); recording the same code twice is harmless. */
  catatAnak(input: { kode: string; jenis: JenisDataContoh; entitasId: string }): Promise<void>;
}

/** One fixture of a set: its code, and how to build it through the owning modules when the registry holds none. */
interface RencanaTanamDasar {
  kode: string;
  buat(ctx: KonteksTanam): Promise<{ ok: true } | { ok: false; reason: string }>;
}

export type RencanaTanam =
  | (RencanaTanamDasar & { jenis: Exclude<JenisDataContoh, "tarif_global"> })
  | (RencanaTanamDasar & {
      jenis: "tarif_global";
      /**
       * The global price the fixture enters. With it, `tanam` first records a contoh version of that price a killed run
       * entered and never recorded, instead of building the fixture (which would enter a second version); without it,
       * nothing is recorded in place of the build.
       */
      kunciTarif?: GlobalTariffKey;
    });

export type TanamResult =
  | {
      ok: true;
      /** Fixtures built and recorded this run. */
      dibuat: string[];
      /** Fixtures the registry already held complete: left alone. */
      sudahAda: string[];
      /** Fixtures whose build found nothing to plant (a price a real version already holds): recorded nowhere, asked again next run. */
      dilewati: string[];
    }
  | WriteRefusal
  | { ok: false; reason: "alasan_wajib" }
  | { ok: false; reason: "gagal"; kode: string; alasan: string; dibuat: string[]; sudahAda: string[] };

/** A contoh price that is still the one in force (or will be, on a date still ahead). */
export interface HargaContohBerlaku {
  /** The fixture code of the registry row naming it, or null for a price the registry does not hold: one a `tanam` entered and died before recording. */
  kode: string | null;
  key: GlobalTariffKey;
  amount: number;
  /** Its number in the price book (Tariffs' `seq`). */
  versi: number;
}

/** An order still running at a Lokasi Mitra the registry holds. */
export interface PesananTerbukaDiLokasiContoh extends PesananBerjalan {
  lokasiKode: string;
  lokasiId: string;
}

export interface RencanaCabut {
  /** Every entry still active, in the order `cabut` retires them. */
  aktif: EntriDataContoh[];
  /** The contoh prices with no real successor yet, whether or not the registry holds them: while any is listed `cabut` retires nothing. */
  diblokir: HargaContohBerlaku[];
  pesananTerbuka: PesananTerbukaDiLokasiContoh[];
}

export type CabutResult =
  | { ok: true; dicabut: Partial<Record<JenisDataContoh, number>>; pesananTerbuka: PesananTerbukaDiLokasiContoh[] }
  | WriteRefusal
  | { ok: false; reason: "alasan_wajib" }
  | { ok: false; reason: "harga_contoh_masih_berlaku"; diblokir: HargaContohBerlaku[]; pesananTerbuka: PesananTerbukaDiLokasiContoh[] }
  /** Something could not be retired, or an entry is still active after the run: listed, and the command exits 1. */
  | { ok: false; reason: "masih_aktif"; gagal: { kode: string; alasan: string }[]; sisa: EntriDataContoh[]; pesananTerbuka: PesananTerbukaDiLokasiContoh[] };

export interface DataContohDeps {
  db: Database;
  clock: Clock;
  audit: AuditLog;
  lokasi: Pick<Lokasi, "tandaiDataContoh">;
  identity: Pick<Identity, "deactivateStaff">;
  tariffs: Pick<Tariffs, "globalTariff" | "globalTariffHistory">;
  /** The orders a Lokasi Mitra still has running (Pemesanan's `pesananBerjalanDiLokasi`). */
  pemesanan: { pesananBerjalanDiLokasi(lokasiId: string): Promise<PesananBerjalan[]> };
}

export interface DataContoh {
  /** Records an entity under its fixture code; recording the same entity again changes nothing. Admin Platform only. */
  catat(by: Actor, input: CatatInput): Promise<CatatResult>;
  /** Plants a set: builds each fixture the registry does not already hold complete, and records it. */
  tanam(by: Actor, input: { himpunan: HimpunanDataContoh; reason: string; rencana: RencanaTanam[] }): Promise<TanamResult>;
  /** What `cabut` would do right now, without writing anything (the dry run). */
  rencanaCabut(): Promise<RencanaCabut>;
  /** Retires every active entry, or refuses and changes nothing while a contoh price is still in force. */
  cabut(by: Actor, input: { reason: string }): Promise<CabutResult>;
  /**
   * Every entry still active, in registry order, how many were retired, and the contoh prices in force that the registry
   * does not hold (`takTercatat`: a `tanam` entered them and died before recording them).
   */
  status(): Promise<{ aktif: EntriDataContoh[]; dicabut: number; takTercatat: HargaContohBerlaku[] }>;
  /** Whether anything contoh is active, an unrecorded contoh price in force included: what the banner and the preflight ask. */
  aktif(): Promise<boolean>;
}

const kodeSchema = z.string().trim().min(1).max(160);
const reasonSchema = z.string().trim().min(1).max(500);
const himpunanSchema = z.enum(himpunanDataContoh);
const jenisSchema = z.enum(jenisDataContoh);
const entitasIdSchema = z.string().trim().min(1).max(200);
/** `<tariff key>:<version seq>`, how a global price version is named in the registry. */
const versiTarifSchema = z.string().regex(/^[a-z_]+:\d+$/);

/**
 * What a caller built wrongly (a fixture code, a set, an id: the plan's own, never an operator's input) is a clear
 * error, as the Katalog Lama ledger throws one. The reason is the operator-facing input, and is refused as a result.
 */
function wajib<T>(schema: z.ZodType<T>, nilai: unknown, apa: string): T {
  const dibaca = schema.safeParse(nilai);
  if (!dibaca.success) throw new Error(`Data Contoh: ${apa} tidak valid: ${JSON.stringify(nilai)}`);
  return dibaca.data;
}

/** The key and version a global price's registry name carries, or null when it is not one. */
function bacaVersiTarif(entitasId: string): { key: GlobalTariffKey; seq: string } | null {
  if (!versiTarifSchema.safeParse(entitasId).success) return null;
  const [key, seq] = entitasId.split(":");
  return (GLOBAL_TARIFF_KEYS as readonly string[]).includes(key) ? { key: key as GlobalTariffKey, seq } : null;
}

/** The order `cabut` retires in: the Lokasi Mitra go dark first, then their staff, then what only the registry tracks. */
const URUTAN_CABUT: Record<JenisDataContoh, number> = { lokasi_mitra: 0, akun_staf: 1, jenis_makam: 2, penawaran_layanan: 3, tarif_global: 4 };

type Row = typeof dataContohEntri.$inferSelect;

function toEntri(row: Row): EntriDataContoh {
  return {
    kode: row.kode,
    himpunan: row.himpunan as HimpunanDataContoh,
    jenis: row.jenis as JenisDataContoh,
    entitasId: row.entitasId,
    indukKode: row.indukKode,
    lengkap: row.selesaiPada !== null,
    dicatatPada: row.dicatatPada,
    dicabutPada: row.dicabutPada,
  };
}

export function createDataContoh(deps: DataContohDeps): DataContoh {
  const { db } = deps;

  async function aktifDenganKode(kode: string): Promise<Row | null> {
    const [row] = await db.select().from(dataContohEntri).where(and(eq(dataContohEntri.kode, kode), isNull(dataContohEntri.dicabutPada)));
    return row ?? null;
  }

  async function semuaAktif(): Promise<Row[]> {
    return db.select().from(dataContohEntri).where(isNull(dataContohEntri.dicabutPada)).orderBy(asc(dataContohEntri.dicatatPada), asc(dataContohEntri.kode));
  }

  /** Records one entry; `selesai` is false only for a plan item's own entity while its build runs. */
  async function catatEntri(by: Actor, raw: CatatInput, selesai: boolean): Promise<CatatResult> {
    const refusal = writeRefusal(by, "lokasi.buat", semuaLokasiMitraResource());
    if (refusal) return refusal;
    const reason = reasonSchema.safeParse(raw.reason);
    if (!reason.success) return { ok: false, reason: "alasan_wajib" };
    const input = {
      kode: wajib(kodeSchema, raw.kode, "kode"),
      himpunan: wajib(himpunanSchema, raw.himpunan, "himpunan"),
      jenis: wajib(jenisSchema, raw.jenis, "jenis"),
      entitasId: wajib(entitasIdSchema, raw.entitasId, "id entitas"),
      indukKode: raw.indukKode == null ? null : wajib(kodeSchema, raw.indukKode, "kode induk"),
      reason: reason.data,
    };
    if (input.jenis === "tarif_global" && !bacaVersiTarif(input.entitasId)) {
      throw new Error(`Data Contoh: tarif global harus bernama <kunci tarif>:<versi>, bukan ${JSON.stringify(input.entitasId)}`);
    }
    const sama = (row: Row) => row.jenis === input.jenis && row.entitasId === input.entitasId;
    const ada = await aktifDenganKode(input.kode);
    if (ada) return sama(ada) ? { ok: true, entri: toEntri(ada), baru: false } : { ok: false, reason: "kode_dipakai_entitas_lain", milik: toEntri(ada) };

    const dicatat = await deps.audit.staffWrite(db, async (tx, record) => {
      const now = deps.clock.now();
      const [baru] = await tx
        .insert(dataContohEntri)
        .values({
          kode: input.kode,
          himpunan: input.himpunan,
          jenis: input.jenis,
          entitasId: input.entitasId,
          indukKode: input.indukKode,
          selesaiPada: selesai ? now : null,
          dicatatPada: now,
          dicatatOleh: by.accountId,
        })
        .onConflictDoNothing()
        .returning();
      if (!baru) {
        // Another run recorded the code between the read and the insert. Neither answer is a write, so neither is `ok`
        // inside the audited transaction (it would owe an Entri Audit); the first is turned back into one below.
        const [dipakai] = await tx.select().from(dataContohEntri).where(and(eq(dataContohEntri.kode, input.kode), isNull(dataContohEntri.dicabutPada)));
        return sama(dipakai)
          ? { ok: false as const, reason: "sudah_dicatat" as const, entri: toEntri(dipakai) }
          : { ok: false as const, reason: "kode_dipakai_entitas_lain" as const, milik: toEntri(dipakai) };
      }
      await record({
        actor: { accountId: by.accountId, role: "admin_platform" },
        action: "data_contoh.tanam",
        entity: { kind: input.jenis, id: input.entitasId },
        lokasiId: input.jenis === "lokasi_mitra" ? input.entitasId : null,
        before: null,
        after: { kode: input.kode, himpunan: input.himpunan, jenis: input.jenis, entitasId: input.entitasId },
        reason: input.reason,
      });
      return { ok: true as const, entri: toEntri(baru), baru: true };
    });
    return !dicatat.ok && dicatat.reason === "sudah_dicatat" ? { ok: true, entri: dicatat.entri, baru: false } : dicatat;
  }

  /** Marks a row retired, with its own Entri Audit, once what it names is retired. */
  async function tandaiDicabut(by: Actor, row: Row, reason: string): Promise<void> {
    await deps.audit.staffWrite(db, async (tx, record) => {
      const [diubah] = await tx
        .update(dataContohEntri)
        .set({ dicabutPada: deps.clock.now(), dicabutOleh: by.accountId })
        .where(and(eq(dataContohEntri.id, row.id), isNull(dataContohEntri.dicabutPada)))
        .returning();
      if (diubah) {
        await record({
          actor: { accountId: by.accountId, role: "admin_platform" },
          action: "data_contoh.cabut",
          entity: { kind: row.jenis, id: row.entitasId },
          lokasiId: row.jenis === "lokasi_mitra" ? row.entitasId : null,
          before: { kode: row.kode, aktif: true },
          after: { kode: row.kode, aktif: false },
          reason,
        });
      } else {
        // Retired by someone else in the meantime: nothing to record, and the audit rule only binds a write that happened.
        return { ok: false as const };
      }
      return { ok: true as const };
    });
  }

  /** An Entri Audit a `tanam` wrote: its reason starts with `AWALAN_ALASAN_TANAM`, which an Operator's own never does. */
  const olehTanam = (entri: AuditEntry) => entri.reason?.startsWith(AWALAN_ALASAN_TANAM) === true;

  /**
   * The versions of one global price a `tanam` entered, told by the Entri Audit Tariffs writes with each version. The entries
   * and the versions are written together, in the same order, so the Nth version is the Nth entry's; one whose amount or date
   * differs from its entry's is not told apart, and when the two lists do not line up at all, none is (a price is then taken
   * for the Operator's, never the set's).
   */
  function versiOlehTanam(riwayat: GlobalTariffVersion[], perubahan: AuditEntry[]): Set<number> {
    const ditanam = new Set<number>();
    if (perubahan.length !== riwayat.length) return ditanam;
    riwayat.forEach((versi, urutan) => {
      const entri = perubahan[urutan];
      if (olehTanam(entri) && entri.after?.amount === versi.amount && entri.after?.effectiveOn === versi.effectiveOn) ditanam.add(versi.seq);
    });
    return ditanam;
  }

  /**
   * The contoh versions of one global price that are, or will be, the version in force: the version in force now, or the
   * version in force on its own date when that date is still ahead (a scheduled version nothing later has superseded). A
   * version counts as contoh when an active registry row names it or a `tanam` entered it (`kode` is null for the latter
   * alone). One that a later version has taken over from is not listed; that later version is listed itself if it is contoh,
   * so a real version is the only successor that lets a contoh price go, and a price version is never retired any other way.
   */
  async function hargaBerlakuDi(key: GlobalTariffKey, aktif: Row[]): Promise<HargaContohBerlaku[]> {
    const dicatat = new Map<number, Row>();
    for (const row of aktif) {
      const versi = row.jenis === "tarif_global" ? bacaVersiTarif(row.entitasId) : null;
      if (versi?.key === key) dicatat.set(Number(versi.seq), row);
    }
    // `aktif` asks this of every price book on every page load: a book no row names and no `tanam` wrote to is left after one indexed read.
    const perubahan = (await deps.audit.entriesAbout({ kind: "tarif_global", id: key })).filter((satu) => satu.action === "tarif.ubah_global");
    if (dicatat.size === 0 && !perubahan.some(olehTanam)) return [];
    const riwayat = await deps.tariffs.globalTariffHistory(key);
    const ditanam = versiOlehTanam(riwayat, perubahan);
    const sekarang = deps.clock.now();
    const berlaku: HargaContohBerlaku[] = [];
    for (const versi of riwayat) {
      const row = dicatat.get(versi.seq);
      if (!row && !ditanam.has(versi.seq)) continue;
      const pada = versi.inForceFrom.getTime() > sekarang.getTime() ? versi.inForceFrom : sekarang;
      const dipakai = await deps.tariffs.globalTariff(key, pada);
      if (dipakai?.seq === versi.seq) berlaku.push({ kode: row?.kode ?? null, key, amount: versi.amount, versi: versi.seq });
    }
    return berlaku;
  }

  /** The contoh prices of every global price that are, or will be, in force: the ones `cabut` waits for a real version over. */
  async function hargaBerlaku(aktif: Row[]): Promise<HargaContohBerlaku[]> {
    return (await Promise.all(GLOBAL_TARIFF_KEYS.map((key) => hargaBerlakuDi(key, aktif)))).flat();
  }

  /** The price a `tarif_global` row names, when it is itself still in force (or will be): null once a later version has taken over. */
  async function hargaBerlakuUntuk(row: Row): Promise<HargaContohBerlaku | null> {
    const versi = bacaVersiTarif(row.entitasId);
    if (!versi) throw new Error(`Data Contoh: tarif global tidak dikenal: ${row.entitasId}`);
    return (await hargaBerlakuDi(versi.key, await semuaAktif())).find((satu) => satu.kode === row.kode) ?? null;
  }

  /**
   * Retires what one entry names through the owning module, then marks it retired. A price version cannot be retired, only
   * superseded: its row is let go of only once a later version is in force, whoever asks (`cabut`, or a `tanam` cleaning up).
   */
  async function cabutEntri(by: Actor, row: Row, reason: string): Promise<{ ok: true } | { ok: false; alasan: string }> {
    if (row.jenis === "tarif_global") {
      const berlaku = await hargaBerlakuUntuk(row);
      if (berlaku) return { ok: false, alasan: `harga contoh ${berlaku.key} masih berlaku, belum digantikan versi asli` };
    } else if (row.jenis === "lokasi_mitra") {
      const hasil = await deps.lokasi.tandaiDataContoh(by, row.entitasId, { dataContoh: true, reason });
      if (!hasil.ok && hasil.reason !== "tidak_diperbarui" && hasil.reason !== "tidak_ditemukan") return { ok: false, alasan: `Lokasi Mitra tidak bisa ditandai data contoh (${hasil.reason})` };
    } else if (row.jenis === "akun_staf") {
      const hasil = await deps.identity.deactivateStaff(by, { accountId: row.entitasId, reason });
      if (!hasil.ok && hasil.reason !== "sudah_dinonaktifkan" && hasil.reason !== "bukan_akun_staf") return { ok: false, alasan: `Akun staf tidak bisa dinonaktifkan (${hasil.reason})` };
    }
    await tandaiDicabut(by, row, reason);
    return { ok: true };
  }

  /** Retires an entry and everything recorded under it, the children first. */
  async function cabutPohon(by: Actor, induk: Row, reason: string): Promise<{ ok: true } | { ok: false; alasan: string }> {
    const anak = await db.select().from(dataContohEntri).where(and(eq(dataContohEntri.indukKode, induk.kode), isNull(dataContohEntri.dicabutPada)));
    for (const satu of [...anak, induk]) {
      const hasil = await cabutEntri(by, satu, reason);
      if (!hasil.ok) return { ok: false, alasan: `${satu.kode}: ${hasil.alasan}` };
    }
    return { ok: true };
  }

  async function pesananTerbukaDi(): Promise<PesananTerbukaDiLokasiContoh[]> {
    const lokasi = await db.select().from(dataContohEntri).where(eq(dataContohEntri.jenis, "lokasi_mitra")).orderBy(asc(dataContohEntri.dicatatPada), asc(dataContohEntri.kode));
    const terbuka: PesananTerbukaDiLokasiContoh[] = [];
    for (const row of lokasi) {
      for (const pesanan of await deps.pemesanan.pesananBerjalanDiLokasi(row.entitasId)) {
        terbuka.push({ ...pesanan, lokasiKode: row.kode, lokasiId: row.entitasId });
      }
    }
    return terbuka;
  }

  /** Marks a built fixture finished, with its own Entri Audit: from then on a rerun finds it complete and leaves it alone. */
  async function selesaikan(by: Actor, kode: string, reason: string): Promise<void> {
    await deps.audit.staffWrite(db, async (tx, record) => {
      const [selesai] = await tx
        .update(dataContohEntri)
        .set({ selesaiPada: deps.clock.now() })
        .where(and(eq(dataContohEntri.kode, kode), isNull(dataContohEntri.dicabutPada), isNull(dataContohEntri.selesaiPada)))
        .returning();
      // Finished by someone else in the meantime: nothing to record, and the audit rule only binds a write that happened.
      if (!selesai) return { ok: false as const };
      await record({
        actor: { accountId: by.accountId, role: "admin_platform" },
        action: "data_contoh.selesai",
        entity: { kind: selesai.jenis, id: selesai.entitasId },
        lokasiId: selesai.jenis === "lokasi_mitra" ? selesai.entitasId : null,
        before: { kode, lengkap: false },
        after: { kode, lengkap: true },
        reason,
      });
      return { ok: true as const };
    });
  }

  async function rencanaCabut(): Promise<RencanaCabut> {
    const aktif = (await semuaAktif()).sort((a, b) => URUTAN_CABUT[a.jenis as JenisDataContoh] - URUTAN_CABUT[b.jenis as JenisDataContoh]);
    return { aktif: aktif.map(toEntri), diblokir: await hargaBerlaku(aktif), pesananTerbuka: await pesananTerbukaDi() };
  }

  return {
    catat: (by, input) => catatEntri(by, input, true),

    async tanam(by, raw) {
      const refusal = writeRefusal(by, "lokasi.buat", semuaLokasiMitraResource());
      if (refusal) return refusal;
      const alasan = reasonSchema.safeParse(raw.reason);
      if (!alasan.success) return { ok: false, reason: "alasan_wajib" };
      const reason = alasan.data;
      if (!reason.startsWith(AWALAN_ALASAN_TANAM)) {
        throw new Error(`Data Contoh: alasan tanam harus diawali "${AWALAN_ALASAN_TANAM}" (Audit Log mengenali harga contoh dari situ), bukan ${JSON.stringify(reason)}`);
      }
      const himpunan = wajib(himpunanSchema, raw.himpunan, "himpunan");
      const dibuat: string[] = [];
      const sudahAda: string[] = [];
      const dilewati: string[] = [];

      for (const item of raw.rencana) {
        const kode = wajib(kodeSchema, item.kode, "kode");
        const ada = await aktifDenganKode(kode);
        if (ada && ada.selesaiPada) {
          sudahAda.push(kode);
          continue;
        }
        if (ada) {
          if (ada.jenis === "tarif_global" && (await hargaBerlakuUntuk(ada))) {
            // A price entered and recorded, with only the finishing mark missing: a price in force is never let go of, so the row is finished.
            await selesaikan(by, kode, reason);
            sudahAda.push(kode);
            continue;
          }
          // A build that was cut short: never finished, retired with everything it had recorded, then built afresh.
          const dibuang = await cabutPohon(by, ada, `${reason}: sisa build yang terputus dicabut`);
          if (!dibuang.ok) return { ok: false, reason: "gagal", kode, alasan: `sisa build terputus tidak bisa dicabut (${dibuang.alasan})`, dibuat, sudahAda };
        }

        if (item.jenis === "tarif_global" && item.kunciTarif) {
          // A contoh price a killed run entered and never recorded is recorded now, never entered a second time.
          const takTercatat = (await hargaBerlakuDi(item.kunciTarif, await semuaAktif())).find((satu) => satu.kode === null);
          if (takTercatat) {
            const dicatat = await catatEntri(by, { kode, himpunan, jenis: item.jenis, entitasId: `${takTercatat.key}:${takTercatat.versi}`, reason }, true);
            if (!dicatat.ok) throw new Error(`Data Contoh: ${kode} tidak tercatat (${dicatat.reason})`);
            dibuat.push(kode);
            continue;
          }
        }

        // The entity this run itself recorded under the code: the only row its cleanup may retire. A row another run recorded
        // under the code (the one that got there first), or one since replaced, is not this run's to touch.
        let dicatatSendiri: string | null = null;
        const ctx: KonteksTanam = {
          async catatInduk(entitasId) {
            const hasil = await catatEntri(by, { kode, himpunan, jenis: item.jenis, entitasId, reason }, false);
            if (!hasil.ok) throw new Error(`Data Contoh: ${kode} tidak tercatat (${hasil.reason})`);
            if (hasil.baru) dicatatSendiri = entitasId;
          },
          async catatAnak(anak) {
            const hasil = await catatEntri(by, { ...anak, himpunan, indukKode: kode, reason }, true);
            if (!hasil.ok) throw new Error(`Data Contoh: ${anak.kode} tidak tercatat (${hasil.reason})`);
          },
        };
        const buang = async (): Promise<string> => {
          if (dicatatSendiri === null) return "";
          const induk = await aktifDenganKode(kode);
          if (!induk || induk.entitasId !== dicatatSendiri) return "";
          const hasil = await cabutPohon(by, induk, `${reason}: build gagal, dicabut`);
          return hasil.ok ? "" : `; pembersihan gagal (${hasil.alasan})`;
        };

        let hasil: { ok: true } | { ok: false; reason: string };
        try {
          hasil = await item.buat(ctx);
        } catch (error) {
          await buang();
          throw error;
        }
        if (!hasil.ok) {
          const sisa = await buang();
          return { ok: false, reason: "gagal", kode, alasan: `${hasil.reason}${sisa}`, dibuat, sudahAda };
        }
        if (!(await aktifDenganKode(kode))) {
          dilewati.push(kode);
          continue;
        }
        await selesaikan(by, kode, reason);
        dibuat.push(kode);
      }
      return { ok: true, dibuat, sudahAda, dilewati };
    },

    rencanaCabut,

    async cabut(by, raw) {
      const refusal = writeRefusal(by, "lokasi.buat", semuaLokasiMitraResource());
      if (refusal) return refusal;
      const reason = reasonSchema.safeParse(raw.reason);
      if (!reason.success) return { ok: false, reason: "alasan_wajib" };

      const rencana = await rencanaCabut();
      if (rencana.diblokir.length > 0) {
        return { ok: false, reason: "harga_contoh_masih_berlaku", diblokir: rencana.diblokir, pesananTerbuka: rencana.pesananTerbuka };
      }
      const dicabut: Partial<Record<JenisDataContoh, number>> = {};
      const gagal: { kode: string; alasan: string }[] = [];
      const aktif = await db.select().from(dataContohEntri).where(isNull(dataContohEntri.dicabutPada));
      for (const row of aktif.sort((a, b) => URUTAN_CABUT[a.jenis as JenisDataContoh] - URUTAN_CABUT[b.jenis as JenisDataContoh])) {
        const hasil = await cabutEntri(by, row, reason.data);
        if (hasil.ok) dicabut[row.jenis as JenisDataContoh] = (dicabut[row.jenis as JenisDataContoh] ?? 0) + 1;
        else gagal.push({ kode: row.kode, alasan: hasil.alasan });
      }
      const sisa = (await semuaAktif()).map(toEntri);
      if (gagal.length > 0 || sisa.length > 0) return { ok: false, reason: "masih_aktif", gagal, sisa, pesananTerbuka: rencana.pesananTerbuka };
      return { ok: true, dicabut, pesananTerbuka: rencana.pesananTerbuka };
    },

    async status() {
      const aktif = await semuaAktif();
      const semua = await db.select({ kode: dataContohEntri.kode, dicabutPada: dataContohEntri.dicabutPada }).from(dataContohEntri);
      const takTercatat = (await hargaBerlaku(aktif)).filter((satu) => satu.kode === null);
      return { aktif: aktif.map(toEntri), dicabut: semua.filter((row) => row.dicabutPada !== null).length, takTercatat };
    },

    async aktif() {
      const [satu] = await db.select({ id: dataContohEntri.id }).from(dataContohEntri).where(isNull(dataContohEntri.dicabutPada)).limit(1);
      if (satu !== undefined) return true;
      // The registry holds nothing, but a price a killed tanam entered and never recorded is still an example in force.
      return (await hargaBerlaku([])).length > 0;
    },
  };
}
