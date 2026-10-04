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
 * The Rilis 3 set (ticket 111) adds kinds of its own. A Layanan variant's DKI price and its Mitra Jasa rate are price
 * versions too and cannot be retired, but `cabut` does not wait for a real successor over them the way it does over a global
 * price: a variant is offered at a TPU only while Admin Platform's "boleh di TPU DKI" mark is on, so `cabut` takes the mark off
 * every variant whose DKI price or Mitra Jasa rate in force is still a contoh version (the Operator would pay a Mitra Jasa an
 * example amount), and leaves the mark on a variant whose prices both have real successors. It looks at EVERY variant offered
 * now, whether or not an active registry row names it: a variant somebody marked again after an earlier `cabut`, or one whose
 * contoh price a killed `tanam` entered unrecorded, is offered at an example price all the same, and the Audit Log still tells
 * the example version. A Mitra Jasa (Contoh) is set to Berhenti (the jobs it has in progress are left to it and reported, for
 * Admin Platform to reassign), a Nazhir (Contoh) is removed from the list, and the Rilis 2 rules entered on a contoh Lokasi
 * Mitra go with the Lokasi (hidden for good), so their row is only marked retired. A real value a set enters, the Retribusi
 * Pemda of an IPTM, is no entry here: it is not contoh, and a registry row would make `cabut` wait for it to be superseded.
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
import type { Layanan, ReleasedJob } from "@/domain/layanan";
import type { Lokasi } from "@/domain/lokasi";
import type { PesananBerjalan } from "@/domain/pemesanan";
import type { GlobalTariffKey, Tariffs } from "@/domain/tariffs";
import { GLOBAL_TARIFF_KEYS } from "@/domain/tariffs";
import type { Wakaf } from "@/domain/wakaf";
import type { Clock } from "@/ports/clock";
import { dataContohEntri } from "./schema";

/**
 * How the reason of every `tanam` run starts. It is the one mark the Audit Log keeps of who entered a price version, so
 * `tanam` refuses a reason that does not carry it: its prices could not be told from an Operator's afterwards.
 */
export const AWALAN_ALASAN_TANAM = "data-contoh tanam";

/** The sets a stack can be planted with: the Rilis 1 set (ticket 109) and the Rilis 2/3 one (ticket 111, which carries the TPU data). */
export const himpunanDataContoh = ["rilis1", "rilis3"] as const;
export type HimpunanDataContoh = (typeof himpunanDataContoh)[number];

/** What kinds of entity a registry row can name. */
export const jenisDataContoh = [
  "lokasi_mitra",
  "jenis_makam",
  "akun_staf",
  "tarif_global",
  "penawaran_layanan",
  // The Rilis 3 set (ticket 111).
  "harga_layanan_dki",
  "tarif_mitra_jasa",
  "tanda_tpu_dki",
  "mitra_jasa",
  "nazhir",
  "aturan_lokasi",
] as const;
export type JenisDataContoh = (typeof jenisDataContoh)[number];

/** One recorded entity: a fixture code, and the entity the owning module created for it. */
export interface EntriDataContoh {
  kode: string;
  himpunan: HimpunanDataContoh;
  jenis: JenisDataContoh;
  /**
   * The owning module's id; for a global price version, `<tariff key>:<version seq>`; for a Layanan variant's DKI price or
   * Mitra Jasa rate version, `<variant id>:<version seq>`; for a "boleh di TPU DKI" mark, the variant's id; for the Rilis 2
   * rules of a Lokasi Mitra, that Lokasi's id.
   */
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

/** The kinds of entry that name a version of a Layanan variant's own price book (its DKI price, its Mitra Jasa rate). */
export type JenisHargaLayanan = "harga_layanan_dki" | "tarif_mitra_jasa";

export type RencanaTanam =
  | (RencanaTanamDasar & { jenis: Exclude<JenisDataContoh, "tarif_global" | JenisHargaLayanan> })
  | (RencanaTanamDasar & {
      jenis: "tarif_global";
      /**
       * The global price the fixture enters. With it, `tanam` first records a contoh version of that price a killed run
       * entered and never recorded, instead of building the fixture (which would enter a second version); without it,
       * nothing is recorded in place of the build.
       */
      kunciTarif?: GlobalTariffKey;
    })
  | (RencanaTanamDasar & {
      jenis: JenisHargaLayanan;
      /** The Layanan variant whose price the fixture enters: `tanam` records a contoh version of it a killed run left, as for `kunciTarif`. */
      layananVariantId: string;
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

/** A Layanan variant `cabut` stops offering at a TPU, and which of its two prices is still a contoh version with no real successor. */
export interface VarianTakDitawarkan {
  layananVariantId: string;
  hargaDki: boolean;
  tarifMitraJasa: boolean;
}

/** The jobs a Mitra Jasa (Contoh) still has in progress when `cabut` ends it: left alone (that is the family's work in the ground), for Admin Platform to reassign. */
export interface PekerjaanBerjalanMitraJasa {
  /** The fixture code of the Mitra Jasa (Contoh). */
  kode: string;
  mitraJasaId: string;
  pekerjaan: ReleasedJob[];
}

export interface RencanaCabut {
  /** Every entry still active, in the order `cabut` retires them. */
  aktif: EntriDataContoh[];
  /** The contoh prices with no real successor yet, whether or not the registry holds them: while any is listed `cabut` retires nothing. */
  diblokir: HargaContohBerlaku[];
  /** The variants offered at a TPU whose DKI price or Mitra Jasa rate is still a contoh version: `cabut` takes their mark off. */
  tidakDitawarkan: VarianTakDitawarkan[];
  pesananTerbuka: PesananTerbukaDiLokasiContoh[];
}

/** The dry run: the plan, or the refusal of an actor who is not Admin Platform (the Mitra Jasa rates it reads are Admin Platform's). */
export type RencanaCabutResult = ({ ok: true } & RencanaCabut) | WriteRefusal;

export type CabutResult =
  | {
      ok: true;
      dicabut: Partial<Record<JenisDataContoh, number>>;
      tidakDitawarkan: VarianTakDitawarkan[];
      pesananTerbuka: PesananTerbukaDiLokasiContoh[];
      pekerjaanBerjalan: PekerjaanBerjalanMitraJasa[];
    }
  | WriteRefusal
  | { ok: false; reason: "alasan_wajib" }
  | { ok: false; reason: "harga_contoh_masih_berlaku"; diblokir: HargaContohBerlaku[]; pesananTerbuka: PesananTerbukaDiLokasiContoh[] }
  /** Something could not be retired, or an entry is still active after the run: listed, and the command exits 1. */
  | {
      ok: false;
      reason: "masih_aktif";
      gagal: { kode: string; alasan: string }[];
      sisa: EntriDataContoh[];
      pesananTerbuka: PesananTerbukaDiLokasiContoh[];
      pekerjaanBerjalan: PekerjaanBerjalanMitraJasa[];
    };

export interface DataContohDeps {
  db: Database;
  clock: Clock;
  audit: AuditLog;
  lokasi: Pick<Lokasi, "tandaiDataContoh">;
  identity: Pick<Identity, "deactivateStaff">;
  /** The price books a registry row names a version of: the global prices, a Layanan variant's DKI price and its Mitra Jasa rate (Admin Platform's read). */
  tariffs: Pick<Tariffs, "globalTariff" | "globalTariffHistory" | "hargaLayananDki" | "hargaLayananDkiHistory" | "mitraJasaRate" | "mitraJasaRateHistory">;
  /** The catalog (which variants carry the "boleh di TPU DKI" mark), the mark itself, and a Mitra Jasa's status. */
  layanan: Pick<Layanan, "katalog" | "tandaiBolehDiTpu" | "ubahStatus">;
  /** The Nazhir list's removal. */
  wakaf: Pick<Wakaf, "hapusNazhir">;
  /** The orders a Lokasi Mitra still has running (Pemesanan's `pesananBerjalanDiLokasi`). */
  pemesanan: { pesananBerjalanDiLokasi(lokasiId: string): Promise<PesananBerjalan[]> };
}

export interface DataContoh {
  /** Records an entity under its fixture code; recording the same entity again changes nothing. Admin Platform only. */
  catat(by: Actor, input: CatatInput): Promise<CatatResult>;
  /** Plants a set: builds each fixture the registry does not already hold complete, and records it. */
  tanam(by: Actor, input: { himpunan: HimpunanDataContoh; reason: string; rencana: RencanaTanam[] }): Promise<TanamResult>;
  /** What `cabut` would do right now, without writing anything (the dry run); `by` is the Admin Platform whose reads the Mitra Jasa rates need, so anyone else is refused. */
  rencanaCabut(by: Actor): Promise<RencanaCabutResult>;
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
/** `<variant id>:<version seq>`, how a version of a Layanan variant's DKI price or Mitra Jasa rate is named in the registry. */
const versiHargaLayananSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:\d+$/i);

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

/** The variant and version a Layanan price's registry name carries, or null when it is not one. */
function bacaVersiHargaLayanan(entitasId: string): { layananVariantId: string; seq: string } | null {
  if (!versiHargaLayananSchema.safeParse(entitasId).success) return null;
  const [layananVariantId, seq] = entitasId.split(":");
  return { layananVariantId, seq };
}

/** The order `cabut` retires in: the Lokasi Mitra go dark first, then their staff, then what only the registry tracks. */
const URUTAN_CABUT: Record<JenisDataContoh, number> = {
  lokasi_mitra: 0,
  akun_staf: 1,
  jenis_makam: 2,
  penawaran_layanan: 3,
  tarif_global: 4,
  mitra_jasa: 5,
  nazhir: 6,
  aturan_lokasi: 7,
  tanda_tpu_dki: 8,
  harga_layanan_dki: 9,
  tarif_mitra_jasa: 10,
};

const adalahHargaLayanan = (jenis: string): jenis is JenisHargaLayanan => jenis === "harga_layanan_dki" || jenis === "tarif_mitra_jasa";

/** One version of a price book, as the module reads it: what `hargaBerlakuDi` needs of a global price's and of a Layanan variant's. */
interface VersiBuku {
  seq: number;
  amount: number;
  effectiveOn: string;
  inForceFrom: Date;
}

/**
 * One price book a registry row can name a version of, and how to read it: the Audit Log entity and action its writes are
 * filed under, its versions in entry order, and the version in force at an instant. `kunci` is what a row's `entitasId`
 * starts with (the tariff key, or the Layanan variant's id).
 */
interface Buku {
  jenis: "tarif_global" | JenisHargaLayanan;
  kunci: string;
  entitas: { kind: string; id: string };
  aksi: string;
  riwayat(): Promise<VersiBuku[]>;
  berlakuPada(at: Date): Promise<{ seq: number } | null>;
}

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
    if (adalahHargaLayanan(input.jenis) && !bacaVersiHargaLayanan(input.entitasId)) {
      throw new Error(`Data Contoh: harga layanan harus bernama <id varian>:<versi>, bukan ${JSON.stringify(input.entitasId)}`);
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
   * The versions of one price book a `tanam` entered, told by the Entri Audit its module writes with each version. The entries
   * and the versions are written together, in the same order, so the Nth version is the Nth entry's; one whose amount or date
   * differs from its entry's is not told apart, and when the two lists do not line up at all, none is (a price is then taken
   * for the Operator's, never the set's).
   */
  function versiOlehTanam(riwayat: VersiBuku[], perubahan: AuditEntry[]): Set<number> {
    const ditanam = new Set<number>();
    if (perubahan.length !== riwayat.length) return ditanam;
    riwayat.forEach((versi, urutan) => {
      const entri = perubahan[urutan];
      if (olehTanam(entri) && entri.after?.amount === versi.amount && entri.after?.effectiveOn === versi.effectiveOn) ditanam.add(versi.seq);
    });
    return ditanam;
  }

  /** A global price's book. */
  const bukuGlobal = (key: GlobalTariffKey): Buku => ({
    jenis: "tarif_global",
    kunci: key,
    entitas: { kind: "tarif_global", id: key },
    aksi: "tarif.ubah_global",
    riwayat: () => deps.tariffs.globalTariffHistory(key),
    berlakuPada: (at) => deps.tariffs.globalTariff(key, at),
  });

  /** A Layanan variant's DKI price book, or its Mitra Jasa rate book; the rate is Admin Platform's to read, so `by` is who reads it. */
  const bukuHargaLayanan = (by: Actor, jenis: JenisHargaLayanan, layananVariantId: string): Buku =>
    jenis === "harga_layanan_dki"
      ? {
          jenis,
          kunci: layananVariantId,
          entitas: { kind: "harga_layanan_dki", id: layananVariantId },
          aksi: "tarif.ubah_harga_layanan_dki",
          riwayat: () => deps.tariffs.hargaLayananDkiHistory(layananVariantId),
          berlakuPada: (at) => deps.tariffs.hargaLayananDki(layananVariantId, at),
        }
      : {
          jenis,
          kunci: layananVariantId,
          entitas: { kind: "tarif_mitra_jasa", id: layananVariantId },
          aksi: "tarif.ubah_tarif_mitra_jasa",
          riwayat: () => deps.tariffs.mitraJasaRateHistory(by, layananVariantId),
          berlakuPada: (at) => deps.tariffs.mitraJasaRate(by, layananVariantId, at),
        };

  /** The price book a registry row names a version of: a global price's, or a Layanan variant's; null for a row that names no price version. */
  function bukuUntukRow(by: Actor, row: Row): { buku: Buku; seq: number } | null {
    if (row.jenis === "tarif_global") {
      const versi = bacaVersiTarif(row.entitasId);
      if (!versi) throw new Error(`Data Contoh: tarif global tidak dikenal: ${row.entitasId}`);
      return { buku: bukuGlobal(versi.key), seq: Number(versi.seq) };
    }
    if (adalahHargaLayanan(row.jenis)) {
      const versi = bacaVersiHargaLayanan(row.entitasId);
      if (!versi) throw new Error(`Data Contoh: harga layanan tidak dikenal: ${row.entitasId}`);
      return { buku: bukuHargaLayanan(by, row.jenis, versi.layananVariantId), seq: Number(versi.seq) };
    }
    return null;
  }

  /**
   * The contoh versions of one price book that are, or will be, the version in force: the version in force now, or the
   * version in force on its own date when that date is still ahead (a scheduled version nothing later has superseded). A
   * version counts as contoh when an active registry row names it or a `tanam` entered it (`kode` is null for the latter
   * alone). One that a later version has taken over from is not listed; that later version is listed itself if it is contoh,
   * so a real version is the only successor that lets a contoh price go, and a price version is never retired any other way.
   */
  async function versiContohBerlaku(buku: Buku, aktif: Row[]): Promise<{ kode: string | null; amount: number; versi: number }[]> {
    const dicatat = new Map<number, Row>();
    for (const row of aktif) {
      if (row.jenis !== buku.jenis) continue;
      const nama = row.jenis === "tarif_global" ? bacaVersiTarif(row.entitasId) : bacaVersiHargaLayanan(row.entitasId);
      const kunci = nama && "key" in nama ? nama.key : nama?.layananVariantId;
      if (nama && kunci === buku.kunci) dicatat.set(Number(nama.seq), row);
    }
    // `aktif` asks this of every price book on every page load: a book no row names and no `tanam` wrote to is left after one indexed read.
    const perubahan = (await deps.audit.entriesAbout(buku.entitas)).filter((satu) => satu.action === buku.aksi);
    if (dicatat.size === 0 && !perubahan.some(olehTanam)) return [];
    const riwayat = await buku.riwayat();
    const ditanam = versiOlehTanam(riwayat, perubahan);
    const sekarang = deps.clock.now();
    const berlaku: { kode: string | null; amount: number; versi: number }[] = [];
    for (const versi of riwayat) {
      const row = dicatat.get(versi.seq);
      if (!row && !ditanam.has(versi.seq)) continue;
      const pada = versi.inForceFrom.getTime() > sekarang.getTime() ? versi.inForceFrom : sekarang;
      const dipakai = await buku.berlakuPada(pada);
      if (dipakai?.seq === versi.seq) berlaku.push({ kode: row?.kode ?? null, amount: versi.amount, versi: versi.seq });
    }
    return berlaku;
  }

  /** The contoh versions of one global price that are, or will be, in force: what `cabut` waits for a real version over. */
  async function hargaBerlakuDi(key: GlobalTariffKey, aktif: Row[]): Promise<HargaContohBerlaku[]> {
    return (await versiContohBerlaku(bukuGlobal(key), aktif)).map((satu) => ({ ...satu, key }));
  }

  /** The contoh prices of every global price that are, or will be, in force: the ones `cabut` waits for a real version over. */
  async function hargaBerlaku(aktif: Row[]): Promise<HargaContohBerlaku[]> {
    return (await Promise.all(GLOBAL_TARIFF_KEYS.map((key) => hargaBerlakuDi(key, aktif)))).flat();
  }

  /** Whether the price version a price row names is itself still in force (or will be): false once a later version has taken over. */
  async function hargaMasihBerlaku(by: Actor, row: Row): Promise<boolean> {
    const nama = bukuUntukRow(by, row);
    if (!nama) return false;
    return (await versiContohBerlaku(nama.buku, await semuaAktif())).some((satu) => satu.kode === row.kode);
  }

  /**
   * Retires what one entry names through the owning module, then marks it retired. A global price version cannot be retired,
   * only superseded: its row is let go of only once a later version is in force, whoever asks (`cabut`, or a `tanam` cleaning
   * up). A Layanan variant's own prices are different: `cabut` takes the variant's mark off before any row is retired (see
   * `rencanaTidakDitawarkan`), so what is left to retire here is the row alone.
   */
  async function cabutEntri(by: Actor, row: Row, reason: string): Promise<{ ok: true; berjalan: ReleasedJob[] } | { ok: false; alasan: string }> {
    // The jobs a Mitra Jasa had in progress when it was set to Berhenti: `ubahStatus` leaves them to it and returns them.
    let berjalan: ReleasedJob[] = [];
    if (row.jenis === "tarif_global") {
      if (await hargaMasihBerlaku(by, row)) return { ok: false, alasan: `harga contoh ${bacaVersiTarif(row.entitasId)?.key} masih berlaku, belum digantikan versi asli` };
    } else if (row.jenis === "lokasi_mitra") {
      const hasil = await deps.lokasi.tandaiDataContoh(by, row.entitasId, { dataContoh: true, reason });
      if (!hasil.ok && hasil.reason !== "tidak_diperbarui" && hasil.reason !== "tidak_ditemukan") return { ok: false, alasan: `Lokasi Mitra tidak bisa ditandai data contoh (${hasil.reason})` };
    } else if (row.jenis === "akun_staf") {
      const hasil = await deps.identity.deactivateStaff(by, { accountId: row.entitasId, reason });
      if (!hasil.ok && hasil.reason !== "sudah_dinonaktifkan" && hasil.reason !== "bukan_akun_staf") return { ok: false, alasan: `Akun staf tidak bisa dinonaktifkan (${hasil.reason})` };
    } else if (row.jenis === "mitra_jasa") {
      // Berhenti: no new job, its record and history stay (a Mitra Jasa ended by Admin Platform already is the same state).
      const hasil = await deps.layanan.ubahStatus(by, row.entitasId, { status: "berhenti", alasan: reason });
      if (!hasil.ok && hasil.reason !== "status_sama" && hasil.reason !== "tidak_ditemukan") return { ok: false, alasan: `Mitra Jasa tidak bisa diberhentikan (${hasil.reason})` };
      if (hasil.ok) berjalan = hasil.berjalan;
    } else if (row.jenis === "nazhir") {
      const hasil = await deps.wakaf.hapusNazhir(by, { nazhirId: row.entitasId });
      if (!hasil.ok && hasil.reason !== "nazhir_tidak_ditemukan") return { ok: false, alasan: `Nazhir tidak bisa dihapus (${hasil.reason})` };
    }
    await tandaiDicabut(by, row, reason);
    return { ok: true, berjalan };
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

  /** The Layanan variant a TPU row (its DKI price, its Mitra Jasa rate, its mark) is about, or null for any other row. */
  function varianDariRow(row: Row): string | null {
    if (adalahHargaLayanan(row.jenis)) return bacaVersiHargaLayanan(row.entitasId)?.layananVariantId ?? null;
    return row.jenis === "tanda_tpu_dki" ? row.entitasId : null;
  }

  /**
   * The variants `cabut` stops offering at a TPU: every one that is offered now (marked "boleh di TPU DKI") while its DKI price
   * or its Mitra Jasa rate in force is still a contoh version, whoever set the mark. Offering it would charge a family an
   * example price, or pay a Mitra Jasa an example rate; a price version cannot be erased, so the offer is what stops. A variant
   * whose two prices both have real successors keeps its mark.
   *
   * Every offered variant of the catalog is looked at, not only the ones an active registry row names: a variant somebody
   * marked again after an earlier `cabut` has no active row left, and one whose contoh price a killed `tanam` entered has none
   * yet, yet both are offered at an example price. The Audit Log tells an example version whether or not a row names it.
   */
  async function rencanaTidakDitawarkan(by: Actor, aktif: Row[]): Promise<VarianTakDitawarkan[]> {
    const ditawarkan = (await deps.layanan.katalog()).flatMap((layanan) => layanan.varian.filter((satu) => satu.bolehDiTpu).map((satu) => satu.id));
    const rencana: VarianTakDitawarkan[] = [];
    for (const id of ditawarkan) {
      const hargaDki = (await versiContohBerlaku(bukuHargaLayanan(by, "harga_layanan_dki", id), aktif)).length > 0;
      const tarifMitraJasa = (await versiContohBerlaku(bukuHargaLayanan(by, "tarif_mitra_jasa", id), aktif)).length > 0;
      if (hargaDki || tarifMitraJasa) rencana.push({ layananVariantId: id, hargaDki, tarifMitraJasa });
    }
    return rencana;
  }

  /** What `cabut` would do right now, for an actor already known to be Admin Platform. */
  async function susunRencanaCabut(by: Actor): Promise<RencanaCabut> {
    const aktif = (await semuaAktif()).sort((a, b) => URUTAN_CABUT[a.jenis as JenisDataContoh] - URUTAN_CABUT[b.jenis as JenisDataContoh]);
    return {
      aktif: aktif.map(toEntri),
      diblokir: await hargaBerlaku(aktif),
      tidakDitawarkan: await rencanaTidakDitawarkan(by, aktif),
      pesananTerbuka: await pesananTerbukaDi(),
    };
  }

  /** The dry run: only Admin Platform reads the Mitra Jasa rates, so for anyone else the plan would silently leave variants out. */
  async function rencanaCabut(by: Actor): Promise<RencanaCabutResult> {
    const refusal = writeRefusal(by, "lokasi.buat", semuaLokasiMitraResource());
    if (refusal) return refusal;
    return { ok: true, ...(await susunRencanaCabut(by)) };
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
          if (ada.jenis === "tarif_global" && (await hargaMasihBerlaku(by, ada))) {
            // A price entered and recorded, with only the finishing mark missing: a price in force is never let go of, so the row is finished.
            await selesaikan(by, kode, reason);
            sudahAda.push(kode);
            continue;
          }
          // A build that was cut short: never finished, retired with everything it had recorded, then built afresh.
          const dibuang = await cabutPohon(by, ada, `${reason}: sisa build yang terputus dicabut`);
          if (!dibuang.ok) return { ok: false, reason: "gagal", kode, alasan: `sisa build terputus tidak bisa dicabut (${dibuang.alasan})`, dibuat, sudahAda };
        }

        // A fixture that enters a price names the book it writes to, so `tanam` can find a version a killed run entered there.
        const bukuItem =
          item.jenis === "tarif_global"
            ? item.kunciTarif
              ? bukuGlobal(item.kunciTarif)
              : null
            : item.jenis === "harga_layanan_dki" || item.jenis === "tarif_mitra_jasa"
              ? bukuHargaLayanan(by, item.jenis, item.layananVariantId)
              : null;
        if (bukuItem) {
          // A contoh price a killed run entered and never recorded is recorded now, never entered a second time.
          const takTercatat = (await versiContohBerlaku(bukuItem, await semuaAktif())).find((satu) => satu.kode === null);
          if (takTercatat) {
            const dicatat = await catatEntri(by, { kode, himpunan, jenis: item.jenis, entitasId: `${bukuItem.kunci}:${takTercatat.versi}`, reason }, true);
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

      const rencana = await susunRencanaCabut(by);
      if (rencana.diblokir.length > 0) {
        return { ok: false, reason: "harga_contoh_masih_berlaku", diblokir: rencana.diblokir, pesananTerbuka: rencana.pesananTerbuka };
      }
      const dicabut: Partial<Record<JenisDataContoh, number>> = {};
      const gagal: { kode: string; alasan: string }[] = [];
      // A variant offered at a TPU at an example price stops being offered first, before any row of its own is let go of: if its
      // mark cannot be taken off, its rows stay active and the run fails, because the variant would still be offered. Layanan
      // refuses the mark only to an actor who is not Admin Platform, whom `cabut` has already refused, so no real call lands in
      // that branch today; it is kept so that a rule Layanan adds later stops the retirement instead of leaving a variant offered.
      const tidakDitawarkan: VarianTakDitawarkan[] = [];
      const tetapDitawarkan = new Set<string>();
      for (const satu of rencana.tidakDitawarkan) {
        const hasil = await deps.layanan.tandaiBolehDiTpu(by, satu.layananVariantId, { boleh: false, reason: `${reason.data}: harga contoh belum digantikan versi asli` });
        if (hasil.ok || hasil.reason === "tidak_ditemukan") tidakDitawarkan.push(satu);
        else {
          tetapDitawarkan.add(satu.layananVariantId);
          gagal.push({ kode: `varian ${satu.layananVariantId}`, alasan: `tanda "boleh di TPU DKI" tidak bisa dicabut (${hasil.reason})` });
        }
      }
      const aktif = await db.select().from(dataContohEntri).where(isNull(dataContohEntri.dicabutPada));
      const pekerjaanBerjalan: PekerjaanBerjalanMitraJasa[] = [];
      for (const row of aktif.sort((a, b) => URUTAN_CABUT[a.jenis as JenisDataContoh] - URUTAN_CABUT[b.jenis as JenisDataContoh])) {
        const varian = varianDariRow(row);
        if (varian && tetapDitawarkan.has(varian)) continue;
        const hasil = await cabutEntri(by, row, reason.data);
        if (hasil.ok) {
          dicabut[row.jenis as JenisDataContoh] = (dicabut[row.jenis as JenisDataContoh] ?? 0) + 1;
          if (hasil.berjalan.length > 0) pekerjaanBerjalan.push({ kode: row.kode, mitraJasaId: row.entitasId, pekerjaan: hasil.berjalan });
        } else gagal.push({ kode: row.kode, alasan: hasil.alasan });
      }
      const sisa = (await semuaAktif()).map(toEntri);
      if (gagal.length > 0 || sisa.length > 0) return { ok: false, reason: "masih_aktif", gagal, sisa, pesananTerbuka: rencana.pesananTerbuka, pekerjaanBerjalan };
      return { ok: true, dicabut, tidakDitawarkan, pesananTerbuka: rencana.pesananTerbuka, pekerjaanBerjalan };
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
