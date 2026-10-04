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
 * while a contoh version of one is still the version in force, because the next
 * real order would be charged an example price. A price tied to a contoh Lokasi
 * Mitra goes with it: nothing can quote a hidden Lokasi Mitra.
 *
 * Only Admin Platform writes here, under `lokasi.buat` (the action creating or
 * hiding a Lokasi Mitra is), like the Katalog Lama ledger. Each owning module
 * checks and audits its own write; this module audits its own rows.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import { semuaLokasiMitraResource, writeRefusal, type Actor, type Identity, type WriteRefusal } from "@/domain/identity";
import type { Lokasi } from "@/domain/lokasi";
import type { PesananBerjalan } from "@/domain/pemesanan";
import type { GlobalTariffKey, Tariffs } from "@/domain/tariffs";
import { GLOBAL_TARIFF_KEYS } from "@/domain/tariffs";
import type { Clock } from "@/ports/clock";
import { dataContohEntri } from "./schema";

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
  | { ok: false; reason: "kode_dipakai_entitas_lain"; milik: EntriDataContoh };

/** What a fixture's build is handed to record what it creates, the moment it creates it. */
export interface KonteksTanam {
  /** Records the plan item's own entity (its Lokasi Mitra), right after it is created: from then on `cabut` and a cut-short rerun can find it. */
  catatInduk(entitasId: string): Promise<void>;
  /** Records an entity created under the plan item (its Jenis Makam, its staff Akun); recording the same code twice is harmless. */
  catatAnak(input: { kode: string; jenis: JenisDataContoh; entitasId: string }): Promise<void>;
}

/** One fixture of a set: its code, and how to build it through the owning modules when the registry holds none. */
export interface RencanaTanam {
  kode: string;
  jenis: JenisDataContoh;
  buat(ctx: KonteksTanam): Promise<{ ok: true } | { ok: false; reason: string }>;
}

export type TanamResult =
  | { ok: true; dibuat: string[]; sudahAda: string[] }
  | WriteRefusal
  | { ok: false; reason: "gagal"; kode: string; alasan: string; dibuat: string[]; sudahAda: string[] };

/** A contoh price that is still the one in force. */
export interface HargaContohBerlaku {
  kode: string;
  key: GlobalTariffKey;
  amount: number;
}

/** An order still running at a Lokasi Mitra the registry holds. */
export interface PesananTerbukaDiLokasiContoh extends PesananBerjalan {
  lokasiKode: string;
  lokasiId: string;
}

export interface RencanaCabut {
  /** Every entry still active, in the order `cabut` retires them. */
  aktif: EntriDataContoh[];
  /** The contoh prices with no real successor yet: while any is listed `cabut` retires nothing. */
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
  tariffs: Pick<Tariffs, "globalTariff">;
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
  /** Every entry still active, in registry order, and how many were retired. */
  status(): Promise<{ aktif: EntriDataContoh[]; dicabut: number }>;
  /** Whether anything contoh is active: what the banner and the preflight ask. */
  aktif(): Promise<boolean>;
}

const kodeSchema = z.string().trim().min(1).max(160);
const reasonSchema = z.string().trim().min(1).max(500);
const catatSchema = z.object({
  kode: kodeSchema,
  himpunan: z.enum(himpunanDataContoh),
  jenis: z.enum(jenisDataContoh),
  entitasId: z.string().trim().min(1).max(200),
  indukKode: kodeSchema.nullish(),
  reason: reasonSchema,
});
const tanamSchema = z.object({ himpunan: z.enum(himpunanDataContoh), reason: reasonSchema });
/** `<tariff key>:<version seq>`, how a global price version is named in the registry. */
const versiTarifSchema = z.string().regex(/^[a-z_]+:\d+$/);

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
    const input = catatSchema.parse(raw);
    const sama = (row: Row) => row.jenis === input.jenis && row.entitasId === input.entitasId;
    const ada = await aktifDenganKode(input.kode);
    if (ada) return sama(ada) ? { ok: true, entri: toEntri(ada), baru: false } : { ok: false, reason: "kode_dipakai_entitas_lain", milik: toEntri(ada) };

    return deps.audit.staffWrite(db, async (tx, record) => {
      const now = deps.clock.now();
      const [baru] = await tx
        .insert(dataContohEntri)
        .values({
          kode: input.kode,
          himpunan: input.himpunan,
          jenis: input.jenis,
          entitasId: input.entitasId,
          indukKode: input.indukKode ?? null,
          selesaiPada: selesai ? now : null,
          dicatatPada: now,
          dicatatOleh: by.accountId,
        })
        .onConflictDoNothing()
        .returning();
      if (!baru) {
        // Another run recorded the code between the read and the insert.
        const [dipakai] = await tx.select().from(dataContohEntri).where(and(eq(dataContohEntri.kode, input.kode), isNull(dataContohEntri.dicabutPada)));
        return sama(dipakai)
          ? { ok: true as const, entri: toEntri(dipakai), baru: false }
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

  /** Retires what one entry names through the owning module, then marks it retired. A price version needs no write here: `cabut` proved it superseded. */
  async function cabutEntri(by: Actor, row: Row, reason: string): Promise<{ ok: true } | { ok: false; alasan: string }> {
    if (row.jenis === "lokasi_mitra") {
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

  /** The contoh global prices that are still the version in force: a version a later one has not superseded yet. */
  async function hargaBerlaku(aktif: Row[]): Promise<HargaContohBerlaku[]> {
    const diblokir: HargaContohBerlaku[] = [];
    for (const row of aktif.filter((satu) => satu.jenis === "tarif_global")) {
      const [key, seq] = versiTarifSchema.parse(row.entitasId).split(":");
      if (!(GLOBAL_TARIFF_KEYS as readonly string[]).includes(key)) throw new Error(`Data Contoh: tarif global tidak dikenal: ${key}`);
      const berlaku = await deps.tariffs.globalTariff(key as GlobalTariffKey, deps.clock.now());
      if (berlaku && String(berlaku.seq) === seq) diblokir.push({ kode: row.kode, key: key as GlobalTariffKey, amount: berlaku.amount });
    }
    return diblokir;
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
      const { himpunan, reason } = tanamSchema.parse({ himpunan: raw.himpunan, reason: raw.reason });
      const dibuat: string[] = [];
      const sudahAda: string[] = [];

      for (const item of raw.rencana) {
        const kode = kodeSchema.parse(item.kode);
        const ada = await aktifDenganKode(kode);
        if (ada && ada.selesaiPada) {
          sudahAda.push(kode);
          continue;
        }
        if (ada) {
          // A build that was cut short: never finished, retired with everything it had recorded, then built afresh.
          const dibuang = await cabutPohon(by, ada, `${reason}: sisa build yang terputus dicabut`);
          if (!dibuang.ok) return { ok: false, reason: "gagal", kode, alasan: `sisa build terputus tidak bisa dicabut (${dibuang.alasan})`, dibuat, sudahAda };
        }

        const ctx: KonteksTanam = {
          async catatInduk(entitasId) {
            const hasil = await catatEntri(by, { kode, himpunan, jenis: item.jenis, entitasId, reason }, false);
            if (!hasil.ok) throw new Error(`Data Contoh: ${kode} tidak tercatat (${hasil.reason})`);
          },
          async catatAnak(anak) {
            const hasil = await catatEntri(by, { ...anak, himpunan, indukKode: kode, reason }, true);
            if (!hasil.ok) throw new Error(`Data Contoh: ${anak.kode} tidak tercatat (${hasil.reason})`);
          },
        };
        const buang = async (): Promise<string> => {
          const induk = await aktifDenganKode(kode);
          if (!induk) return "";
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
        await db
          .update(dataContohEntri)
          .set({ selesaiPada: deps.clock.now() })
          .where(and(eq(dataContohEntri.kode, kode), isNull(dataContohEntri.dicabutPada), isNull(dataContohEntri.selesaiPada)));
        dibuat.push(kode);
      }
      return { ok: true, dibuat, sudahAda };
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
      const aktif = (await semuaAktif()).map(toEntri);
      const semua = await db.select({ kode: dataContohEntri.kode, dicabutPada: dataContohEntri.dicabutPada }).from(dataContohEntri);
      return { aktif, dicabut: semua.filter((row) => row.dicabutPada !== null).length };
    },

    async aktif() {
      const [satu] = await db.select({ id: dataContohEntri.id }).from(dataContohEntri).where(isNull(dataContohEntri.dicabutPada)).limit(1);
      return satu !== undefined;
    },
  };
}
