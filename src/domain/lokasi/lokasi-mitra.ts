import { asc, count, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { AuditAction, AuditLog, AuditSnapshot } from "@/domain/audit";
import {
  lokasiMitraResource,
  semuaLokasiMitraResource,
  writeRefusal,
  type Action,
  type Actor,
  type WriteRefusal,
} from "@/domain/identity";
import type { Clock } from "@/ports/clock";
import {
  DEFAULT_FLAGS,
  DEFAULT_POLICIES,
  lokasiFlagsSchema,
  lokasiPoliciesSchema,
  type LokasiFlags,
  type LokasiPolicies,
} from "./policies";
import { lokasiProfileSchema, type LokasiFacility, type LokasiProfileInput } from "./profile";
import { lokasiMitra as lokasiMitraTable, lokasiMitraStatuses } from "./schema";

export type LokasiMitraStatus = (typeof lokasiMitraStatuses)[number];

/**
 * The document checklist a new Lokasi Mitra starts with (spec, Lokasi): the
 * death certificate from the RS / Puskesmas, the death report letter from the
 * Lurah or RT/RW, and the KTP + KK of the Almarhum and of the Pemesan.
 */
export const DEFAULT_DOCUMENT_CHECKLIST: readonly string[] = [
  "Surat keterangan kematian dari RS / Puskesmas",
  "Surat pengantar / laporan kematian dari Lurah atau RT/RW",
  "KTP dan KK Almarhum",
  "KTP dan KK Pemesan",
];

/** A Lokasi Mitra's onboarding record, as the Lokasi module hands it out. */
export interface LokasiMitra {
  id: string;
  name: string;
  pengelolaName: string;
  address: string;
  city: string;
  pin: { lat: number; lng: number } | null;
  facilities: { checked: LokasiFacility[]; note: string };
  status: LokasiMitraStatus;
  agreement: { signedOn: string | null; scanUploaded: boolean };
  /**
   * Set by a completed Kunjungan Verifikasi (fieldwork module, ticket 15):
   * its dated photos (FileStore keys) and the date it confirmed this Lokasi.
   * Null before the first one.
   */
  kunjunganVerifikasi: { photos: string[]; visitedOn: string } | null;
  /**
   * Where Pencairan go (null until set). Admin Platform only: it sets it, and
   * only its reads carry it; an Admin Lokasi's read has no `bankAccount`.
   */
  bankAccount?: BankAccount | null;
  documentChecklist: string[];
  policies: LokasiPolicies;
  flags: LokasiFlags;
}

export interface LokasiDeps {
  db: Database;
  clock: Clock;
  audit: AuditLog;
}

export type NotFound = { ok: false; reason: "tidak_ditemukan" };

/**
 * The role an authorised actor writes a Lokasi Mitra under, for its Entri
 * Audit: Admin Platform when it holds it, else Admin Lokasi (an Admin Lokasi
 * write, e.g. Jam Operasional in ticket 11, is authorised for that Lokasi only).
 */
export function actingRole(by: Actor): "admin_platform" | "admin_lokasi" {
  return by.roles.includes("admin_platform") ? "admin_platform" : "admin_lokasi";
}

/** A Lokasi Mitra id has the shape of one (a UUID); anything else names no Lokasi. */
export function isLokasiId(lokasiId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lokasiId);
}

export interface NewLokasiMitra {
  name: string;
  pengelolaName: string;
  address: string;
  city: string;
}

export type CreateLokasiMitraResult = { ok: true; lokasiMitra: LokasiMitra } | WriteRefusal;

/** Admin Platform starts a Lokasi Mitra's onboarding record: it is Belum Tayang until the publish gate (ticket 16). */
export async function createLokasiMitra(
  deps: LokasiDeps,
  by: Actor,
  input: NewLokasiMitra,
): Promise<CreateLokasiMitraResult> {
  const refusal = writeRefusal(by, "lokasi.buat", semuaLokasiMitraResource());
  if (refusal) return refusal;
  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [row] = await tx
      .insert(lokasiMitraTable)
      .values({
        name: input.name.trim(),
        pengelolaName: input.pengelolaName.trim(),
        address: input.address.trim(),
        city: input.city.trim(),
        status: "belum_tayang",
        facilities: [],
        facilitiesNote: "",
        documentChecklist: [...DEFAULT_DOCUMENT_CHECKLIST],
        policies: DEFAULT_POLICIES,
        flags: DEFAULT_FLAGS,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    const created = toLokasiMitra(row);
    await record({
      actor: { accountId: by.accountId, role: actingRole(by) },
      action: "lokasi.buat",
      entity: { kind: "lokasi_mitra", id: created.id },
      lokasiId: created.id,
      before: null,
      after: {
        name: created.name,
        pengelolaName: created.pengelolaName,
        address: created.address,
        city: created.city,
        status: created.status,
      },
      reason: null,
    });
    return { ok: true, lokasiMitra: created } as const;
  });
}

export type LokasiMitraResult = { ok: true; lokasiMitra: LokasiMitra } | WriteRefusal | NotFound;

/** One Lokasi Mitra's record, for an actor allowed to see it; the bank account only for Admin Platform. */
export async function readLokasiMitra(deps: LokasiDeps, by: Actor, lokasiId: string): Promise<LokasiMitraResult> {
  const refusal = writeRefusal(by, "lokasi.lihat", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  if (!isLokasiId(lokasiId)) return { ok: false, reason: "tidak_ditemukan" };
  const [row] = await deps.db.select().from(lokasiMitraTable).where(eq(lokasiMitraTable.id, lokasiId));
  if (!row) return { ok: false, reason: "tidak_ditemukan" };
  const lokasiMitra = toLokasiMitra(row);
  if (writeRefusal(by, "lokasi.lihat_rekening", lokasiMitraResource(lokasiId))) delete lokasiMitra.bankAccount;
  return { ok: true, lokasiMitra };
}

/**
 * Whether a Lokasi Mitra is Terverifikasi, i.e. listed: the one question
 * public reads (pages, prices) ask, so they never serve a Lokasi still Belum
 * Tayang, or one Ditangguhkan or Berhenti. Needs no actor: it reveals nothing
 * a public page would not. The publish gate (ticket 16) sets the status.
 */
export async function isTerverifikasi(deps: LokasiDeps, lokasiId: string): Promise<boolean> {
  if (!isLokasiId(lokasiId)) return false;
  const [row] = await deps.db
    .select({ status: lokasiMitraTable.status })
    .from(lokasiMitraTable)
    .where(eq(lokasiMitraTable.id, lokasiId));
  return row?.status === "terverifikasi";
}

/** A Lokasi Mitra in a list (the Admin Platform list, the Lokasi switcher). */
export interface LokasiMitraSummary {
  id: string;
  name: string;
  city: string;
  status: LokasiMitraStatus;
}

const summaryColumns = {
  id: lokasiMitraTable.id,
  name: lokasiMitraTable.name,
  city: lokasiMitraTable.city,
  status: lokasiMitraTable.status,
};

/** Every Lokasi Mitra, by name, for Admin Platform; nothing for anyone else. */
export async function allLokasiMitra(deps: LokasiDeps, by: Actor): Promise<LokasiMitraSummary[]> {
  if (writeRefusal(by, "lokasi.lihat_semua", semuaLokasiMitraResource())) return [];
  return deps.db.select(summaryColumns).from(lokasiMitraTable).orderBy(asc(lokasiMitraTable.name), asc(lokasiMitraTable.id));
}

/** How many Lokasi Mitra are in each status (Admin Platform; all zero for anyone else). */
export async function lokasiMitraCountsByStatus(deps: LokasiDeps, by: Actor): Promise<Record<LokasiMitraStatus, number>> {
  const counts = Object.fromEntries(lokasiMitraStatuses.map((status) => [status, 0])) as Record<LokasiMitraStatus, number>;
  if (writeRefusal(by, "lokasi.lihat_semua", semuaLokasiMitraResource())) return counts;
  const rows = await deps.db
    .select({ status: lokasiMitraTable.status, total: count() })
    .from(lokasiMitraTable)
    .groupBy(lokasiMitraTable.status);
  for (const row of rows) counts[row.status] = row.total;
  return counts;
}

/** The Lokasi Mitra the actor is Admin Lokasi of, by name: the Lokasi switcher. */
export async function lokasiMitraOfAdminLokasi(deps: LokasiDeps, by: Actor): Promise<LokasiMitraSummary[]> {
  const lokasiIds = by.roles.includes("admin_lokasi") ? by.lokasiIds.filter(isLokasiId) : [];
  if (lokasiIds.length === 0) return [];
  return deps.db
    .select(summaryColumns)
    .from(lokasiMitraTable)
    .where(inArray(lokasiMitraTable.id, lokasiIds))
    .orderBy(asc(lokasiMitraTable.name), asc(lokasiMitraTable.id));
}

export type WriteResult = { ok: true } | WriteRefusal | NotFound;

/** Admin Platform replaces a Lokasi Mitra's document checklist (blank lines dropped), audited. */
export async function setDocumentChecklist(
  deps: LokasiDeps,
  by: Actor,
  lokasiId: string,
  input: { documentChecklist: string[] },
): Promise<WriteResult> {
  const documentChecklist = input.documentChecklist.map((item) => item.trim()).filter((item) => item !== "");
  return writeLokasiMitra(deps, by, lokasiId, "lokasi.ubah_dokumen", (row) => ({
    values: { documentChecklist },
    before: { documentChecklist: row.documentChecklist },
    after: { documentChecklist },
  }));
}

export type UpdateProfileResult = WriteResult | { ok: false; reason: "profil_tidak_valid" };

/**
 * Admin Platform records the profile: name, pengelola, address, city
 * (kota/kab), map pin, facilities checklist and note. Audited with the profile
 * before and after.
 */
export async function updateProfile(
  deps: LokasiDeps,
  by: Actor,
  lokasiId: string,
  input: LokasiProfileInput,
): Promise<UpdateProfileResult> {
  const parsed = lokasiProfileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "profil_tidak_valid" };
  const profile = parsed.data;
  return writeLokasiMitra(deps, by, lokasiId, "lokasi.ubah_profil", (row) => ({
    values: {
      name: profile.name,
      pengelolaName: profile.pengelolaName,
      address: profile.address,
      city: profile.city,
      pinLat: profile.pin?.lat ?? null,
      pinLng: profile.pin?.lng ?? null,
      facilities: profile.facilities.checked,
      facilitiesNote: profile.facilities.note,
    },
    before: {
      name: row.name,
      pengelolaName: row.pengelolaName,
      address: row.address,
      city: row.city,
      pin: pinOf(row),
      facilities: { checked: row.facilities, note: row.facilitiesNote },
    },
    after: { ...profile },
  }));
}

export type SetPoliciesResult = WriteResult | { ok: false; reason: "kebijakan_tidak_valid" | "terencana_belum_tersedia" };

/**
 * Admin Platform sets a Lokasi Mitra's policies and flags together, audited.
 * Values outside the rules are refused. Pemesanan Terencana stays off for now:
 * switching it on needs the Denah and a Cek Denah (tickets 13 and 16), so it
 * is refused (`terencana_belum_tersedia`) until those tickets add the conditions.
 */
export async function setPoliciesAndFlags(
  deps: LokasiDeps,
  by: Actor,
  lokasiId: string,
  input: { policies: LokasiPolicies; flags: LokasiFlags },
): Promise<SetPoliciesResult> {
  const policies = lokasiPoliciesSchema.safeParse(input.policies);
  const flags = lokasiFlagsSchema.safeParse(input.flags);
  if (!policies.success || !flags.success) return { ok: false, reason: "kebijakan_tidak_valid" };
  if (flags.data.pemesananTerencanaAktif) return { ok: false, reason: "terencana_belum_tersedia" };
  return writeLokasiMitra(deps, by, lokasiId, "lokasi.ubah_kebijakan", (row) => ({
    values: { policies: policies.data, flags: flags.data },
    before: { policies: row.policies, flags: row.flags },
    after: { policies: policies.data, flags: flags.data },
  }));
}

export interface BankAccount {
  bankName: string;
  /** Digits only. */
  accountNumber: string;
  accountHolder: string;
}

export type ChangeBankAccountResult = WriteResult | { ok: false; reason: "rekening_tidak_valid" };

/**
 * Admin Platform sets or changes the bank account Pencairan go to. Only Admin
 * Platform may (`lokasi.ubah_rekening`); an Admin Lokasi is refused by the
 * authorisation check. Audited with the account before and after.
 */
export async function changeBankAccount(
  deps: LokasiDeps,
  by: Actor,
  lokasiId: string,
  input: BankAccount & { reason: string | null },
): Promise<ChangeBankAccountResult> {
  const refusal = writeRefusal(by, "lokasi.ubah_rekening", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  const bankAccount: BankAccount = {
    bankName: input.bankName.trim(),
    accountNumber: input.accountNumber.replace(/\s/g, ""),
    accountHolder: input.accountHolder.trim(),
  };
  if (!bankAccount.bankName || !bankAccount.accountHolder || !/^\d{5,20}$/.test(bankAccount.accountNumber)) {
    return { ok: false, reason: "rekening_tidak_valid" };
  }
  return writeLokasiMitra(deps, by, lokasiId, "lokasi.ubah_rekening", (row) => ({
    values: {
      bankName: bankAccount.bankName,
      bankAccountNumber: bankAccount.accountNumber,
      bankAccountHolder: bankAccount.accountHolder,
    },
    before: { bankAccount: bankAccountOf(row) },
    after: { bankAccount: { ...bankAccount } },
    reason: input.reason?.trim() || null,
  }), "lokasi.ubah_rekening");
}

type Row = typeof lokasiMitraTable.$inferSelect;

function pinOf(row: Row): { lat: number; lng: number } | null {
  return row.pinLat !== null && row.pinLng !== null ? { lat: row.pinLat, lng: row.pinLng } : null;
}

function bankAccountOf(row: Row): BankAccount | null {
  if (row.bankName === null || row.bankAccountNumber === null || row.bankAccountHolder === null) return null;
  return { bankName: row.bankName, accountNumber: row.bankAccountNumber, accountHolder: row.bankAccountHolder };
}

/** The actions a write on a Lokasi Mitra's record can be authorised as. */
export type LokasiMitraWriteAction = Extract<
  Action,
  | "lokasi.ubah"
  | "lokasi.ubah_rekening"
  | "lokasi.atur_operasional"
  | "lokasi.catat_kunjungan_verifikasi"
  | "lokasi.catat_cek_denah"
>;

/** What a write changes on the row, and the Entri Audit's before and after. */
export interface LokasiMitraChange {
  values: Partial<Row>;
  before: AuditSnapshot;
  after: AuditSnapshot;
  reason?: string | null;
}

/**
 * One staff write on a Lokasi Mitra's record: authorised (`authorisedAs`),
 * locked, changed and audited in one transaction, under the role the actor
 * wrote as (`actingRole`). `change` runs only once the actor is authorised and
 * the row exists; it may refuse (e.g. invalid input) and then nothing is written.
 */
export async function writeLokasiMitra<Changed extends LokasiMitraChange | { ok: false; reason: string }>(
  deps: LokasiDeps,
  by: Actor,
  lokasiId: string,
  action: AuditAction,
  change: (row: Row) => Changed | Promise<Changed>,
  authorisedAs: LokasiMitraWriteAction = "lokasi.ubah",
): Promise<WriteResult | Extract<Changed, { ok: false }>> {
  const refusal = writeRefusal(by, authorisedAs, lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  if (!isLokasiId(lokasiId)) return { ok: false, reason: "tidak_ditemukan" };
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [row] = await tx.select().from(lokasiMitraTable).where(eq(lokasiMitraTable.id, lokasiId)).for("update");
    if (!row) return { ok: false, reason: "tidak_ditemukan" } as const;
    const changed: LokasiMitraChange | { ok: false; reason: string } = await change(row);
    if ("ok" in changed) return changed as Extract<Changed, { ok: false }>;
    const { values, before, after, reason } = changed;
    await tx
      .update(lokasiMitraTable)
      .set({ ...values, updatedAt: deps.clock.now() })
      .where(eq(lokasiMitraTable.id, lokasiId));
    await record({
      actor: { accountId: by.accountId, role: actingRole(by) },
      action,
      entity: { kind: "lokasi_mitra", id: lokasiId },
      lokasiId,
      before,
      after,
      reason: reason ?? null,
    });
    return { ok: true } as const;
  });
}

function toLokasiMitra(row: Row): LokasiMitra {
  return {
    id: row.id,
    name: row.name,
    pengelolaName: row.pengelolaName,
    address: row.address,
    city: row.city,
    pin: pinOf(row),
    facilities: { checked: row.facilities, note: row.facilitiesNote },
    status: row.status,
    agreement: { signedOn: row.agreementSignedOn, scanUploaded: row.agreementScanFileKey !== null },
    kunjunganVerifikasi:
      row.dikunjungiOn !== null ? { photos: row.visitPhotos ?? [], visitedOn: row.dikunjungiOn } : null,
    bankAccount: bankAccountOf(row),
    documentChecklist: row.documentChecklist,
    policies: row.policies,
    flags: row.flags,
  };
}
