/**
 * A Keluhan and a Penilaian on a finished job (spec, Layanan > Pekerjaan Layanan;
 * stories 94, 95, 131 and 158; CONTEXT.md "Keluhan" and "Penilaian").
 *
 * **The window.** Once the proof has been shown to the Pemesan (the Admin Lokasi's
 * upload at a Lokasi Mitra; Admin Platform's approval at a TPU, which ticket 57 records
 * through `pekerjaan_layanan.bukti_ditunjukkan_at` the same way) the Pemesan has 3×24 h to
 * file a Keluhan. A job has at most one, which is what makes "the window closes with no
 * Keluhan" a plain fact rather than a count.
 *
 * **The decision** is Admin Platform's, and it is one of three: rejected (the job goes
 * back to Selesai and its Pencairan is due), a redo (the job stays in Keluhan and the
 * fulfiller owes a new proof, which the Admin Lokasi sees as a Kerjakan ulang row) or a
 * refund of the item (a request to Refunds; whether it is netted from a Pencairan or
 * becomes a Potongan is Refunds' and Payouts' business). Admin Platform may separately
 * override what the job pays its fulfiller, with a note, through Payouts.
 *
 * **The Pencairan trigger.** Layanan is the module that knows a job's window closed, so it
 * asks Payouts to make the job's item due in three cases: the window closed with no Keluhan
 * (the tick), a Keluhan was rejected, or the redo proof was shown. Payouts may not have
 * written the item yet (the money has not arrived), so every case is retried by the same
 * tick while the answer is "belum_ada". Nothing here moves a rupiah.
 *
 * **Penilaian** is one per job, 1–5 stars and a comment, and only Admin Platform reads it:
 * no read that reaches an Admin Lokasi or a Mitra Jasa carries it.
 */
import { and, asc, desc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { refusable } from "@/db/unit-of-work";
import { daytimeHoursDeadline } from "@/domain/lokasi";
import { keluhanLayananResource, lokasiMitraResource, normaliseEmail, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { buktiUntukPekerjaan, type BuktiTerbaca } from "./bukti";
import type { LayananDeps, PemesanLayanan } from "./deps";
import { ajukanKeluhanSchema, beriPenilaianSchema, putuskanKeluhanSchema, sesuaikanPencairanKeluhanSchema } from "./pesanan-schema";
import {
  keluhanLayanan,
  penilaianLayanan,
  pekerjaanLayanan,
  pesananLayanan,
  pesananLayananItem,
  type KeluhanStatus,
  type PekerjaanLayananStatus,
} from "./schema";

/** The Keluhan window: 3×24 h from when the proof is shown to the Pemesan. */
export const JENDELA_KELUHAN_JAM = 72;
/** The first response to a Keluhan is due in this many **daytime** hours (06:00–18:00 WIB). */
export const JAM_RESPON_PERTAMA_KELUHAN = 4;

const JAM_MS = 60 * 60 * 1000;

/** The instant a Keluhan window that opened at `ditunjukkanPada` closes. */
export function jendelaKeluhanBerakhir(ditunjukkanPada: Date): Date {
  return new Date(ditunjukkanPada.getTime() + JENDELA_KELUHAN_JAM * JAM_MS);
}

/** When the proof of this job was last shown to its Pemesan, or null while none has been. */
export function ditunjukkanPadaOf(job: Pick<typeof pekerjaanLayanan.$inferSelect, "buktiDitunjukkanAt" | "selesaiAt">): Date | null {
  // A job finished before `bukti_ditunjukkan_at` existed was shown its proof when it was finished.
  return job.buktiDitunjukkanAt ?? job.selesaiAt;
}

/** One Keluhan as a reader sees it. */
export interface KeluhanTerbaca {
  id: string;
  pekerjaanId: string;
  status: KeluhanStatus;
  alasan: string;
  diajukanAt: Date;
  /** 4 daytime hours after filing: the Tier 1 row's deadline. */
  responPertamaDueAt: Date;
  diputuskanAt: Date | null;
  /** What Admin Platform wrote with the decision. */
  catatanKeputusan: string | null;
  redoSelesaiAt: Date | null;
}

function toKeluhan(row: typeof keluhanLayanan.$inferSelect): KeluhanTerbaca {
  return {
    id: row.id,
    pekerjaanId: row.pekerjaanId,
    status: row.status,
    alasan: row.alasan,
    diajukanAt: row.diajukanAt,
    responPertamaDueAt: row.responPertamaDueAt,
    diputuskanAt: row.diputuskanAt,
    catatanKeputusan: row.catatanKeputusan,
    redoSelesaiAt: row.redoSelesaiAt,
  };
}

/** The Keluhan of one job, or null. */
export async function keluhanOfPekerjaan(db: Database, pekerjaanId: string): Promise<KeluhanTerbaca | null> {
  const [row] = await db.select().from(keluhanLayanan).where(eq(keluhanLayanan.pekerjaanId, pekerjaanId));
  return row ? toKeluhan(row) : null;
}

type Baris = {
  job: typeof pekerjaanLayanan.$inferSelect;
  order: typeof pesananLayanan.$inferSelect;
  item: typeof pesananLayananItem.$inferSelect;
};

async function bacaBaris(db: Database, pekerjaanId: string): Promise<Baris | null> {
  if (!z.uuid().safeParse(pekerjaanId).success) return null;
  const [row] = await db
    .select({ job: pekerjaanLayanan, order: pesananLayanan, item: pesananLayananItem })
    .from(pekerjaanLayanan)
    .innerJoin(pesananLayanan, eq(pesananLayanan.id, pekerjaanLayanan.pesananId))
    .innerJoin(pesananLayananItem, eq(pesananLayananItem.id, pekerjaanLayanan.pesananItemId))
    .where(eq(pekerjaanLayanan.id, pekerjaanId));
  return row ?? null;
}

/** Whether this Akun is the Pemesan it says it is: the email is theirs and the Akun holds it. */
async function pemesanSah(deps: LayananDeps, pemesan: PemesanLayanan): Promise<boolean> {
  const email = normaliseEmail(pemesan.email);
  const akun = email === null ? null : await deps.identity.accountByEmail(email);
  return akun !== null && akun.id === pemesan.accountId;
}

/* ── the Pemesan files a Keluhan ── */

export type AjukanKeluhanResult =
  | { ok: true; keluhan: KeluhanTerbaca; jendelaBerakhirAt: Date }
  | {
      ok: false;
      reason: "input_tidak_valid" | "bukan_pemesan" | "tidak_ditemukan" | "sudah_dibatalkan" | "belum_selesai" | "jendela_tertutup" | "sudah_ada";
    };

/**
 * The Pemesan files a Keluhan on one finished job. Refused after the window, for a job that
 * is not finished, and for a job that already has one. The job becomes Keluhan and its Tier 1
 * row exists from this moment, with a first response due in 4 daytime hours.
 */
export async function ajukanKeluhan(deps: LayananDeps, pemesan: PemesanLayanan, rawInput: unknown): Promise<AjukanKeluhanResult> {
  const parsed = ajukanKeluhanSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const { pekerjaanId, alasan } = parsed.data;
  if (!(await pemesanSah(deps, pemesan))) return { ok: false, reason: "bukan_pemesan" };

  const baris = await bacaBaris(deps.db, pekerjaanId);
  // Somebody else's order is "not found", not "not yours", as everywhere a family reads an order.
  if (!baris || baris.order.pemesanAccountId !== pemesan.accountId) return { ok: false, reason: "tidak_ditemukan" };
  const { job } = baris;
  if (job.status === "dibatalkan") return { ok: false, reason: "sudah_dibatalkan" };
  if (await keluhanOfPekerjaan(deps.db, pekerjaanId)) return { ok: false, reason: "sudah_ada" };
  const ditunjukkan = ditunjukkanPadaOf(job);
  if (job.status !== "selesai" || ditunjukkan === null) return { ok: false, reason: "belum_selesai" };

  const now = deps.clock.now();
  const berakhir = jendelaKeluhanBerakhir(ditunjukkan);
  if (now.getTime() > berakhir.getTime()) return { ok: false, reason: "jendela_tertutup" };

  const hasil = await refusable<{ ok: true; keluhan: KeluhanTerbaca } | { ok: false; reason: "sudah_ada" | "belum_selesai" }>(deps.db, async (tx) => {
    // The status is matched, so a job another request moved is not filed on twice.
    const dipindah = await tx
      .update(pekerjaanLayanan)
      .set({ status: "keluhan" })
      .where(and(eq(pekerjaanLayanan.id, pekerjaanId), eq(pekerjaanLayanan.status, "selesai")))
      .returning({ id: pekerjaanLayanan.id });
    if (dipindah.length === 0) return { ok: false as const, reason: "belum_selesai" as const };
    const [ditulis] = await tx
      .insert(keluhanLayanan)
      .values({
        pekerjaanId,
        alasan,
        diajukanAt: now,
        responPertamaDueAt: daytimeHoursDeadline(now, JAM_RESPON_PERTAMA_KELUHAN),
      })
      .onConflictDoNothing()
      .returning();
    if (!ditulis) return { ok: false as const, reason: "sudah_ada" as const };
    return { ok: true as const, keluhan: toKeluhan(ditulis) };
  });
  if (!hasil.ok) return hasil;
  return { ok: true, keluhan: hasil.keluhan, jendelaBerakhirAt: berakhir };
}

/* ── Admin Platform decides ── */

export type PutuskanKeluhanResult =
  | { ok: true; keluhan: KeluhanTerbaca }
  | WriteRefusal
  | {
      ok: false;
      reason: "input_tidak_valid" | "tidak_ditemukan" | "sudah_diputuskan" | "pengembalian_tidak_bisa_diajukan" | "pengembalian_tertunda";
    };

/**
 * Admin Platform decides one open Keluhan, with a note: **rejected** (the job is Selesai
 * again and its Pencairan is due), a **redo** (the fulfiller owes a new proof) or a **refund**
 * of the job's line (asked of Refunds on this transaction, the fee following Refunds' own
 * fault rule with the fault at the fulfiller). Audited.
 */
export async function putuskanKeluhan(deps: LayananDeps, by: Actor, rawInput: unknown): Promise<PutuskanKeluhanResult> {
  const refusal = writeRefusal(by, "keluhan.kelola", keluhanLayananResource());
  if (refusal) return refusal;
  const parsed = putuskanKeluhanSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const { keluhanId, keputusan, catatan } = parsed.data;
  const now = deps.clock.now();

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    // The Keluhan row is locked, so two decisions on one Keluhan take turns and the second finds it decided.
    const [sebelum] = await tx.select().from(keluhanLayanan).where(eq(keluhanLayanan.id, keluhanId)).for("update");
    if (!sebelum) return { ok: false, reason: "tidak_ditemukan" } as const;
    if (sebelum.status !== "terbuka") return { ok: false, reason: "sudah_diputuskan" } as const;
    const baris = await bacaBaris(tx, sebelum.pekerjaanId);
    if (!baris) return { ok: false, reason: "tidak_ditemukan" } as const;

    let permintaanId: string | null = null;
    if (keputusan === "kembalikan_dana") {
      // Asked first, before anything is written: a refusal by Refunds leaves the Keluhan exactly as it was.
      const diminta = await mintaPengembalian(deps, tx, baris);
      if (!diminta.ok) return diminta;
      permintaanId = diminta.permintaanId;
    }

    const status: KeluhanStatus = keputusan === "tolak" ? "ditolak" : keputusan === "kerjakan_ulang" ? "kerjakan_ulang" : "dana_kembali";
    await tx
      .update(keluhanLayanan)
      .set({ status, diputuskanAt: now, diputuskanOleh: by.accountId, catatanKeputusan: catatan, permintaanPengembalianId: permintaanId })
      .where(eq(keluhanLayanan.id, keluhanId));
    if (keputusan === "tolak") {
      // Rejected: the work stands, so the job is Selesai again and what it earns is due.
      await tx
        .update(pekerjaanLayanan)
        .set({ status: "selesai" })
        .where(and(eq(pekerjaanLayanan.id, baris.job.id), eq(pekerjaanLayanan.status, "keluhan")));
      await jadikanPencairanJatuhTempo(deps, tx, baris, now);
    }
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "layanan.putuskan_keluhan",
      entity: { kind: "keluhan_layanan", id: keluhanId },
      lokasiId: baris.job.lokasiId,
      before: { status: "terbuka" },
      after: { status, keputusan, pekerjaanId: baris.job.id, ...(permintaanId ? { permintaanPengembalianId: permintaanId } : {}) },
      reason: catatan,
    });
    const [sesudah] = await tx.select().from(keluhanLayanan).where(eq(keluhanLayanan.id, keluhanId));
    return { ok: true, keluhan: toKeluhan(sesudah) } as const;
  });
}

/** The refund request for the job's own line: Refunds owns the fee rule, the amount ceiling and the transfer. */
async function mintaPengembalian(
  deps: LayananDeps,
  tx: Database,
  baris: Baris,
): Promise<{ ok: true; permintaanId: string } | { ok: false; reason: "pengembalian_tidak_bisa_diajukan" | "pengembalian_tertunda" }> {
  const tagihan = await deps.billing.within(tx).tagihan(baris.order.tagihanId);
  if (!tagihan) return { ok: false, reason: "pengembalian_tidak_bisa_diajukan" };
  // The job's own line is found by position, as a cancellation finds it: the order issued its lines in its items' order.
  const line = tagihan.lines[baris.item.posisi];
  if (!line || line.kind !== "layanan" || line.label !== baris.item.label) return { ok: false, reason: "pengembalian_tidak_bisa_diajukan" };
  const diajukan = await deps.refunds.ajukanBaris(
    tagihan.id,
    { pihakBersalah: "lokasi", lines: [{ label: line.label, amount: line.amount, lokasiId: line.provider.kind === "lokasi_mitra" ? line.provider.lokasiId : null }] },
    tx,
  );
  if (diajukan.ok) return { ok: true, permintaanId: diajukan.permintaanId };
  return { ok: false, reason: diajukan.reason === "sudah_ada_permintaan_terbuka" ? "pengembalian_tertunda" : "pengembalian_tidak_bisa_diajukan" };
}

export type SesuaikanPencairanResult =
  | { ok: true; jumlah: number; jumlahAwal: number }
  | WriteRefusal
  | {
      ok: false;
      reason:
        | "input_tidak_valid"
        | "tidak_ditemukan"
        | "keluhan_belum_diputuskan"
        | "keputusan_tidak_mengubah_pencairan"
        | "pencairan_belum_ada"
        | "melebihi_tarif"
        | "sudah_dicairkan";
    };

/** The decisions after which the job still pays its fulfiller, so an override can change what it pays. */
const KEPUTUSAN_DENGAN_PENCAIRAN: readonly KeluhanStatus[] = ["ditolak", "kerjakan_ulang", "selesai_ulang"];

/**
 * Admin Platform overrides what the job pays its fulfiller after a Keluhan (e.g. half), with a
 * mandatory note. Only a Keluhan that was decided with an outcome that still pays (rejected, a redo,
 * a finished redo) allows it: one waiting for a decision has nothing to correct, and a refund settles
 * the item through Refunds. The state check, the item read and Payouts' own audited write are one
 * transaction, and the ceiling (never above what the order issued) is Payouts' rule.
 */
export async function sesuaikanPencairanKeluhan(deps: LayananDeps, by: Actor, rawInput: unknown): Promise<SesuaikanPencairanResult> {
  const refusal = writeRefusal(by, "keluhan.kelola", keluhanLayananResource());
  if (refusal) return refusal;
  const parsed = sesuaikanPencairanKeluhanSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const { keluhanId, amount, catatan } = parsed.data;
  return refusable<SesuaikanPencairanResult>(deps.db, async (tx) => {
    // The Keluhan is locked, so a decision and an override on it take turns.
    const [keluhan] = await tx.select().from(keluhanLayanan).where(eq(keluhanLayanan.id, keluhanId)).for("update");
    if (!keluhan) return { ok: false, reason: "tidak_ditemukan" } as const;
    if (keluhan.status === "terbuka") return { ok: false, reason: "keluhan_belum_diputuskan" } as const;
    if (!KEPUTUSAN_DENGAN_PENCAIRAN.includes(keluhan.status)) return { ok: false, reason: "keputusan_tidak_mengubah_pencairan" } as const;
    const baris = await bacaBaris(tx, keluhan.pekerjaanId);
    if (!baris) return { ok: false, reason: "tidak_ditemukan" } as const;
    const item = await deps.payouts.itemLayanan(baris.order.tagihanId, baris.item.posisi, tx);
    if (!item) return { ok: false, reason: "pencairan_belum_ada" } as const;
    const hasil = await deps.payouts.turunkanJumlahPencairan(by, { itemId: item.id, amount, catatan }, tx);
    if (hasil.ok) return { ok: true, jumlah: hasil.item.amount, jumlahAwal: hasil.item.amountAwal } as const;
    return hasil;
  });
}

/**
 * Asks Payouts to make this job's item due, on the caller's transaction, and remembers the
 * answer on the job so the tick stops offering it. `belum_ada` is not a failure: the money has
 * not arrived, and the next tick asks again.
 */
async function jadikanPencairanJatuhTempo(deps: LayananDeps, tx: Database, baris: Baris, now: Date): Promise<boolean> {
  const hasil = await deps.payouts.jadikanLayananJatuhTempo(tx, { tagihanId: baris.order.tagihanId, tagihanPosisi: baris.item.posisi });
  if (!hasil.ok) return false;
  await tx
    .update(pekerjaanLayanan)
    .set({ pencairanJatuhTempoAt: now })
    .where(and(eq(pekerjaanLayanan.id, baris.job.id), isNull(pekerjaanLayanan.pencairanJatuhTempoAt)));
  return true;
}

/**
 * What the redo's new proof does, on the transaction that shows it: the Keluhan is done and its
 * Kerjakan ulang row closes, the proof is shown to the Pemesan again, and the job's Pencairan is
 * released. Called by `selesaikanPekerjaan` only, for a job whose Keluhan is `kerjakan_ulang`.
 */
export async function selesaikanKerjakanUlang(deps: LayananDeps, tx: Database, pekerjaanId: string, now: Date): Promise<boolean> {
  const dipindah = await tx
    .update(keluhanLayanan)
    .set({ status: "selesai_ulang", redoSelesaiAt: now })
    .where(and(eq(keluhanLayanan.pekerjaanId, pekerjaanId), eq(keluhanLayanan.status, "kerjakan_ulang")))
    .returning({ id: keluhanLayanan.id });
  if (dipindah.length === 0) return false;
  const baris = await bacaBaris(tx, pekerjaanId);
  if (!baris) return false;
  await tx
    .update(pekerjaanLayanan)
    .set({ status: "selesai", buktiDitunjukkanAt: now, jendelaDitutupAt: null })
    .where(and(eq(pekerjaanLayanan.id, pekerjaanId), eq(pekerjaanLayanan.status, "keluhan")));
  await jadikanPencairanJatuhTempo(deps, tx, baris, now);
  return true;
}

/* ── what the staff read ── */

/** One open Keluhan as the Antrean's Tier 1 row names it. */
export interface KeluhanTerbuka {
  id: string;
  pekerjaanId: string;
  lokasi: { id: string; name: string };
  pesanan: string;
  petak: string;
  label: string;
  diajukanAt: Date;
  responPertamaDueAt: Date;
}

/** Every Keluhan waiting for Admin Platform's decision, oldest first: the Tier 1 row's query, and the counter strip's. */
export async function keluhanTerbuka(deps: Pick<LayananDeps, "db">): Promise<KeluhanTerbuka[]> {
  const rows = await deps.db
    .select({ keluhan: keluhanLayanan, order: pesananLayanan, item: pesananLayananItem, lokasiId: pekerjaanLayanan.lokasiId })
    .from(keluhanLayanan)
    .innerJoin(pekerjaanLayanan, eq(pekerjaanLayanan.id, keluhanLayanan.pekerjaanId))
    .innerJoin(pesananLayanan, eq(pesananLayanan.id, pekerjaanLayanan.pesananId))
    .innerJoin(pesananLayananItem, eq(pesananLayananItem.id, pekerjaanLayanan.pesananItemId))
    .where(eq(keluhanLayanan.status, "terbuka"))
    .orderBy(asc(keluhanLayanan.diajukanAt), asc(keluhanLayanan.id));
  return rows.map((row) => ({
    id: row.keluhan.id,
    pekerjaanId: row.keluhan.pekerjaanId,
    lokasi: { id: row.lokasiId, name: row.order.lokasiName },
    pesanan: row.order.nomor,
    petak: row.order.petakNomor,
    label: row.item.label,
    diajukanAt: row.keluhan.diajukanAt,
    responPertamaDueAt: row.keluhan.responPertamaDueAt,
  }));
}

/** One redo an Admin Lokasi owes, as its Kerjakan ulang row names it. */
export interface KerjakanUlang {
  pekerjaanId: string;
  keluhanId: string;
  label: string;
  petak: string;
  pesanan: string;
  /** When Admin Platform decided the redo. */
  diputuskanAt: Date;
}

/** The redos one Lokasi Mitra owes, oldest decision first: its Antrean Lokasi's Mendesak "Kerjakan ulang" rows. */
export async function kerjakanUlangUntukLokasi(deps: LayananDeps, by: Actor, lokasiId: string): Promise<KerjakanUlang[]> {
  if (!z.uuid().safeParse(lokasiId).success) return [];
  if (writeRefusal(by, "layanan.lihat_staf", lokasiMitraResource(lokasiId))) return [];
  const rows = await deps.db
    .select({ keluhan: keluhanLayanan, order: pesananLayanan, item: pesananLayananItem })
    .from(keluhanLayanan)
    .innerJoin(pekerjaanLayanan, eq(pekerjaanLayanan.id, keluhanLayanan.pekerjaanId))
    .innerJoin(pesananLayanan, eq(pesananLayanan.id, pekerjaanLayanan.pesananId))
    .innerJoin(pesananLayananItem, eq(pesananLayananItem.id, pekerjaanLayanan.pesananItemId))
    .where(and(eq(pekerjaanLayanan.lokasiId, lokasiId), eq(keluhanLayanan.status, "kerjakan_ulang")))
    .orderBy(asc(keluhanLayanan.diputuskanAt), asc(keluhanLayanan.id));
  return rows.map((row) => ({
    pekerjaanId: row.keluhan.pekerjaanId,
    keluhanId: row.keluhan.id,
    label: row.item.label,
    petak: row.order.petakNomor,
    pesanan: row.order.nomor,
    diputuskanAt: row.keluhan.diputuskanAt ?? row.keluhan.diajukanAt,
  }));
}

/** A Penilaian as Admin Platform reads it. */
export interface PenilaianTerbaca {
  pekerjaanId: string;
  bintang: number;
  komentar: string | null;
  dibuatAt: Date;
}

/** One Keluhan with everything Admin Platform decides on: the job, its proof, the Pemesan, the Penilaian and what the job pays. */
export interface KeluhanUntukPlatform {
  keluhan: KeluhanTerbaca;
  pekerjaan: { id: string; status: PekerjaanLayananStatus; targetDate: string; label: string; teks: string | null };
  lokasi: { id: string; name: string };
  petak: { id: string; nomor: string };
  pesanan: { nomor: string };
  pemesan: { name: string; phoneNumber: string; email: string };
  /** When the proof was shown to the Pemesan and when the window ended. */
  ditunjukkanAt: Date | null;
  jendelaBerakhirAt: Date | null;
  bukti: BuktiTerbaca[];
  penilaian: PenilaianTerbaca | null;
  /** The job's Pencairan item: what it pays and whether an override is still possible; null while it has not been written. */
  pencairan: { itemId: string; status: string; amount: number; amountAwal: number; catatan: string | null } | null;
}

export type KeluhanUntukPlatformResult = { ok: true; keluhan: KeluhanUntukPlatform } | WriteRefusal | { ok: false; reason: "tidak_ditemukan" };

/** One Keluhan as Admin Platform reads it to decide: with the proof, the Pemesan's contact, the Penilaian and the job's Pencairan. */
export async function keluhanUntukPlatform(deps: LayananDeps, by: Actor, keluhanId: string): Promise<KeluhanUntukPlatformResult> {
  const refusal = writeRefusal(by, "keluhan.kelola", keluhanLayananResource());
  if (refusal) return refusal;
  if (!z.uuid().safeParse(keluhanId).success) return { ok: false, reason: "tidak_ditemukan" };
  const [keluhan] = await deps.db.select().from(keluhanLayanan).where(eq(keluhanLayanan.id, keluhanId));
  if (!keluhan) return { ok: false, reason: "tidak_ditemukan" };
  const baris = await bacaBaris(deps.db, keluhan.pekerjaanId);
  if (!baris) return { ok: false, reason: "tidak_ditemukan" };
  const [penilaian] = await deps.db.select().from(penilaianLayanan).where(eq(penilaianLayanan.pekerjaanId, keluhan.pekerjaanId));
  const item = await deps.payouts.itemLayanan(baris.order.tagihanId, baris.item.posisi);
  const ditunjukkan = ditunjukkanPadaOf(baris.job);
  return {
    ok: true,
    keluhan: {
      keluhan: toKeluhan(keluhan),
      pekerjaan: { id: baris.job.id, status: baris.job.status, targetDate: baris.job.targetDate, label: baris.item.label, teks: baris.item.teks },
      lokasi: { id: baris.job.lokasiId, name: baris.order.lokasiName },
      petak: { id: baris.job.petakId, nomor: baris.order.petakNomor },
      pesanan: { nomor: baris.order.nomor },
      pemesan: { name: baris.order.pemesanName, phoneNumber: baris.order.pemesanPhone, email: baris.order.pemesanEmail },
      ditunjukkanAt: ditunjukkan,
      jendelaBerakhirAt: ditunjukkan ? jendelaKeluhanBerakhir(ditunjukkan) : null,
      bukti: await buktiUntukPekerjaan(deps, baris.job.id),
      penilaian: penilaian ? { pekerjaanId: penilaian.pekerjaanId, bintang: penilaian.bintang, komentar: penilaian.komentar, dibuatAt: penilaian.dibuatAt } : null,
      pencairan: item ? { itemId: item.id, status: item.status, amount: item.amount, amountAwal: item.amountAwal, catatan: item.catatanPenyesuaian } : null,
    },
  };
}

/* ── Penilaian ── */

export type BeriPenilaianResult =
  | { ok: true }
  | { ok: false; reason: "input_tidak_valid" | "bukan_pemesan" | "tidak_ditemukan" | "belum_selesai" | "sudah_dinilai" };

/**
 * A Penilaian is the family's own write, not a staff write, so it is intentionally not in the staff Audit Log
 * (as a family's filing of a Keluhan or its cancellation of a job are not): the row itself, with the Akun and
 * the moment, is the record.
 *
 * The Pemesan rates one finished job, 1–5 stars with an optional comment. One per job, and only for a
 * job that was finished (a job under a Keluhan may still be rated: the family's view of the work is
 * exactly what the Operator wants to know).
 */
export async function beriPenilaian(deps: LayananDeps, pemesan: PemesanLayanan, rawInput: unknown): Promise<BeriPenilaianResult> {
  const parsed = beriPenilaianSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const { pekerjaanId, bintang, komentar } = parsed.data;
  if (!(await pemesanSah(deps, pemesan))) return { ok: false, reason: "bukan_pemesan" };
  const baris = await bacaBaris(deps.db, pekerjaanId);
  if (!baris || baris.order.pemesanAccountId !== pemesan.accountId) return { ok: false, reason: "tidak_ditemukan" };
  if (baris.job.status === "dibatalkan" || baris.job.selesaiAt === null) return { ok: false, reason: "belum_selesai" };
  const [ditulis] = await deps.db
    .insert(penilaianLayanan)
    .values({ pekerjaanId, pemesanAccountId: pemesan.accountId, bintang, komentar, dibuatAt: deps.clock.now() })
    .onConflictDoNothing()
    .returning({ id: penilaianLayanan.id });
  return ditulis ? { ok: true } : { ok: false, reason: "sudah_dinilai" };
}

/** One Penilaian with the job it is about, for Admin Platform's list. */
export interface PenilaianDenganPekerjaan extends PenilaianTerbaca {
  lokasi: { id: string; name: string };
  petak: string;
  pesanan: string;
  label: string;
}

/** Every Penilaian, newest first: Admin Platform only, and the only read of them there is. */
export async function daftarPenilaian(deps: LayananDeps, by: Actor, limit = 200): Promise<PenilaianDenganPekerjaan[]> {
  if (writeRefusal(by, "keluhan.kelola", keluhanLayananResource())) return [];
  const rows = await deps.db
    .select({ nilai: penilaianLayanan, order: pesananLayanan, item: pesananLayananItem, lokasiId: pekerjaanLayanan.lokasiId })
    .from(penilaianLayanan)
    .innerJoin(pekerjaanLayanan, eq(pekerjaanLayanan.id, penilaianLayanan.pekerjaanId))
    .innerJoin(pesananLayanan, eq(pesananLayanan.id, pekerjaanLayanan.pesananId))
    .innerJoin(pesananLayananItem, eq(pesananLayananItem.id, pekerjaanLayanan.pesananItemId))
    .orderBy(desc(penilaianLayanan.dibuatAt), desc(penilaianLayanan.id))
    .limit(limit);
  return rows.map((row) => ({
    pekerjaanId: row.nilai.pekerjaanId,
    bintang: row.nilai.bintang,
    komentar: row.nilai.komentar,
    dibuatAt: row.nilai.dibuatAt,
    lokasi: { id: row.lokasiId, name: row.order.lokasiName },
    petak: row.order.petakNomor,
    pesanan: row.order.nomor,
    label: row.item.label,
  }));
}

/** Which of these jobs have been rated: all a Pemesan's own page needs to know (their stars are not read back to anyone). */
export async function sudahDinilai(db: Database, pekerjaanIds: readonly string[]): Promise<Set<string>> {
  if (pekerjaanIds.length === 0) return new Set();
  const rows = await db
    .select({ id: penilaianLayanan.pekerjaanId })
    .from(penilaianLayanan)
    .where(inArray(penilaianLayanan.pekerjaanId, [...pekerjaanIds]));
  return new Set(rows.map((row) => row.id));
}

/* ── the tick ── */

/** What one run of the window-close tick did. */
export interface TutupJendelaHasil {
  /** Jobs whose window closed with nothing left open: the thread's closing signal (`jendela_ditutup_at`) was set. */
  ditutup: number;
  /** Jobs whose Pencairan item Payouts made due. */
  pencairanJatuhTempo: number;
}

/**
 * The Keluhan window-close tick (spec, Scheduler: "Keluhan window closes, which trigger Pencairan
 * due and thread closing"). From database state alone:
 *
 * - a Selesai job whose proof was shown more than 3×24 h ago gets its `jendela_ditutup_at` (the
 *   signal the message thread closes on, ticket 52);
 * - a Selesai job that has not had its Pencairan made due, and whose window closed with no Keluhan,
 *   or whose Keluhan was rejected, or whose redo proof was shown, is offered to Payouts. A job with
 *   an open Keluhan, a redo owed or a refund is `keluhan` and never Selesai, so it is not offered.
 *
 * Idempotent: a job is stamped once and Payouts answers `sudah` for an item already due.
 */
export async function tutupJendelaKeluhan(deps: LayananDeps, now: Date): Promise<TutupJendelaHasil> {
  const batas = new Date(now.getTime() - JENDELA_KELUHAN_JAM * JAM_MS);
  const hasil: TutupJendelaHasil = { ditutup: 0, pencairanJatuhTempo: 0 };

  // A job is a candidate for closing while it is Selesai, and Selesai is the only state in which nothing is left to decide.
  const tutup = await deps.db
    .select({ id: pekerjaanLayanan.id, buktiDitunjukkanAt: pekerjaanLayanan.buktiDitunjukkanAt, selesaiAt: pekerjaanLayanan.selesaiAt })
    .from(pekerjaanLayanan)
    .where(and(eq(pekerjaanLayanan.status, "selesai"), isNull(pekerjaanLayanan.jendelaDitutupAt), isNotNull(pekerjaanLayanan.selesaiAt)));
  for (const job of tutup) {
    const ditunjukkan = ditunjukkanPadaOf(job);
    // The window is still open at its last instant (a Keluhan is taken until then), so it is over only after it.
    if (!ditunjukkan || ditunjukkan.getTime() >= batas.getTime()) continue;
    const dipindah = await deps.db
      .update(pekerjaanLayanan)
      .set({ jendelaDitutupAt: now })
      .where(and(eq(pekerjaanLayanan.id, job.id), eq(pekerjaanLayanan.status, "selesai"), isNull(pekerjaanLayanan.jendelaDitutupAt)))
      .returning({ id: pekerjaanLayanan.id });
    hasil.ditutup += dipindah.length;
  }

  // One query carries everything a due job needs (its order line too), so the tick reads once, not once per job.
  const menunggu = await deps.db
    .select({
      job: pekerjaanLayanan,
      order: pesananLayanan,
      item: pesananLayananItem,
      keluhanStatus: keluhanLayanan.status,
    })
    .from(pekerjaanLayanan)
    .innerJoin(pesananLayanan, eq(pesananLayanan.id, pekerjaanLayanan.pesananId))
    .innerJoin(pesananLayananItem, eq(pesananLayananItem.id, pekerjaanLayanan.pesananItemId))
    .leftJoin(keluhanLayanan, eq(keluhanLayanan.pekerjaanId, pekerjaanLayanan.id))
    .where(
      and(
        eq(pekerjaanLayanan.status, "selesai"),
        isNull(pekerjaanLayanan.pencairanJatuhTempoAt),
        or(isNull(keluhanLayanan.id), inArray(keluhanLayanan.status, ["ditolak", "selesai_ulang"])),
      ),
    )
    .orderBy(asc(pekerjaanLayanan.selesaiAt));
  for (const { job, order, item, keluhanStatus } of menunggu) {
    // With no Keluhan the trigger is the window closing; after a rejection or a redo it is the decision itself.
    if (keluhanStatus === null) {
      const ditunjukkan = ditunjukkanPadaOf(job);
      if (!ditunjukkan || ditunjukkan.getTime() >= batas.getTime()) continue;
    }
    const jatuhTempo = await deps.db.transaction(async (tx) => jadikanPencairanJatuhTempo(deps, tx, { job, order, item }, now));
    if (jatuhTempo) hasil.pencairanJatuhTempo += 1;
  }
  return hasil;
}
