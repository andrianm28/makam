/**
 * The Admin Lokasi's decisions on a manual request (ticket 41): approve, reject, send back. Each is a
 * staff write with its own Entri Audit; an approval records the holder, completes a flagged Hak Pakai
 * and starts the 30 days in one transaction.
 */
import { and, eq } from "drizzle-orm";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { PerpanjanganDeps } from "./deps";
import { MASA_BERLAKU_PERSETUJUAN_HARI, putuskanPermohonanSchema, setujuiPermohonanSchema } from "./permohonan-skema";
import { perpanjanganPermohonan } from "./schema";

export type KeputusanResult =
  | { ok: true }
  | WriteRefusal
  | { ok: false; reason: "input_tidak_valid" | "permohonan_tidak_ditemukan" | "hak_pakai_tidak_ditemukan" | "hak_pakai_sudah_berakhir" }
  /** Only a request that is Diajukan can be decided; a second decision, or one on a withdrawn request, says so. */
  | { ok: false; reason: "tidak_dapat_diputuskan" }
  /** The Hak Pakai is flagged Perlu Verifikasi with no end date on record, and the review gave none. */
  | { ok: false; reason: "tanggal_berakhir_wajib" }
  /** The holder or contact could not be recorded (an invalid number, say); nothing was changed. */
  | { ok: false; reason: "pemegang_hak_gagal"; sebab: string }
  /** The Hak Pakai could not be completed (its Perlu Verifikasi flag); nothing was changed. */
  | { ok: false; reason: "verifikasi_gagal"; sebab: string };

/** The request an Admin Lokasi decides, or the refusal: unknown, another Lokasi's Admin Lokasi, or not Diajukan. */
async function untukDiputuskan(deps: PerpanjanganDeps, by: Actor, permohonanId: string) {
  const [row] = await deps.db.select().from(perpanjanganPermohonan).where(eq(perpanjanganPermohonan.id, permohonanId));
  if (!row) return { ok: false as const, hasil: { ok: false as const, reason: "permohonan_tidak_ditemukan" as const } };
  const refusal = writeRefusal(by, "perpanjangan.periksa", lokasiMitraResource(row.lokasiId));
  if (refusal) return { ok: false as const, hasil: refusal };
  if (row.status !== "diajukan") return { ok: false as const, hasil: { ok: false as const, reason: "tidak_dapat_diputuskan" as const } };
  return { ok: true as const, row };
}

/**
 * Approves a request (Disetujui) after checking its documents: records the holder as the path needs it
 * (a new Pemegang Hak for an heir or a claim, the applicant's email and number for a KTP), completes a
 * Hak Pakai flagged Perlu Verifikasi, and starts the 30 days in which the applicant may order. All of it
 * is one transaction with one Entri Audit per write, so a refusal anywhere changes nothing.
 */
export async function setujuiPermohonan(deps: PerpanjanganDeps, by: Actor, rawInput: unknown): Promise<KeputusanResult> {
  const parsed = setujuiPermohonanSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;
  const dimuat = await untukDiputuskan(deps, by, input.permohonanId);
  if (!dimuat.ok) return dimuat.hasil;
  const { row } = dimuat;
  const hak = await deps.inventory.hakPakaiUntukPerpanjangan(row.hakPakaiId);
  if (!hak || hak.lokasiId !== row.lokasiId) return { ok: false, reason: "hak_pakai_tidak_ditemukan" };
  if (hak.status === "berakhir" || hak.status === "dibatalkan") return { ok: false, reason: "hak_pakai_sudah_berakhir" };
  if (hak.perluVerifikasi && hak.tenureYears !== null && hak.endDate === null && !input.endDate) return { ok: false, reason: "tanggal_berakhir_wajib" };

  const now = deps.clock.now();
  const berlakuSampai = new Date(now.getTime() + MASA_BERLAKU_PERSETUJUAN_HARI * 24 * 60 * 60 * 1000);
  const nama = input.nama ?? row.nama;
  const telepon = input.nomorTelepon ?? row.nomorTelepon;
  const sebab = `Permohonan Perpanjangan ${row.id}`;
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [terkunci] = await tx.select().from(perpanjanganPermohonan).where(eq(perpanjanganPermohonan.id, row.id)).for("update");
    if (!terkunci || terkunci.status !== "diajukan") return { ok: false as const, reason: "tidak_dapat_diputuskan" as const };
    const inventory = deps.inventory.within(tx);
    const pemegang =
      row.jalur === "ktp"
        ? await inventory.ubahKontakPemegangHak(by, row.lokasiId, {
            hakPakaiId: row.hakPakaiId,
            name: hak.pemegangHak?.name ? undefined : nama,
            phoneNumber: telepon,
            email: row.email,
            alasan: sebab,
          })
        : await inventory.gantiPemegangHak(by, row.lokasiId, {
            hakPakaiId: row.hakPakaiId,
            pemegangHak: { name: nama, phoneNumber: telepon, email: row.email },
            alasan: sebab,
          });
    if (!pemegang.ok) return { ok: false as const, reason: "pemegang_hak_gagal" as const, sebab: pemegang.reason };
    if (hak.perluVerifikasi) {
      const lengkap = await inventory.lengkapiHakPakai(by, row.lokasiId, { hakPakaiId: row.hakPakaiId, endDate: input.endDate });
      if (!lengkap.ok) return { ok: false as const, reason: "verifikasi_gagal" as const, sebab: lengkap.reason };
    }
    await tx
      .update(perpanjanganPermohonan)
      .set({ status: "disetujui", alasan: null, keputusanPada: now, keputusanOlehAccountId: by.accountId, berlakuSampai })
      .where(eq(perpanjanganPermohonan.id, row.id));
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "perpanjangan.setujui",
      entity: { kind: "perpanjangan_permohonan", id: row.id },
      lokasiId: row.lokasiId,
      before: { status: "diajukan" },
      after: { status: "disetujui", jalur: row.jalur, hakPakaiId: row.hakPakaiId, berlakuSampai: berlakuSampai.toISOString(), hakPakaiDilengkapi: hak.perluVerifikasi },
      reason: input.alasan,
    });
    return { ok: true as const };
  });
}

/** Rejects a request (Ditolak) with a reason the applicant reads; nothing about the Hak Pakai changes. */
export function tolakPermohonan(deps: PerpanjanganDeps, by: Actor, rawInput: unknown): Promise<KeputusanResult> {
  return putuskan(deps, by, rawInput, "ditolak", "perpanjangan.tolak");
}

/** Sends a request back (Perlu Perbaikan) with what to fix; the applicant corrects it and it is Diajukan again. */
export function mintaPerbaikanPermohonan(deps: PerpanjanganDeps, by: Actor, rawInput: unknown): Promise<KeputusanResult> {
  return putuskan(deps, by, rawInput, "perlu_perbaikan", "perpanjangan.minta_perbaikan");
}

async function putuskan(
  deps: PerpanjanganDeps,
  by: Actor,
  rawInput: unknown,
  ke: "ditolak" | "perlu_perbaikan",
  action: "perpanjangan.tolak" | "perpanjangan.minta_perbaikan",
): Promise<KeputusanResult> {
  const parsed = putuskanPermohonanSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;
  const dimuat = await untukDiputuskan(deps, by, input.permohonanId);
  if (!dimuat.ok) return dimuat.hasil;
  const { row } = dimuat;
  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const diubah = await tx
      .update(perpanjanganPermohonan)
      .set({ status: ke, alasan: input.alasan, keputusanPada: ke === "ditolak" ? now : null, keputusanOlehAccountId: by.accountId })
      .where(and(eq(perpanjanganPermohonan.id, row.id), eq(perpanjanganPermohonan.status, "diajukan")))
      .returning({ id: perpanjanganPermohonan.id });
    if (diubah.length === 0) return { ok: false as const, reason: "tidak_dapat_diputuskan" as const };
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action,
      entity: { kind: "perpanjangan_permohonan", id: row.id },
      lokasiId: row.lokasiId,
      before: { status: "diajukan" },
      after: { status: ke, jalur: row.jalur, hakPakaiId: row.hakPakaiId },
      reason: input.alasan,
    });
    return { ok: true as const };
  });
}
