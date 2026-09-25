import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { AuditAction, AuditLog, AuditSnapshot } from "@/domain/audit";
import {
  authorize,
  lokasiMitraResource,
  semuaLokasiMitraResource,
  type Action,
  type Actor,
  type Resource,
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
import { lokasiMitra as lokasiMitraTable, type lokasiMitraStatuses } from "./schema";

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
  status: LokasiMitraStatus;
  agreement: { signedOn: string | null; scanUploaded: boolean };
  /** Where Pencairan go; only Admin Platform sets it. */
  bankAccount: BankAccount | null;
  documentChecklist: string[];
  policies: LokasiPolicies;
  flags: LokasiFlags;
}

export interface LokasiDeps {
  db: Database;
  clock: Clock;
  audit: AuditLog;
}

export type Refusal = { ok: false; reason: "tidak_berwenang" | "perlu_totp" };
export type NotFound = { ok: false; reason: "tidak_ditemukan" };

/** A Lokasi Mitra id has the shape of one (a UUID); anything else names no Lokasi. */
export function isLokasiId(lokasiId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lokasiId);
}

/** The authorisation check inside the module (defence in depth behind `guarded()`). */
export function refusalFor(actor: Actor, action: Action, resource: Resource): Refusal | null {
  const authorization = authorize(actor, action, resource);
  if (authorization.allowed) return null;
  return { ok: false, reason: authorization.reason === "perlu_totp" ? "perlu_totp" : "tidak_berwenang" };
}

export interface NewLokasiMitra {
  name: string;
  pengelolaName: string;
  address: string;
  city: string;
}

export type CreateLokasiMitraResult = { ok: true; lokasiMitra: LokasiMitra } | Refusal;

/** Admin Platform starts a Lokasi Mitra's onboarding record: it is Belum Tayang until the publish gate (ticket 16). */
export async function createLokasiMitra(
  deps: LokasiDeps,
  by: Actor,
  input: NewLokasiMitra,
): Promise<CreateLokasiMitraResult> {
  const refusal = refusalFor(by, "lokasi.buat", semuaLokasiMitraResource());
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
        documentChecklist: [...DEFAULT_DOCUMENT_CHECKLIST],
        policies: DEFAULT_POLICIES,
        flags: DEFAULT_FLAGS,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    const created = toLokasiMitra(row);
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "lokasi.buat",
      entity: { kind: "lokasi_mitra", id: created.id },
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

export type LokasiMitraResult = { ok: true; lokasiMitra: LokasiMitra } | Refusal | NotFound;

/** One Lokasi Mitra's record, for an actor allowed to see it. */
export async function readLokasiMitra(deps: LokasiDeps, by: Actor, lokasiId: string): Promise<LokasiMitraResult> {
  const refusal = refusalFor(by, "lokasi.lihat", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  if (!isLokasiId(lokasiId)) return { ok: false, reason: "tidak_ditemukan" };
  const [row] = await deps.db.select().from(lokasiMitraTable).where(eq(lokasiMitraTable.id, lokasiId));
  if (!row) return { ok: false, reason: "tidak_ditemukan" };
  return { ok: true, lokasiMitra: toLokasiMitra(row) };
}

export type WriteResult = { ok: true } | Refusal | NotFound;

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

export type SetPoliciesResult = WriteResult | { ok: false; reason: "kebijakan_tidak_valid" };

/** Admin Platform sets a Lokasi Mitra's policies and flags together, audited. Values outside the rules are refused. */
export async function setPoliciesAndFlags(
  deps: LokasiDeps,
  by: Actor,
  lokasiId: string,
  input: { policies: LokasiPolicies; flags: LokasiFlags },
): Promise<SetPoliciesResult> {
  const policies = lokasiPoliciesSchema.safeParse(input.policies);
  const flags = lokasiFlagsSchema.safeParse(input.flags);
  if (!policies.success || !flags.success) return { ok: false, reason: "kebijakan_tidak_valid" };
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
  const refusal = refusalFor(by, "lokasi.ubah_rekening", lokasiMitraResource(lokasiId));
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

function bankAccountOf(row: Row): BankAccount | null {
  if (row.bankName === null || row.bankAccountNumber === null || row.bankAccountHolder === null) return null;
  return { bankName: row.bankName, accountNumber: row.bankAccountNumber, accountHolder: row.bankAccountHolder };
}

/**
 * One Admin Platform write on a Lokasi Mitra's record: authorised, locked,
 * changed and audited in one transaction.
 */
async function writeLokasiMitra(
  deps: LokasiDeps,
  by: Actor,
  lokasiId: string,
  action: AuditAction,
  change: (row: Row) => { values: Partial<Row>; before: AuditSnapshot; after: AuditSnapshot; reason?: string | null },
  authorisedAs: "lokasi.ubah" | "lokasi.ubah_rekening" = "lokasi.ubah",
): Promise<WriteResult> {
  const refusal = refusalFor(by, authorisedAs, lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  if (!isLokasiId(lokasiId)) return { ok: false, reason: "tidak_ditemukan" };
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [row] = await tx.select().from(lokasiMitraTable).where(eq(lokasiMitraTable.id, lokasiId)).for("update");
    if (!row) return { ok: false, reason: "tidak_ditemukan" } as const;
    const { values, before, after, reason } = change(row);
    await tx
      .update(lokasiMitraTable)
      .set({ ...values, updatedAt: deps.clock.now() })
      .where(eq(lokasiMitraTable.id, lokasiId));
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action,
      entity: { kind: "lokasi_mitra", id: lokasiId },
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
    pin: row.pinLat !== null && row.pinLng !== null ? { lat: row.pinLat, lng: row.pinLng } : null,
    status: row.status,
    agreement: { signedOn: row.agreementSignedOn, scanUploaded: false },
    bankAccount: bankAccountOf(row),
    documentChecklist: row.documentChecklist,
    policies: row.policies,
    flags: row.flags,
  };
}
