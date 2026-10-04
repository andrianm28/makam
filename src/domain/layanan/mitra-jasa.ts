/**
 * The Mitra Jasa: Admin Platform's onboarding, their own profile, their status
 * and the jobs a status change takes off (spec, Layanan > Mitra Jasa; stories
 * 155, 159, 177, 182; ticket 55).
 *
 * One profile is keyed by the email the Undangan Staf was addressed to, which is
 * what ADR 0004 makes an Akun's key: whoever logs in with a Kode Masuk on that
 * email *is* the Mitra Jasa, whether or not they had ever signed in when Admin
 * Platform created the record. There is no second identity to keep in step.
 *
 * The bank account carries the one rule that may refuse it: the account name must
 * be the name on the KTP, or carry an override note saying why it is not (spec,
 * Profile). There is no NPWP field at all, so none can be demanded or stored.
 *
 * Status decides work, not access: Ditangguhkan and Berhenti take new jobs away
 * and nothing else. The Akun, its staff role, its history and its Pencairan stay
 * exactly as they were, because nothing here writes to identity (story 182).
 */
import { and, asc, eq, lt, or, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import type { Database } from "@/db/client";
import type { AuditAction, AuditSnapshot } from "@/domain/audit";
import { akunResource, semuaMitraJasaResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { LayananDeps } from "./deps";
import {
  berkasMitraJasaSchema,
  coverageMitraJasaSchema,
  profilMitraJasaSchema,
  rekeningMitraJasaSchema,
  statusMitraJasaSchema,
  tidakTersediaSchema,
} from "./mitra-jasa-skema";
import { nameKeyOf, reasonOf } from "./nama";
import {
  layananMitraJasa,
  layananMitraJasaLayanan,
  layananMitraJasaTidakTersedia,
  layananMitraJasaTpu,
  layananVarian,
  mitraJasaStatuses,
  type MitraJasaStatus,
} from "./schema";

/** How many Selesai jobs end the "Baru" badge (spec: a "Baru" badge until 5 Selesai). */
export const BARU_SAMPAI_SELESAI = 5;

type Row = typeof layananMitraJasa.$inferSelect;

/**
 * What the Mitra Jasa roster needs (onboard, read, cover, change the status): no order machinery, no files, so a caller that
 * only keeps the roster (the Data Contoh command, ticket 111) composes this much and no more. The job port is the one a
 * status change releases jobs through.
 */
export type MitraJasaDeps = Pick<LayananDeps, "db" | "clock" | "audit" | "pekerjaan">;

/** The job statuses the module needs to tell apart; the port words them (see `./deps.ts`). */
export type PekerjaanStatus = "dijadwalkan" | "ditugaskan" | "dikerjakan" | "selesai" | "dibatalkan";

/** One job a status change acted on, as Admin Platform sees it afterwards. */
export interface ReleasedJob {
  id: string;
  targetDate: string;
  status: PekerjaanStatus;
}

export interface MitraJasaRekening {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  /** Why the account name is not the KTP's; non-null exactly when it is not. */
  catatanOverride: string | null;
}

/** A Mitra Jasa as Admin Platform reads one: the whole record, bank account and NIK included. */
export interface MitraJasa {
  id: string;
  email: string;
  namaLengkap: string;
  nik: string;
  ktp: { ada: boolean };
  foto: { ada: boolean };
  area: string;
  perjanjian: { signedOn: string | null; scanUploaded: boolean };
  rekening: MitraJasaRekening | null;
  kontakSiaga: { name: string | null; phoneNumber: string | null };
  status: MitraJasaStatus;
  statusAlasan: string | null;
  statusDiubahPada: Date;
  /** Which DKI TPUs and which Layanan variants they cover. */
  coverage: { tpuDkiIds: string[]; layananVariantIds: string[] };
  /** How many jobs they have finished, and whether the "Baru" badge still shows. */
  selesai: number;
  baru: boolean;
  createdAt: Date;
  updatedAt: Date | null;
}

export interface RentangTidakTersedia {
  id: string;
  dari: string;
  sampai: string;
  alasan: string | null;
}

export type BuatMitraJasaResult =
  | { ok: true; mitraJasaId: string }
  | WriteRefusal
  | { ok: false; reason: "email_tidak_valid" | "mitra_jasa_tidak_valid" | "sudah_ada" };

/**
 * Admin Platform starts a Mitra Jasa's onboarding record: the profile and the
 * email the Undangan Staf is addressed to (the identity module sends the invite
 * and grants the role when that address next logs in with a Kode Masuk). The
 * record is `aktif` from the start and takes no work until it is complete, which
 * is what the Tier 4 onboarding row asks about. The NIK is unique, so the same
 * person cannot be entered twice under two addresses. Audited.
 */
export async function buatMitraJasa(
  deps: MitraJasaDeps,
  by: Actor,
  email: string,
  input: unknown,
): Promise<BuatMitraJasaResult> {
  const refusal = writeRefusal(by, "mitra_jasa.buat", semuaMitraJasaResource());
  if (refusal) return refusal;
  const address = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return { ok: false, reason: "email_tidak_valid" };
  const parsed = profilMitraJasaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "mitra_jasa_tidak_valid" };
  const profile = parsed.data;
  const now = deps.clock.now();

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [existing] = await tx
      .select({ id: layananMitraJasa.id })
      .from(layananMitraJasa)
      .where(or(eq(layananMitraJasa.email, address), eq(layananMitraJasa.nik, profile.nik)))
      .limit(1);
    if (existing) return { ok: false as const, reason: "sudah_ada" as const };
    const [created] = await tx
      .insert(layananMitraJasa)
      .values({
        email: address,
        namaLengkap: profile.namaLengkap,
        nik: profile.nik,
        area: profile.area,
        kontakSiagaNama: profile.kontakSiagaNama ?? null,
        kontakSiagaTelepon: profile.kontakSiagaTelepon ?? null,
        status: "aktif",
        statusDiubahPada: now,
        createdAt: now,
        createdByAccountId: by.accountId,
        updatedAt: now,
      })
      .returning({ id: layananMitraJasa.id });
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "mitra_jasa.buat",
      entity: { kind: "mitra_jasa", id: created.id },
      before: null,
      after: {
        email: address,
        namaLengkap: profile.namaLengkap,
        nik: tersamar(profile.nik),
        area: profile.area,
        status: "aktif",
        // An Operator who onboards their own email as a Mitra Jasa can then accept work the Operator
        // pays for (owner decision, 2026-09-28), so the Audit Log tells that from any other onboarding.
        onboardingSendiri: address === by.email.trim().toLowerCase(),
      },
      reason: null,
    });
    return { ok: true as const, mitraJasaId: created.id };
  });
}

export type WriteMitraJasaResult = WriteRefusal | { ok: true } | { ok: false; reason: "tidak_ditemukan" };

/** `ubahProfil`'s own refusals, on top of the shared write ones. */
export type UbahProfilResult = WriteMitraJasaResult | { ok: false; reason: "mitra_jasa_tidak_valid" };

/** `bacaMitraJasa`'s refusals, on top of the shared write ones. */
export type BacaMitraJasaResult = WriteRefusal | { ok: true; mitraJasa: MitraJasa } | { ok: false; reason: "tidak_ditemukan" };

/** Admin Platform records the profile (name, NIK, home area, emergency contact); audited with it before and after. */
export async function ubahProfil(
  deps: LayananDeps,
  by: Actor,
  mitraJasaId: string,
  input: unknown,
): Promise<UbahProfilResult> {
  const parsed = profilMitraJasaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "mitra_jasa_tidak_valid" };
  const profile = parsed.data;
  return tulisMitraJasa(deps, by, mitraJasaId, "mitra_jasa.ubah_profil", (row) => ({
    values: {
      namaLengkap: profile.namaLengkap,
      nik: profile.nik,
      area: profile.area,
      kontakSiagaNama: profile.kontakSiagaNama ?? null,
      kontakSiagaTelepon: profile.kontakSiagaTelepon ?? null,
    },
    ...profilAudit(row, profile),
  }));
}

/** What an Entri Audit may say about a NIK, a phone number or an account number: the last four digits, never the whole. */
function tersamar(value: string | null): string | null {
  return value ? `****${value.slice(-4)}` : null;
}

/**
 * The audit of a profile change: which fields changed, and only those, with the NIK
 * and the emergency-contact phone masked, so the Audit Log never holds either whole.
 */
function profilAudit(row: Row, profile: z.infer<typeof profilMitraJasaSchema>): { before: AuditSnapshot; after: AuditSnapshot } {
  const kontakNama = profile.kontakSiagaNama ?? null;
  const kontakTelepon = profile.kontakSiagaTelepon ?? null;
  const fields: [string, string | null, string | null][] = [
    ["namaLengkap", row.namaLengkap, profile.namaLengkap],
    ["nik", tersamar(row.nik), tersamar(profile.nik)],
    ["area", row.area, profile.area],
    ["kontakSiagaNama", row.kontakSiagaNama, kontakNama],
    ["kontakSiagaTelepon", tersamar(row.kontakSiagaTelepon), tersamar(kontakTelepon)],
  ];
  // NIK and phone compare on the real values, not on their masks.
  const real: Record<string, [string | null, string | null]> = {
    nik: [row.nik, profile.nik],
    kontakSiagaTelepon: [row.kontakSiagaTelepon, kontakTelepon],
  };
  const changed = fields.filter(([key, was, now]) => (real[key] ? real[key][0] !== real[key][1] : was !== now));
  return {
    before: { berubah: changed.map(([key]) => key), ...Object.fromEntries(changed.map(([key, was]) => [key, was])) },
    after: { berubah: changed.map(([key]) => key), ...Object.fromEntries(changed.map(([key, , now]) => [key, now])) },
  };
}

export type RekeningResult =
  | WriteMitraJasaResult
  | { ok: false; reason: "rekening_tidak_valid" | "nama_rekening_tidak_cocok" };

/**
 * Admin Platform sets the bank account Pencairan go to, with the rule the spec
 * puts on it: the account name must be the name on the KTP, or carry an override
 * note saying why it is not. The comparison is the catalog's own name folding
 * (case, spacing), so "budi santoso" at the bank and "Budi Santoso" on the KTP
 * match while a different person's name does not. Audited with the account before
 * and after, the note included.
 */
export async function ubahRekening(
  deps: LayananDeps,
  by: Actor,
  mitraJasaId: string,
  input: unknown,
): Promise<RekeningResult> {
  const parsed = rekeningMitraJasaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "rekening_tidak_valid" };
  const rekening = parsed.data;
  return tulisMitraJasa(deps, by, mitraJasaId, "mitra_jasa.ubah_rekening", (row) => {
    if (nameKeyOf(rekening.accountHolder) !== nameKeyOf(row.namaLengkap) && !rekening.catatanOverride) {
      return { ok: false as const, reason: "nama_rekening_tidak_cocok" as const };
    }
    const account = {
      bankName: rekening.bankName,
      accountNumber: rekening.accountNumber,
      accountHolder: rekening.accountHolder,
      catatanOverride: rekening.catatanOverride ?? null,
    };
    return {
      values: {
        bankName: account.bankName,
        bankAccountNumber: account.accountNumber,
        bankAccountHolder: account.accountHolder,
        catatanOverrideRekening: account.catatanOverride,
      },
      before: { rekening: rekeningAudit(rekeningOf(row)) },
      after: { rekening: rekeningAudit(account), berubah: rekeningBerubah(rekeningOf(row), account) },
    };
  });
}

export type BerkasResult = WriteMitraJasaResult | { ok: false; reason: "berkas_tidak_valid" | "berkas_kosong" | "penyimpanan_belum_tersedia" };

/**
 * Admin Platform uploads one of a Mitra Jasa's three files (the KTP photo, their
 * photo, the signed arrangement scan) or replaces it. The file lands in the
 * private FileStore, and only whether one is there is ever read back, never its
 * bytes. Audited with the file's kind, its signing date and the reason.
 */
export async function unggahBerkas(
  deps: LayananDeps,
  by: Actor,
  mitraJasaId: string,
  input: unknown,
): Promise<BerkasResult> {
  const parsed = berkasMitraJasaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "berkas_tidak_valid" };
  const { jenis, file, signedOn } = parsed.data;
  if (file.body.byteLength === 0) return { ok: false, reason: "berkas_kosong" };
  const key = `mitra-jasa/${mitraJasaId}/${jenis}`;
  try {
    await deps.files.put({ key, body: file.body, contentType: file.contentType });
  } catch {
    return { ok: false, reason: "penyimpanan_belum_tersedia" };
  }
  const values: Partial<Row> =
    jenis === "ktp"
      ? { ktpFileKey: key, ktpContentType: file.contentType }
      : jenis === "foto"
        ? { fotoFileKey: key, fotoContentType: file.contentType }
        : {
            perjanjianFileKey: key,
            perjanjianContentType: file.contentType,
            ...(signedOn ? { perjanjianTandaTanganPada: signedOn } : {}),
          };
  return tulisMitraJasa(deps, by, mitraJasaId, "mitra_jasa.unggah_berkas", (row) => ({
    values,
    before: { jenis, ada: berkasAda(row, jenis) },
    after: { jenis, ada: true, ...(signedOn ? { signedOn } : {}) },
    reason: reasonOf(parsed.data.reason),
  }));
}

export type CoverageResult = WriteMitraJasaResult | { ok: false; reason: "coverage_tidak_valid" | "varian_tidak_dikenal" };

/**
 * Admin Platform sets the coverage lists, both replaced whole. A Layanan variant
 * is checked against the catalog this module owns, because a variant no longer in
 * it is not a coverage choice; a DKI TPU is the Lokasi module's and is not
 * checked here, so an id it does not know simply covers nothing. Audited.
 */
export async function ubahCoverage(
  deps: MitraJasaDeps,
  by: Actor,
  mitraJasaId: string,
  input: unknown,
): Promise<CoverageResult> {
  const parsed = coverageMitraJasaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "coverage_tidak_valid" };
  const { tpuDkiIds, layananVariantIds } = parsed.data;
  const variants = [...new Set(layananVariantIds)];
  const tpus = [...new Set(tpuDkiIds)];
  return tulisMitraJasa(deps, by, mitraJasaId, "mitra_jasa.ubah_profil", async (row, tx) => {
    // Every statement here runs on the transaction `tulisMitraJasa` opened, never on `db`:
    // a second connection inside a transaction is how a write ends up waiting for itself.
    const known = variants.length
      ? await txSelect(tx, sql`${layananVarian.id} in ${variants}`)
      : [];
    if (known.length !== variants.length) return { ok: false as const, reason: "varian_tidak_dikenal" as const };
    const before = await coverageOf(tx, row.id);
    await tx.delete(layananMitraJasaTpu).where(eq(layananMitraJasaTpu.mitraJasaId, row.id));
    await tx.delete(layananMitraJasaLayanan).where(eq(layananMitraJasaLayanan.mitraJasaId, row.id));
    if (tpus.length > 0)
      await tx.insert(layananMitraJasaTpu).values(tpus.map((tpuDkiId) => ({ mitraJasaId: row.id, tpuDkiId })));
    if (variants.length > 0)
      await tx.insert(layananMitraJasaLayanan).values(variants.map((layananVariantId) => ({ mitraJasaId: row.id, layananVariantId })));
    return {
      values: {},
      before: { coverage: before },
      after: { coverage: { tpuDkiIds: tpus, layananVariantIds: variants } },
    };
  });
}

/** The Layanan variants of a list that are in the catalog this module owns. */
async function txSelect(tx: Database, where: SQL): Promise<{ id: string }[]> {
  return tx.select({ id: layananVarian.id }).from(layananVarian).where(where);
}

export type UbahStatusResult =
  | {
      ok: true;
      /** The `dijadwalkan` jobs taken off, so nobody works for a payment that will not come. */
      dilepas: ReleasedJob[];
      /** The in-progress jobs left alone, for Admin Platform to reassign. */
      berjalan: ReleasedJob[];
    }
  | WriteRefusal
  | { ok: false; reason: "tidak_ditemukan" | "status_tidak_valid" | "alasan_wajib" | "status_sama" | "pekerjaan_tidak_dilepas" };

/**
 * Admin Platform sets a Mitra Jasa's status, with a reason for a suspension or an
 * ending. Audited.
 *
 * Suspending or ending takes the work off them: every job still `dijadwalkan` is
 * released **in the same transaction** as the status (through the job port's
 * `within(tx)`), so no Mitra Jasa can hold a job nobody is going to pay for, and
 * a release that fails leaves the status as it was. Jobs already in progress are
 * not taken away — that is the family's work in the ground — so they are returned
 * for Admin Platform to reassign; the Pemesan is only told when a target date
 * actually moves, which is the reassignment's own message (ticket 56). Reinstating
 * to `aktif` touches no job.
 */
export async function ubahStatus(
  deps: MitraJasaDeps,
  by: Actor,
  mitraJasaId: string,
  input: unknown,
): Promise<UbahStatusResult> {
  const refusal = writeRefusal(by, "mitra_jasa.ubah", { kind: "mitra_jasa", id: mitraJasaId });
  if (refusal) return refusal;
  const parsed = statusMitraJasaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "status_tidak_valid" };
  const { status } = parsed.data;
  const alasan = parsed.data.alasan ?? null;
  if (status !== "aktif" && !alasan) return { ok: false, reason: "alasan_wajib" };
  const now = deps.clock.now();

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [row] = await tx.select().from(layananMitraJasa).where(eq(layananMitraJasa.id, mitraJasaId)).for("update");
    if (!row) return { ok: false as const, reason: "tidak_ditemukan" as const };
    if (row.status === status) return { ok: false as const, reason: "status_sama" as const };

    const jobs = status === "aktif" ? [] : await deps.pekerjaan.daftarPekerjaan(mitraJasaId);
    const dilepas = jobs.filter((job) => job.status === "dijadwalkan");
    const berjalan = jobs.filter((job) => job.status === "ditugaskan" || job.status === "dikerjakan");
    const port = deps.pekerjaan.within(tx);
    for (const job of dilepas) {
      const released = await port.lepasPekerjaan({ pekerjaanId: job.id, alasan: `Mitra Jasa ${status}: ${alasan}` });
      if (!released.ok) return { ok: false as const, reason: "pekerjaan_tidak_dilepas" as const };
    }

    await tx
      .update(layananMitraJasa)
      .set({ status, statusAlasan: alasan, statusDiubahPada: now, updatedAt: now })
      .where(eq(layananMitraJasa.id, mitraJasaId));
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "mitra_jasa.ubah_status",
      entity: { kind: "mitra_jasa", id: mitraJasaId },
      before: { status: row.status, statusAlasan: row.statusAlasan },
      after: {
        status,
        statusAlasan: alasan,
        pekerjaanDilepas: dilepas.map((job) => job.id),
        pekerjaanBerjalan: berjalan.map((job) => job.id),
      },
      reason: alasan,
    });
    return { ok: true as const, dilepas: dilepas.map(releasedJobOf), berjalan: berjalan.map(releasedJobOf) };
  });
}

function releasedJobOf(job: { id: string; targetDate: string; status: PekerjaanStatus }): ReleasedJob {
  return { id: job.id, targetDate: job.targetDate, status: job.status };
}

export type TidakTersediaResult =
  | { ok: true }
  | { ok: true; range: RentangTidakTersedia }
  | WriteRefusal
  | { ok: false; reason: "tidak_ditemukan" | "tidak_tersedia_tidak_valid" | "sudah_tidak_tersedia" };

/**
 * A Mitra Jasa sets one of their own "Tidak tersedia" ranges; the assignment
 * picker (ticket 56) leaves them out for those dates. A range may not overlap
 * another of theirs, so the list says one thing. Any status may set one: someone
 * who is away while Ditangguhkan is still away, and a range outlives a suspension
 * because it is their own calendar, not the Operator's judgement. Audited, since
 * it decides who gets work.
 */
export async function tambahTidakTersedia(deps: LayananDeps, by: Actor, input: unknown): Promise<TidakTersediaResult> {
  const refusal = writeRefusal(by, "mitra_jasa.tidak_tersedia", akunResource(by.accountId));
  if (refusal) return refusal;
  const parsed = tidakTersediaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "tidak_tersedia_tidak_valid" };
  const profile = await profileOfActor(deps, by);
  if (!profile) return { ok: false, reason: "tidak_ditemukan" };
  const { dari, sampai } = parsed.data;
  if (dari > sampai) return { ok: false, reason: "tidak_tersedia_tidak_valid" };
  const alasan = parsed.data.alasan ?? null;
  const now = deps.clock.now();

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const overlapping = await tx
      .select({ id: layananMitraJasaTidakTersedia.id })
      .from(layananMitraJasaTidakTersedia)
      .where(
        and(
          eq(layananMitraJasaTidakTersedia.mitraJasaId, profile.id),
          lt(layananMitraJasaTidakTersedia.dari, sampai),
          sql`${layananMitraJasaTidakTersedia.sampai} >= ${dari}`,
        ),
      )
      .limit(1);
    if (overlapping.length > 0) return { ok: false as const, reason: "sudah_tidak_tersedia" as const };
    const [created] = await tx
      .insert(layananMitraJasaTidakTersedia)
      .values({ mitraJasaId: profile.id, dari, sampai, alasan, dibuatPada: now })
      .returning();
    await record({
      actor: { accountId: by.accountId, role: "mitra_jasa" },
      action: "mitra_jasa.atur_tidak_tersedia",
      entity: { kind: "mitra_jasa", id: profile.id },
      before: null,
      after: { dari, sampai, alasan },
      reason: alasan,
    });
    return { ok: true as const, range: { id: created.id, dari, sampai, alasan } };
  });
}

/** A Mitra Jasa takes one of their own ranges off; audited. */
export async function hapusTidakTersedia(deps: LayananDeps, by: Actor, rangeId: string): Promise<TidakTersediaResult> {
  const refusal = writeRefusal(by, "mitra_jasa.tidak_tersedia", akunResource(by.accountId));
  if (refusal) return refusal;
  const profile = await profileOfActor(deps, by);
  if (!profile) return { ok: false, reason: "tidak_ditemukan" };
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [row] = await tx
      .select()
      .from(layananMitraJasaTidakTersedia)
      .where(and(eq(layananMitraJasaTidakTersedia.id, rangeId), eq(layananMitraJasaTidakTersedia.mitraJasaId, profile.id)))
      .for("update");
    if (!row) return { ok: false as const, reason: "tidak_ditemukan" as const };
    await tx.delete(layananMitraJasaTidakTersedia).where(eq(layananMitraJasaTidakTersedia.id, rangeId));
    await record({
      actor: { accountId: by.accountId, role: "mitra_jasa" },
      action: "mitra_jasa.atur_tidak_tersedia",
      entity: { kind: "mitra_jasa", id: profile.id },
      before: { dari: row.dari, sampai: row.sampai, alasan: row.alasan },
      after: null,
      reason: row.alasan,
    });
    return { ok: true as const };
  });
}

/** One Mitra Jasa's own ranges, soonest first; empty for anyone who is not a Mitra Jasa. */
export async function rentangTidakTersedia(deps: LayananDeps, by: Actor): Promise<RentangTidakTersedia[]> {
  if (writeRefusal(by, "mitra_jasa.tidak_tersedia", akunResource(by.accountId))) return [];
  const profile = await profileOfActor(deps, by);
  if (!profile) return [];
  return deps.db
    .select({
      id: layananMitraJasaTidakTersedia.id,
      dari: layananMitraJasaTidakTersedia.dari,
      sampai: layananMitraJasaTidakTersedia.sampai,
      alasan: layananMitraJasaTidakTersedia.alasan,
    })
    .from(layananMitraJasaTidakTersedia)
    .where(eq(layananMitraJasaTidakTersedia.mitraJasaId, profile.id))
    .orderBy(asc(layananMitraJasaTidakTersedia.dari), asc(layananMitraJasaTidakTersedia.id));
}

/** Whether one Mitra Jasa takes no work on one date: any of their ranges covers it. */
export async function tidakTersediaPada(deps: LayananDeps, mitraJasaId: string, tanggalTarget: string): Promise<boolean> {
  const [row] = await deps.db
    .select({ id: layananMitraJasaTidakTersedia.id })
    .from(layananMitraJasaTidakTersedia)
    .where(
      and(
        eq(layananMitraJasaTidakTersedia.mitraJasaId, mitraJasaId),
        sql`${layananMitraJasaTidakTersedia.dari} <= ${tanggalTarget}`,
        sql`${layananMitraJasaTidakTersedia.sampai} >= ${tanggalTarget}`,
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * The Mitra Jasa this signed-in Akun is, found by its Email Terverifikasi (ADR
 * 0004), or null when that address is none. The one answer to that question, and
 * every feature that asks it asks here: an Akun may hold many roles (spec:342),
 * so an Operator's own email may be onboarded as a Mitra Jasa, and that one Akun
 * is then one Mitra Jasa however many ways it looks — settled by the owner on
 * 2026-09-28 (`00-index.md`), not left to this lookup to decide.
 *
 * Holding both roles loosens nothing: the strictest rule still applies to the
 * whole account, whatever other roles it holds (spec:344) — 12 h from
 * `sessionLengthMs`, which asks the roles and not this lookup, and TOTP from
 * `authorize`'s `needsTotp`. Which *features* it may reach is a separate
 * question, and `authorize` is where it is answered: `mitra_jasa.lihat_saya` and
 * `mitra_jasa.tidak_tersedia` take the Akun's own resource and require the
 * `mitra_jasa` role, so an address with no record and a role with no record are
 * both refused, clearly and in one place.
 *
 * The same decision asks the Audit Log to tell an Operator onboarding themselves
 * from an ordinary Mitra Jasa onboarding, since that Operator can then accept work
 * the Operator pays for. `buatMitraJasa` marks it on the Entri Audit
 * (`onboardingSendiri`), next to who onboarded.
 */
export async function profileOfActor(
  deps: LayananDeps,
  by: Actor,
): Promise<{ id: string; email: string; status: MitraJasaStatus } | null> {
  const [row] = await deps.db
    .select({ id: layananMitraJasa.id, email: layananMitraJasa.email, status: layananMitraJasa.status })
    .from(layananMitraJasa)
    .where(eq(layananMitraJasa.email, by.email.toLowerCase()))
    .limit(1);
  return row ?? null;
}

/** The nine steps a Mitra Jasa must have before they take work, as the profile page and the Tier 4 row read them. */
export const LANGKAH_ONBOARDING = [
  "namaLengkap",
  "nik",
  "area",
  "ktp",
  "foto",
  "perjanjian",
  "rekening",
  "coverageTpu",
  "coverageLayanan",
] as const;
export type LangkahOnboarding = (typeof LANGKAH_ONBOARDING)[number];

/** Which of the nine steps one Mitra Jasa still owes. */
export function langkahBelumLengkap(mitraJasa: MitraJasa): LangkahOnboarding[] {
  const belum: LangkahOnboarding[] = [];
  if (!mitraJasa.namaLengkap) belum.push("namaLengkap");
  if (!/^[0-9]{16}$/.test(mitraJasa.nik)) belum.push("nik");
  if (!mitraJasa.area) belum.push("area");
  if (!mitraJasa.ktp.ada) belum.push("ktp");
  if (!mitraJasa.foto.ada) belum.push("foto");
  if (!mitraJasa.perjanjian.scanUploaded) belum.push("perjanjian");
  if (!mitraJasa.rekening) belum.push("rekening");
  if (mitraJasa.coverage.tpuDkiIds.length === 0) belum.push("coverageTpu");
  if (mitraJasa.coverage.layananVariantIds.length === 0) belum.push("coverageLayanan");
  return belum;
}

/** One Mitra Jasa still to onboard, as the Tier 4 "Mitra Jasa onboarding" row reads it. */
export interface MitraJasaBelumLengkap {
  id: string;
  namaLengkap: string;
  email: string;
  /** Which of the nine steps are still missing, in the order the profile page lists them. */
  belum: LangkahOnboarding[];
}

/**
 * Every Mitra Jasa whose onboarding is not complete, oldest first (Admin Platform
 * only). This is the Tier 4 "Mitra Jasa onboarding" row's query: a record is
 * complete when all nine steps are filled, whatever its status — a suspended one
 * whose paperwork is finished owes nothing.
 */
export async function mitraJasaBelumLengkap(deps: LayananDeps, by: Actor): Promise<MitraJasaBelumLengkap[]> {
  if (writeRefusal(by, "mitra_jasa.lihat_semua", semuaMitraJasaResource())) return [];
  const rows = await deps.db
    .select()
    .from(layananMitraJasa)
    .orderBy(asc(layananMitraJasa.createdAt), asc(layananMitraJasa.id));
  const belum: MitraJasaBelumLengkap[] = [];
  for (const row of rows) {
    const langkah = langkahBelumLengkap(await keMitraJasa(deps, row));
    if (langkah.length > 0) belum.push({ id: row.id, namaLengkap: row.namaLengkap, email: row.email, belum: langkah });
  }
  return belum;
}

/** One Mitra Jasa, for Admin Platform; refused for anyone else, and empty when there is none. */
export async function bacaMitraJasa(
  deps: MitraJasaDeps,
  by: Actor,
  mitraJasaId: string,
): Promise<BacaMitraJasaResult> {
  const refusal = writeRefusal(by, "mitra_jasa.lihat", { kind: "mitra_jasa", id: mitraJasaId });
  if (refusal) return refusal;
  const [row] = await deps.db.select().from(layananMitraJasa).where(eq(layananMitraJasa.id, mitraJasaId));
  if (!row) return { ok: false, reason: "tidak_ditemukan" };
  return { ok: true, mitraJasa: await keMitraJasa(deps, row) };
}

/** Every Mitra Jasa, by name, for Admin Platform; empty for anyone else. */
export async function semuaMitraJasa(deps: MitraJasaDeps, by: Actor): Promise<MitraJasa[]> {
  if (writeRefusal(by, "mitra_jasa.lihat_semua", semuaMitraJasaResource())) return [];
  const rows = await deps.db
    .select()
    .from(layananMitraJasa)
    .orderBy(asc(layananMitraJasa.namaLengkap), asc(layananMitraJasa.id));
  return Promise.all(rows.map((row) => keMitraJasa(deps, row)));
}

/** How many Mitra Jasa are in each status (the Admin Platform list's filter strip); all zero for anyone else. */
export async function mitraJasaCountByStatus(
  deps: LayananDeps,
  by: Actor,
): Promise<Record<MitraJasaStatus, number>> {
  const counts = Object.fromEntries(mitraJasaStatuses.map((status) => [status, 0])) as Record<MitraJasaStatus, number>;
  if (writeRefusal(by, "mitra_jasa.lihat_semua", semuaMitraJasaResource())) return counts;
  const rows = await deps.db
    .select({ status: layananMitraJasa.status, total: sql<number>`count(*)::int` })
    .from(layananMitraJasa)
    .groupBy(layananMitraJasa.status);
  for (const row of rows) counts[row.status] = row.total;
  return counts;
}

/** One Mitra Jasa as its table row plus its coverage, its finished count and the "Baru" badge. */
export async function keMitraJasa(deps: MitraJasaDeps, row: Row): Promise<MitraJasa> {
  const [coverage, pekerjaan] = await Promise.all([coverageOf(deps.db, row.id), deps.pekerjaan.daftarPekerjaan(row.id)]);
  const selesai = pekerjaan.filter((job) => job.status === "selesai").length;
  return {
    id: row.id,
    email: row.email,
    namaLengkap: row.namaLengkap,
    nik: row.nik,
    ktp: { ada: row.ktpFileKey !== null },
    foto: { ada: row.fotoFileKey !== null },
    area: row.area,
    perjanjian: { signedOn: row.perjanjianTandaTanganPada, scanUploaded: row.perjanjianFileKey !== null },
    rekening: rekeningOf(row),
    kontakSiaga: { name: row.kontakSiagaNama, phoneNumber: row.kontakSiagaTelepon },
    status: row.status,
    statusAlasan: row.statusAlasan,
    statusDiubahPada: row.statusDiubahPada,
    coverage,
    selesai,
    baru: selesai < BARU_SAMPAI_SELESAI,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** One Mitra Jasa's coverage lists, each sorted so the same profile always reads the same. */
export async function coverageOf(db: Database, mitraJasaId: string): Promise<{ tpuDkiIds: string[]; layananVariantIds: string[] }> {
  const [tpu, layanan] = await Promise.all([
    db
      .select({ tpuDkiId: layananMitraJasaTpu.tpuDkiId })
      .from(layananMitraJasaTpu)
      .where(eq(layananMitraJasaTpu.mitraJasaId, mitraJasaId))
      .orderBy(asc(layananMitraJasaTpu.tpuDkiId)),
    db
      .select({ layananVariantId: layananMitraJasaLayanan.layananVariantId })
      .from(layananMitraJasaLayanan)
      .where(eq(layananMitraJasaLayanan.mitraJasaId, mitraJasaId))
      .orderBy(asc(layananMitraJasaLayanan.layananVariantId)),
  ]);
  return { tpuDkiIds: tpu.map((row) => row.tpuDkiId), layananVariantIds: layanan.map((row) => row.layananVariantId) };
}

/** An account as an Entri Audit shows it: the bank, the last four digits and the override note, never the number whole nor the holder. */
function rekeningAudit(rekening: MitraJasaRekening | null): AuditSnapshot | null {
  return rekening
    ? { bankName: rekening.bankName, accountNumber: tersamar(rekening.accountNumber), catatanOverride: rekening.catatanOverride }
    : null;
}

function rekeningBerubah(was: MitraJasaRekening | null, now: MitraJasaRekening): string[] {
  const keys = ["bankName", "accountNumber", "accountHolder", "catatanOverride"] as const;
  return keys.filter((key) => was?.[key] !== now[key]);
}

function rekeningOf(row: Row): MitraJasaRekening | null {
  if (!row.bankName || !row.bankAccountNumber || !row.bankAccountHolder) return null;
  return {
    bankName: row.bankName,
    accountNumber: row.bankAccountNumber,
    accountHolder: row.bankAccountHolder,
    catatanOverride: row.catatanOverrideRekening,
  };
}

function berkasAda(row: Row, jenis: "ktp" | "foto" | "perjanjian"): boolean {
  return jenis === "ktp" ? row.ktpFileKey !== null : jenis === "foto" ? row.fotoFileKey !== null : row.perjanjianFileKey !== null;
}

/** What a staff write on a Mitra Jasa's record changes, and what its Entri Audit shows. */
interface PerubahanMitraJasa {
  values: Partial<Row>;
  before: AuditSnapshot;
  after: AuditSnapshot;
  reason?: string | null;
}

/**
 * One staff write on a Mitra Jasa's record: authorised (`mitra_jasa.ubah`, so
 * Admin Platform only), locked, changed and audited in one transaction. `change`
 * runs only once the actor is authorised and the row exists, and is handed the
 * transaction so it never opens a second one; it may refuse (e.g. an account name
 * that does not match the KTP) and then nothing is written.
 */
async function tulisMitraJasa<Changed extends PerubahanMitraJasa | { ok: false; reason: string }>(
  deps: MitraJasaDeps,
  by: Actor,
  mitraJasaId: string,
  action: AuditAction,
  change: (row: Row, tx: Database) => Changed | Promise<Changed>,
): Promise<WriteMitraJasaResult | Extract<Changed, { ok: false }>> {
  const refusal = writeRefusal(by, "mitra_jasa.ubah", { kind: "mitra_jasa", id: mitraJasaId });
  if (refusal) return refusal;
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [row] = await tx.select().from(layananMitraJasa).where(eq(layananMitraJasa.id, mitraJasaId)).for("update");
    if (!row) return { ok: false as const, reason: "tidak_ditemukan" as const };
    const changed = await change(row, tx);
    if ("ok" in changed) return changed as Extract<Changed, { ok: false }>;
    if (Object.keys(changed.values).length > 0)
      await tx.update(layananMitraJasa).set({ ...changed.values, updatedAt: deps.clock.now() }).where(eq(layananMitraJasa.id, mitraJasaId));
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action,
      entity: { kind: "mitra_jasa", id: mitraJasaId },
      before: changed.before,
      after: changed.after,
      reason: changed.reason ?? null,
    });
    return { ok: true as const };
  });
}

/** The account resource a Mitra Jasa's own read and write act on: their own Akun, so no other profile can be named. */
export function akunMitraJasaResource(by: Actor) {
  return akunResource(by.accountId);
}
