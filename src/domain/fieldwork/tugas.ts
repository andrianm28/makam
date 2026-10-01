import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import {
  semuaTugasLapanganResource,
  tugasLapanganResource,
  writeRefusal,
  type Actor,
  type Identity,
  type WriteRefusal,
} from "@/domain/identity";
import type { Billing } from "@/domain/billing";
import type { Lokasi } from "@/domain/lokasi";
import type { Notifications } from "@/domain/notifications";
import { documentExtension, type DocumentContentType } from "@/lib/files/document-type";
import { wib, wibDateOf } from "@/lib/time/jakarta";
import type { Clock } from "@/ports/clock";
import type { FileStore } from "@/ports/file-store";
import { tulisSetor } from "./setor-retribusi";
import { fieldworkTugas, tugasLapanganStatuses, tugasLapanganTypes, type TugasLapanganUpload } from "./schema";
import {
  formSchemaFor,
  requiredUploadsByType,
  type CekDenahForm,
  type KunjunganVerifikasiForm,
  type SetorRetribusiForm,
  type TugasLapanganType,
} from "./types";

export interface FieldworkDeps {
  db: Database;
  clock: Clock;
  /** The private bucket, for a Tugas Lapangan's required uploads. */
  files: FileStore;
  audit: AuditLog;
  /** Who may be assigned (Petugas Lapangan), and the assignment Peringatan Staf. */
  identity: Pick<Identity, "staffAccounts">;
  notifications: Pick<Notifications, "antrekanPeringatanStaf">;
  /**
   * A completed Kunjungan Verifikasi and Cek Denah are recorded on the Lokasi
   * only through its own public functions (AGENTS.md): the fieldwork module
   * never touches `lokasi_mitra` itself.
   */
  lokasi: Pick<Lokasi, "recordKunjunganVerifikasi" | "recordCekDenah" | "adminPlatformCalendar">;
  /**
   * A completed Setor Retribusi records the payment to the town in the same
   * transaction as the completion, with the proof the upload already stored:
   * Billing's read of the Retribusi line, and the Admin Platform calendar for
   * the Tier 3 row's deadline.
   */
  billing: Pick<Billing, "tagihanRetribusiLunas">;
}

export type NotFound = { ok: false; reason: "tidak_ditemukan" };

/** A Tugas Lapangan, as the fieldwork module hands it out. */
export interface TugasLapangan {
  id: string;
  type: TugasLapanganType;
  subject: string;
  lokasiId: string | null;
  address: string;
  pin: { lat: number; lng: number } | null;
  plannedDate: string;
  assigneeAccountId: string;
  /** The Tagihan a Setor Retribusi Tugas settles; null for every other type. */
  tagihanId: string | null;
  status: (typeof tugasLapanganStatuses)[number];
  form: Record<string, unknown>;
  uploads: TugasLapanganUpload[];
  createdAt: Date;
  completedAt: Date | null;
}

type Row = typeof fieldworkTugas.$inferSelect;

function toTugasLapangan(row: Row): TugasLapangan {
  return {
    id: row.id,
    type: row.type,
    subject: row.subject,
    lokasiId: row.lokasiId,
    address: row.address,
    pin: row.pinLat !== null && row.pinLng !== null ? { lat: row.pinLat, lng: row.pinLng } : null,
    plannedDate: row.plannedDate,
    assigneeAccountId: row.assigneeAccountId,
    tagihanId: row.tagihanId,
    status: row.status,
    form: row.form,
    uploads: row.uploads,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  };
}

export const newTugasLapanganSchema = z.object({
  type: z.enum(tugasLapanganTypes),
  subject: z.string().trim().min(1).max(200),
  lokasiId: z.uuid().nullable(),
  address: z.string().trim().min(1).max(500),
  pin: z.object({ lat: z.number().min(-11.5).max(6.5), lng: z.number().min(94.5).max(141.5) }).nullable(),
  plannedDate: z.iso.date(),
  assigneeAccountId: z.string().trim().min(1),
  /**
   * The Tagihan a Setor Retribusi Tugas settles, required for that type alone
   * and refused for the others, so a row never points at a Tagihan whose type
   * has no meaning for it. A uuid here and no foreign key: Billing owns its
   * tables, and this module reads the line's amount through its own query.
   */
  tagihanId: z.uuid().nullable().optional(),
});
export type NewTugasLapangan = z.infer<typeof newTugasLapanganSchema>;

export type CreateTugasLapanganResult =
  | { ok: true; tugasLapangan: TugasLapangan }
  | WriteRefusal
  /** A Setor Retribusi Tugas with no Tagihan, or another type carrying one. */
  | { ok: false; reason: "input_tidak_valid" | "bukan_petugas_lapangan" | "tagihan_kosong" | "tagihan_tidak_relevan" };

/**
 * Admin Platform creates and assigns a Tugas Lapangan to one Petugas
 * Lapangan (spec, story 153): subject, address + pin, planned date and the
 * type-specific form start empty (its Petugas Lapangan fills it at
 * completion). Sends a Peringatan Staf (push + email) to the assignee.
 */
export async function createTugasLapangan(
  deps: FieldworkDeps,
  by: Actor,
  input: NewTugasLapangan,
): Promise<CreateTugasLapanganResult> {
  const refusal = writeRefusal(by, "tugas_lapangan.buat", semuaTugasLapanganResource());
  if (refusal) return refusal;
  const parsed = newTugasLapanganSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const data = parsed.data;

  const petugas = await deps.identity.staffAccounts();
  const assignee = petugas.find((account) => account.accountId === data.assigneeAccountId);
  if (!assignee || assignee.deactivated || !assignee.roles.includes("petugas_lapangan")) {
    return { ok: false, reason: "bukan_petugas_lapangan" };
  }
  const tagihanId = data.tagihanId ?? null;
  if (data.type === "setor_retribusi" && !tagihanId) return { ok: false, reason: "tagihan_kosong" };
  if (data.type !== "setor_retribusi" && tagihanId !== null) return { ok: false, reason: "tagihan_tidak_relevan" };

  const now = deps.clock.now();
  const created = await deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [row] = await tx
      .insert(fieldworkTugas)
      .values({
        type: data.type,
        subject: data.subject,
        lokasiId: data.lokasiId,
        address: data.address,
        pinLat: data.pin?.lat ?? null,
        pinLng: data.pin?.lng ?? null,
        plannedDate: data.plannedDate,
        assigneeAccountId: data.assigneeAccountId,
        tagihanId: data.type === "setor_retribusi" ? tagihanId : null,
        status: "ditugaskan",
        form: {},
        uploads: [],
        createdByAccountId: by.accountId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    const tugasLapangan = toTugasLapangan(row);
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "tugas_lapangan.buat",
      entity: { kind: "fieldwork_tugas", id: tugasLapangan.id },
      lokasiId: tugasLapangan.lokasiId,
      before: null,
      after: { type: tugasLapangan.type, subject: tugasLapangan.subject, assigneeAccountId: tugasLapangan.assigneeAccountId },
      reason: null,
    });
    // The assignment and its Peringatan Staf commit together (ticket 96): a
    // rolled-back assignment leaves no alert behind, and a committed one cannot
    // lose its alert.
    await deps.notifications.antrekanPeringatanStaf(
      {
        to: { accountId: data.assigneeAccountId },
        kind: "staf_tugas_lapangan_baru",
        email: {
          subject: "Tugas Lapangan baru",
          text: `${data.subject}: ${data.address}, direncanakan ${data.plannedDate}.`,
        },
        push: {
          title: "Tugas Lapangan baru",
          body: `${data.subject}, ${data.plannedDate}`,
          url: `/staf/petugas-lapangan/tugas/${tugasLapangan.id}`,
        },
      },
      tx,
    );
    return { ok: true, tugasLapangan } as const;
  });

  return created;
}

/** Every Tugas Lapangan, newest first (Admin Platform's list); empty for anyone else. */
export async function allTugasLapangan(deps: FieldworkDeps, by: Actor): Promise<TugasLapangan[]> {
  if (writeRefusal(by, "tugas_lapangan.lihat_semua", semuaTugasLapanganResource())) return [];
  const rows = await deps.db.select().from(fieldworkTugas).orderBy(asc(fieldworkTugas.plannedDate), asc(fieldworkTugas.id));
  return rows.map(toTugasLapangan);
}

/** The signed-in Petugas Lapangan's own "Tugas saya": every task assigned to them, soonest planned date first. */
export async function tugasSaya(deps: FieldworkDeps, by: Actor): Promise<TugasLapangan[]> {
  if (writeRefusal(by, "tugas_lapangan.punya_saya", semuaTugasLapanganResource())) return [];
  const rows = await deps.db
    .select()
    .from(fieldworkTugas)
    .where(eq(fieldworkTugas.assigneeAccountId, by.accountId))
    .orderBy(asc(fieldworkTugas.plannedDate), asc(fieldworkTugas.id));
  return rows.map(toTugasLapangan);
}

/**
 * Whether `by` may see this row's case (spec, story 175): Admin Platform, or
 * the Petugas Lapangan it is assigned to; anyone else gets `tidak_ditemukan`,
 * never a refusal that would confirm the row exists.
 */
function ownsCase(by: Actor, row: Row): boolean {
  return by.roles.includes("admin_platform") || row.assigneeAccountId === by.accountId;
}

export type TugasLapanganResult = { ok: true; tugasLapangan: TugasLapangan } | WriteRefusal | NotFound;

/** One Tugas Lapangan, for Admin Platform or its assigned Petugas Lapangan only (spec, story 175). */
export async function readTugasLapangan(deps: FieldworkDeps, by: Actor, id: string): Promise<TugasLapanganResult> {
  const refusal = writeRefusal(by, "tugas_lapangan.lihat", tugasLapanganResource(id));
  if (refusal) return refusal;
  const [row] = await deps.db.select().from(fieldworkTugas).where(eq(fieldworkTugas.id, id));
  if (!row || !ownsCase(by, row)) return { ok: false, reason: "tidak_ditemukan" };
  return { ok: true, tugasLapangan: toTugasLapangan(row) };
}

/** A signed URL to one of a Tugas Lapangan's uploaded evidence files, for Admin Platform or its assigned Petugas Lapangan. */
export type EvidenceUrlResult = { ok: true; url: string } | WriteRefusal | NotFound;

export async function evidenceUrl(deps: FieldworkDeps, by: Actor, id: string, uploadId: string): Promise<EvidenceUrlResult> {
  const refusal = writeRefusal(by, "tugas_lapangan.lihat", tugasLapanganResource(id));
  if (refusal) return refusal;
  const [row] = await deps.db.select().from(fieldworkTugas).where(eq(fieldworkTugas.id, id));
  if (!row || !ownsCase(by, row)) return { ok: false, reason: "tidak_ditemukan" };
  const upload = row.uploads.find((item) => item.id === uploadId);
  if (!upload) return { ok: false, reason: "tidak_ditemukan" };
  const url = await deps.files.signedUrl(upload.key, { expiresInSeconds: 5 * 60 });
  return { ok: true, url };
}

const ACCEPTED_EVIDENCE_TYPES: readonly DocumentContentType[] = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export interface EvidenceUpload {
  kind: string;
  file: { body: Uint8Array; contentType: string };
}

export type CompleteTugasLapanganResult =
  | { ok: true; tugasLapangan: TugasLapangan }
  | WriteRefusal
  | NotFound
  | { ok: false; reason: "sudah_selesai" | "form_tidak_valid" | "unggah_kurang" | "berkas_tidak_didukung" | "berkas_gagal_disimpan" }
  | { ok: false; reason: "kunjungan_tidak_valid" | "catatan_tidak_valid" }
  /**
   * A Setor Retribusi Tugas whose Tagihan never went out to a town (Billing's
   * read has no such Lunas Retribusi Tagihan), so there is nothing to record;
   * the whole completion rolls back and the Petugas is sent to an Admin Platform.
   */
  | { ok: false; reason: "setor_tidak_tercatat" }
  /**
   * A Setor Retribusi Tugas whose town has already been paid for the same
   * Tagihan: the recording it asked for is refused, because a town is paid once.
   * Its own reason, never folded into `setor_tidak_tercatat`, because "the town
   * is already paid" and "this Tagihan never went to a town" send the Petugas to
   * two different places.
   */
  | { ok: false; reason: "sudah_disetor" };

/**
 * The assigned Petugas Lapangan marks a Tugas Lapangan Selesai (spec, story
 * 174): refused while any required upload for its type is missing, or its
 * type-specific form does not validate. A completed Kunjungan Verifikasi
 * updates the Lokasi (pin, facilities, photos, "dikunjungi" date); a
 * completed Cek Denah is recorded on it (ticket 16's Terencana-switch input).
 * Both go through the Lokasi module's own public functions first: if either
 * refuses, this Tugas Lapangan is not marked Selesai and nothing is stored.
 */
export async function completeTugasLapangan(
  deps: FieldworkDeps,
  by: Actor,
  id: string,
  input: { form: unknown; uploads: EvidenceUpload[] },
): Promise<CompleteTugasLapanganResult> {
  const refusal = writeRefusal(by, "tugas_lapangan.selesaikan", tugasLapanganResource(id));
  if (refusal) return refusal;
  const [row] = await deps.db.select().from(fieldworkTugas).where(eq(fieldworkTugas.id, id));
  if (!row || !ownsCase(by, row)) return { ok: false, reason: "tidak_ditemukan" };
  if (row.status === "selesai") return { ok: false, reason: "sudah_selesai" };

  const formSchema = formSchemaFor(row.type);
  const parsedForm = formSchema.safeParse(input.form);
  if (!parsedForm.success) return { ok: false, reason: "form_tidak_valid" };

  const required = requiredUploadsByType[row.type];
  const counts = new Map<string, number>();
  for (const upload of input.uploads) counts.set(upload.kind, (counts.get(upload.kind) ?? 0) + 1);
  for (const requirement of required) {
    if ((counts.get(requirement.kind) ?? 0) < requirement.min) return { ok: false, reason: "unggah_kurang" };
  }

  const now = deps.clock.now();
  const stored: TugasLapanganUpload[] = [];
  try {
    for (const upload of input.uploads) {
      const extension = documentExtension(upload.file, ACCEPTED_EVIDENCE_TYPES);
      if (!extension) return { ok: false, reason: "berkas_tidak_didukung" };
      const key = `tugas-lapangan/${id}/${randomUUID()}.${extension}`;
      await deps.files.put({ key, body: upload.file.body, contentType: upload.file.contentType });
      stored.push({ id: randomUUID(), kind: upload.kind, key, uploadedAt: now.toISOString() });
    }
  } catch {
    await Promise.all(stored.map((upload) => deps.files.delete(upload.key).catch(() => undefined)));
    return { ok: false, reason: "berkas_gagal_disimpan" };
  }

  const sideEffect = await recordLokasiSideEffect(deps, by, row, parsedForm.data, stored, now);
  if (sideEffect && !sideEffect.ok) {
    await Promise.all(stored.map((upload) => deps.files.delete(upload.key).catch(() => undefined)));
    return sideEffect;
  }

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [current] = await tx.select().from(fieldworkTugas).where(eq(fieldworkTugas.id, id)).for("update");
    if (!current || current.status === "selesai") return { ok: false, reason: "sudah_selesai" } as const;
    const uploads = [...current.uploads, ...stored];

    // A Setor Retribusi Tugas closes the Tier 3 row by recording the payment to
    // the town, in this same transaction, with the proof this upload has just
    // stored (ticket 45). The amount and the Tagihan's number are Billing's
    // facts, read through its own query and never restated here.
    if (current.type === "setor_retribusi" && current.tagihanId) {
      const form = parsedForm.data as SetorRetribusiForm;
      const [tagihan] = (await deps.billing.tagihanRetribusiLunas()).filter(
        (row) => row.tagihanId === current.tagihanId,
      );
      // A Tagihan that never went out to a town (no Retribusi line, a Rp 0 one,
      // or not Lunas) cannot be recorded as paid, so the whole completion rolls
      // back and the Petugas is sent to an Admin Platform.
      if (!tagihan) return { ok: false, reason: "setor_tidak_tercatat" } as const;
      const bukti = stored.find((upload) => upload.kind === "bukti_setor");
      if (!bukti) return { ok: false, reason: "unggah_kurang" } as const;
      const setor = await tulisSetor(
        { ...deps, db: tx },
        by,
        {
          tagihan,
          dibayarkanPada: wib(`${form.dibayarkanPada} 00:00`),
          buktiKey: bukti.key,
          catatan: form.catatan,
          tugasLapanganId: id,
          now,
        },
      );
      // Which refusal it was travels on: the town is already paid for this
      // Tagihan (`sudah_disetor`, from the recording itself) is not the same
      // answer as "this Tagihan never went to a town", so neither is folded into
      // the other. A permission refusal from the inner write is its own
      // `WriteRefusal` and passes through as itself.
      if (!setor.ok) {
        if (setor.reason === "sudah_disetor" || setor.reason === "tidak_berwenang" || setor.reason === "perlu_totp")
          return setor;
        return { ok: false, reason: "setor_tidak_tercatat" } as const;
      }
    }

    await tx
      .update(fieldworkTugas)
      .set({ status: "selesai", form: parsedForm.data, uploads, completedAt: now, updatedAt: now })
      .where(eq(fieldworkTugas.id, id));
    await record({
      actor: { accountId: by.accountId, role: "petugas_lapangan" },
      action: "tugas_lapangan.selesai",
      entity: { kind: "fieldwork_tugas", id },
      lokasiId: current.lokasiId,
      before: { status: current.status },
      after: { status: "selesai", form: parsedForm.data },
      reason: null,
    });
    return {
      ok: true,
      tugasLapangan: toTugasLapangan({ ...current, status: "selesai", form: parsedForm.data, uploads, completedAt: now }),
    } as const;
  });
}

/**
 * Kunjungan Verifikasi and Cek Denah call into the Lokasi module before the
 * Tugas Lapangan itself is marked Selesai (see `completeTugasLapangan`); every
 * other type has no Lokasi side effect (its hook arrives with its ticket).
 */
async function recordLokasiSideEffect(
  deps: FieldworkDeps,
  by: Actor,
  row: Row,
  form: unknown,
  stored: TugasLapanganUpload[],
  now: Date,
): Promise<{ ok: false; reason: "kunjungan_tidak_valid" | "catatan_tidak_valid" | "tidak_ditemukan" } | null> {
  if (row.type === "kunjungan_verifikasi") {
    if (!row.lokasiId) return { ok: false, reason: "kunjungan_tidak_valid" };
    // Already validated against kunjunganVerifikasiFormSchema by the caller (formSchemaFor(row.type)).
    const data = form as KunjunganVerifikasiForm;
    const photos = stored.filter((upload) => upload.kind === "foto_lokasi").map((upload) => upload.key);
    const written = await deps.lokasi.recordKunjunganVerifikasi(by, row.lokasiId, {
      pin: data.pin,
      facilities: data.facilities,
      photos,
      visitedOn: wibDateOf(now),
    });
    if (!written.ok) {
      return written.reason === "tidak_ditemukan"
        ? { ok: false, reason: "tidak_ditemukan" }
        : { ok: false, reason: "kunjungan_tidak_valid" };
    }
    return null;
  }
  if (row.type === "cek_denah") {
    if (!row.lokasiId) return { ok: false, reason: "catatan_tidak_valid" };
    // Already validated against cekDenahFormSchema by the caller (formSchemaFor(row.type)).
    const data = form as CekDenahForm;
    const written = await deps.lokasi.recordCekDenah(by, row.lokasiId, { checkedAt: now, note: data.note });
    if (!written.ok) {
      return written.reason === "tidak_ditemukan"
        ? { ok: false, reason: "tidak_ditemukan" }
        : { ok: false, reason: "catatan_tidak_valid" };
    }
    return null;
  }
  return null;
}
