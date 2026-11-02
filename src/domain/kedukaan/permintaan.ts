/**
 * Permintaan Kedukaan (ADR 0010): the family files one request, follows it and may cancel it
 * while it waits for the first contact; Admin Platform moves it on. Every status entering the
 * timeline is told to the family by email in the same transaction.
 */
import { randomInt, randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { kedukaanResource, normalisePhoneNumber, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { addWorkingDays } from "@/domain/lokasi";
import { addWibDays, yearInJakarta } from "@/lib/time/jakarta";
import type { KedukaanDeps } from "./deps";
import { kedukaanPermintaan, kedukaanRiwayat } from "./schema";
import {
  labelJenisKedukaan,
  labelStatusKedukaan,
  permintaanKedukaanSchema,
  transisiStafKedukaan,
  urgensiKedukaan,
  type JenisKedukaan,
  type RincianKedukaan,
  type StatusKedukaan,
} from "./skema";

/** Who files: the Akun behind the session and its Email Terverifikasi, where every change is told. */
export interface Peminta {
  accountId: string;
  email: string;
}

export type AjukanKedukaanResult =
  | { ok: true; permintaanId: string; nomor: string }
  | { ok: false; reason: "input_tidak_valid" | "nomor_telepon_tidak_valid" };

export interface PermintaanKedukaan {
  id: string;
  nomor: string;
  jenis: JenisKedukaan;
  nama: string;
  telepon: string;
  email: string;
  kabKota: string;
  rincian: RincianKedukaan;
  catatan: string;
  status: StatusKedukaan;
  alasan: string | null;
  diajukanPada: Date;
  /** First contact is due by this time while it is Diajukan; null once it has moved on. */
  tenggatPada: Date | null;
  riwayat: { status: StatusKedukaan; pada: Date; catatan: string | null }[];
}

export type BatalkanKedukaanSayaResult = { ok: true } | { ok: false; reason: "tidak_ditemukan" | "tidak_bisa_dibatalkan" };

export interface PindahStatusKedukaanInput {
  status: StatusKedukaan;
  /** Required to cancel; otherwise an optional note to the family. */
  catatan: string | null;
}

export type PindahStatusKedukaanResult =
  | { ok: true }
  | WriteRefusal
  | { ok: false; reason: "tidak_ditemukan" | "transisi_tidak_boleh" | "alasan_wajib" };

type Row = typeof kedukaanPermintaan.$inferSelect;

async function nomorBaru(db: Database, now: Date): Promise<string> {
  for (let coba = 0; coba < 10; coba++) {
    const nomor = `KDK-${yearInJakarta(now)}-${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
    const [ada] = await db.select({ id: kedukaanPermintaan.id }).from(kedukaanPermintaan).where(eq(kedukaanPermintaan.nomor, nomor));
    if (!ada) return nomor;
  }
  throw new Error("no free Nomor Permintaan Kedukaan after 10 tries");
}

async function tenggatKontakPertama(deps: KedukaanDeps, jenis: JenisKedukaan, now: Date): Promise<Date> {
  const { kontakPertama } = urgensiKedukaan[jenis];
  if ("menit" in kontakPertama) return new Date(now.getTime() + kontakPertama.menit * 60_000);
  const hasil = addWorkingDays(await deps.lokasi.adminPlatformCalendar(), now, kontakPertama.hariKerja);
  return hasil.ok ? hasil.at : addWibDays(now, kontakPertama.hariKerja);
}

async function catatStatus(
  deps: KedukaanDeps,
  tx: Database,
  row: Pick<Row, "id" | "nomor" | "email" | "jenis">,
  status: StatusKedukaan,
  oleh: string | null,
  catatan: string | null,
  now: Date,
): Promise<void> {
  const perubahanId = randomUUID();
  await tx.insert(kedukaanRiwayat).values({ id: perubahanId, permintaanId: row.id, status, pada: now, olehAccountId: oleh, catatan });
  await deps.notifikasi.kedukaanStatusBerubah(
    { perubahanId, nomor: row.nomor, email: row.email, labelJenis: labelJenisKedukaan[row.jenis], labelStatus: labelStatusKedukaan[status], catatan },
    tx,
  );
}

export async function ajukanKedukaan(deps: KedukaanDeps, peminta: Peminta, raw: unknown): Promise<AjukanKedukaanResult> {
  const parsed = permintaanKedukaanSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;
  const telepon = normalisePhoneNumber(input.telepon);
  if (!telepon.ok) return { ok: false, reason: "nomor_telepon_tidak_valid" };

  const now = deps.clock.now();
  const id = randomUUID();
  const nomor = await nomorBaru(deps.db, now);
  const tenggatPada = await tenggatKontakPertama(deps, input.jenis, now);
  await deps.db.transaction(async (tx) => {
    await tx.insert(kedukaanPermintaan).values({
      id,
      nomor,
      accountId: peminta.accountId,
      email: peminta.email,
      jenis: input.jenis,
      nama: input.nama,
      telepon: telepon.phoneNumber,
      kabKota: input.kabKota,
      rincian: input.rincian,
      catatan: input.catatan,
      status: "diajukan",
      alasan: null,
      diajukanPada: now,
      tenggatPada,
      diubahPada: now,
    });
    await catatStatus(deps, tx, { id, nomor, email: peminta.email, jenis: input.jenis }, "diajukan", peminta.accountId, null, now);
  });
  return { ok: true, permintaanId: id, nomor };
}

async function denganRiwayat(db: Database, rows: Row[]): Promise<PermintaanKedukaan[]> {
  const hasil: PermintaanKedukaan[] = [];
  for (const row of rows) {
    const riwayat = await db
      .select({ status: kedukaanRiwayat.status, pada: kedukaanRiwayat.pada, catatan: kedukaanRiwayat.catatan })
      .from(kedukaanRiwayat)
      .where(eq(kedukaanRiwayat.permintaanId, row.id))
      .orderBy(asc(kedukaanRiwayat.pada));
    hasil.push({
      id: row.id,
      nomor: row.nomor,
      jenis: row.jenis,
      nama: row.nama,
      telepon: row.telepon,
      email: row.email,
      kabKota: row.kabKota,
      rincian: row.rincian,
      catatan: row.catatan,
      status: row.status,
      alasan: row.alasan,
      diajukanPada: row.diajukanPada,
      tenggatPada: row.tenggatPada,
      riwayat,
    });
  }
  return hasil;
}

/** The family's own Permintaan Kedukaan, newest first (Akun Saya). */
export async function permintaanKedukaanSaya(deps: KedukaanDeps, accountId: string): Promise<PermintaanKedukaan[]> {
  const rows = await deps.db
    .select()
    .from(kedukaanPermintaan)
    .where(eq(kedukaanPermintaan.accountId, accountId))
    .orderBy(desc(kedukaanPermintaan.diajukanPada));
  return denganRiwayat(deps.db, rows);
}

/** The family cancels its own Permintaan, only while it still waits for the first contact. */
export async function batalkanKedukaanSaya(deps: KedukaanDeps, accountId: string, permintaanId: string): Promise<BatalkanKedukaanSayaResult> {
  const now = deps.clock.now();
  return deps.db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(kedukaanPermintaan)
      .where(and(eq(kedukaanPermintaan.id, permintaanId), eq(kedukaanPermintaan.accountId, accountId)))
      .for("update");
    if (!row) return { ok: false as const, reason: "tidak_ditemukan" as const };
    if (row.status !== "diajukan") return { ok: false as const, reason: "tidak_bisa_dibatalkan" as const };
    await tx
      .update(kedukaanPermintaan)
      .set({ status: "dibatalkan", alasan: "Dibatalkan oleh keluarga", tenggatPada: null, diubahPada: now })
      .where(eq(kedukaanPermintaan.id, row.id));
    await catatStatus(deps, tx, row, "dibatalkan", accountId, null, now);
    return { ok: true as const };
  });
}

/** Every Permintaan Kedukaan for Admin Platform, newest first; empty for anyone else. */
export async function semuaPermintaanKedukaan(deps: KedukaanDeps, by: Actor): Promise<PermintaanKedukaan[]> {
  if (writeRefusal(by, "kedukaan.kelola", kedukaanResource())) return [];
  const rows = await deps.db.select().from(kedukaanPermintaan).orderBy(desc(kedukaanPermintaan.diajukanPada));
  return denganRiwayat(deps.db, rows);
}

const idSah = (id: string) => z.uuid().safeParse(id).success;

/** One Permintaan Kedukaan for Admin Platform, or null (also for anyone else). */
export async function permintaanKedukaan(deps: KedukaanDeps, by: Actor, permintaanId: string): Promise<PermintaanKedukaan | null> {
  if (writeRefusal(by, "kedukaan.kelola", kedukaanResource())) return null;
  if (!idSah(permintaanId)) return null;
  const rows = await deps.db.select().from(kedukaanPermintaan).where(eq(kedukaanPermintaan.id, permintaanId));
  return (await denganRiwayat(deps.db, rows))[0] ?? null;
}

/** Admin Platform moves a Permintaan on: Dihubungi, Selesai, or Dibatalkan with a reason. Audited, and told to the family. */
export async function pindahStatusKedukaan(
  deps: KedukaanDeps,
  by: Actor,
  permintaanId: string,
  input: PindahStatusKedukaanInput,
): Promise<PindahStatusKedukaanResult> {
  const refusal = writeRefusal(by, "kedukaan.kelola", kedukaanResource());
  if (refusal) return refusal;
  if (!idSah(permintaanId)) return { ok: false, reason: "tidak_ditemukan" };
  const catatan = input.catatan?.trim().slice(0, 1000) || null;
  if (input.status === "dibatalkan" && !catatan) return { ok: false, reason: "alasan_wajib" };
  const now = deps.clock.now();

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [row] = await tx.select().from(kedukaanPermintaan).where(eq(kedukaanPermintaan.id, permintaanId)).for("update");
    if (!row) return { ok: false as const, reason: "tidak_ditemukan" as const };
    if (!transisiStafKedukaan[row.status].includes(input.status)) return { ok: false as const, reason: "transisi_tidak_boleh" as const };
    await tx
      .update(kedukaanPermintaan)
      .set({
        status: input.status,
        alasan: input.status === "dibatalkan" ? catatan : row.alasan,
        // Any move is past the first contact: the Antrean row closes.
        tenggatPada: null,
        diubahPada: now,
      })
      .where(eq(kedukaanPermintaan.id, row.id));
    await catatStatus(deps, tx, row, input.status, by.accountId, catatan, now);
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "kedukaan.pindah_status",
      entity: { kind: "permintaan_kedukaan", id: row.id },
      before: { status: row.status },
      after: { status: input.status },
      reason: input.status === "dibatalkan" ? catatan : null,
    });
    return { ok: true as const };
  });
}

/** One open Permintaan waiting for its first contact, for the Antrean. */
export interface PermintaanKedukaanTerbuka {
  id: string;
  nomor: string;
  jenis: JenisKedukaan;
  nama: string;
  kabKota: string;
  diajukanPada: Date;
  tenggatPada: Date;
}

/** Every Diajukan Permintaan Kedukaan with its first-contact deadline, soonest first (the Antrean's projection). */
export async function permintaanKedukaanTerbuka(deps: Pick<KedukaanDeps, "db">): Promise<PermintaanKedukaanTerbuka[]> {
  const rows = await deps.db
    .select({
      id: kedukaanPermintaan.id,
      nomor: kedukaanPermintaan.nomor,
      jenis: kedukaanPermintaan.jenis,
      nama: kedukaanPermintaan.nama,
      kabKota: kedukaanPermintaan.kabKota,
      diajukanPada: kedukaanPermintaan.diajukanPada,
      tenggatPada: kedukaanPermintaan.tenggatPada,
    })
    .from(kedukaanPermintaan)
    .where(and(eq(kedukaanPermintaan.status, "diajukan"), isNotNull(kedukaanPermintaan.tenggatPada)))
    .orderBy(asc(kedukaanPermintaan.tenggatPada));
  return rows.map((row) => ({ ...row, tenggatPada: row.tenggatPada! }));
}
