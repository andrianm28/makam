/**
 * The two other requests a Pemegang Hak may make about a Hak Pakai — Pengembalian Hak Pakai and Ganti
 * Pemegang Hak — and the free change of a Calon Penghuni label (spec, Pemesanan > Requests from the
 * Pemegang Hak, Inventory > Operasi; stories 103, 104, 105, 125, 126; ticket 39).
 *
 * - **Who may ask** is the Hak Pakai's current Pemegang Hak, told apart the way the Makam tab tells
 *   them (ADR 0004): the Akun's Email Terverifikasi equals the email recorded on the holder. Anybody
 *   else is nothing found.
 * - **One request at a time** per Hak Pakai; the status machine is the Pembatalan one (Diajukan →
 *   (Perlu Perbaikan ↺ Diajukan) → Disetujui | Ditolak | Dibatalkan by the requester before a
 *   decision). The Antrean Lokasi row exists only while Diajukan, due 2 Hari Kerja on the Lokasi's
 *   own Jam Operasional calendar.
 * - **Pengembalian** is for a plot with no Pemakaman: on approval the Hak Pakai is Berakhir (reason
 *   Pengembalian) and its plot reads Tersedia. No money moves through the Operator; compensation is
 *   agreed directly with the Lokasi.
 * - **Ganti Pemegang Hak** names the new holder and why (`jual` / `waris`). A sale is refused where
 *   the Lokasi forbids sale transfers; inheritance is always allowed. It is blocked while a Pembatalan
 *   is open or a Saat Duka Tagihan on the Hak Pakai is overdue. On approval the holder history keeps
 *   every earlier holder with dates, and the Lokasi's own fee is noted as collected offline.
 * - **Calon Penghuni**: the Pemegang Hak changes the label freely, with no review and no history; the
 *   Lokasi's Admin Lokasi is notified.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { lokasiMitraResource, normaliseEmail, normalisePhoneNumber, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { addWorkingDays } from "@/domain/lokasi";
import { isBlockedByOverdueTagihan } from "./chasing";
import type { Pemesan, PemesananDeps } from "./deps";
import {
  pemesananPermintaanHakPakai,
  permintaanPembatalanTerencana,
  type PermintaanGantiSebab,
  type PermintaanHakPakaiJenis,
  type PermintaanHakPakaiStatus,
} from "./schema";
import {
  ajukanGantiPemegangHakSchema,
  ajukanPengembalianSchema,
  ajukanUlangPermintaanHakPakaiSchema,
  mintaPerbaikanPermintaanHakPakaiSchema,
  permintaanHakPakaiIdSchema,
  setujuiPermintaanHakPakaiSchema,
  tolakPermintaanHakPakaiSchema,
  ubahCalonPenghuniSchema,
} from "./skema-permintaan-hak-pakai";

/** How soon the Lokasi Mitra must answer: 2 Hari Kerja (spec, Work Queues: requests from the Pemegang Hak). */
export const TENGGAT_PERMINTAAN_HAK_PAKAI_HARI_KERJA = 2;

type Row = typeof pemesananPermintaanHakPakai.$inferSelect;

/** Why a Pengembalian or Ganti Pemegang Hak request cannot be filed (or approved). */
export type SebabPermintaanTerhalang =
  /** The Hak Pakai has ended (Kedaluwarsa, Berakhir or Dibatalkan). */
  | "hak_pakai_sudah_berakhir"
  /** A Pemakaman is recorded under it: a plot with a grave under it is not given back. */
  | "sudah_ada_pemakaman"
  /** Another request of this Hak Pakai is open. */
  | "sudah_ada_permintaan"
  /** A Saat Duka Tagihan on the Hak Pakai is Lewat Jatuh Tempo (`isBlockedByOverdueTagihan`). */
  | "tagihan_lewat_jatuh_tempo"
  /** A Pembatalan request of this Hak Pakai is open. */
  | "pembatalan_terbuka"
  /** The Lokasi Mitra does not allow transfers by sale; inheritance is always allowed. */
  | "jual_tidak_diizinkan";

/** Why the caller may not act on this Hak Pakai at all. */
export type SebabBukanPemegang = "tidak_ditemukan";

/** One Pengembalian / Ganti Pemegang Hak request as the family reads it. */
export interface PermintaanHakPakai {
  id: string;
  jenis: PermintaanHakPakaiJenis;
  status: PermintaanHakPakaiStatus;
  hakPakaiId: string;
  unitNomor: string;
  lokasiId: string;
  catatanPemohon: string | null;
  /** Ganti only: the new holder and why the right changes hands. */
  pemegangBaru: { name: string; phoneNumber: string; email: string | null } | null;
  sebab: PermintaanGantiSebab | null;
  biayaGantiOffline: number | null;
  putaran: number;
  diajukanPada: Date;
  tenggatPada: Date | null;
  diputuskanPada: Date | null;
  dibatalkanPada: Date | null;
  alasanKeputusan: string | null;
}

export function toPermintaan(row: Row): PermintaanHakPakai {
  return {
    id: row.id,
    jenis: row.jenis,
    status: row.status,
    hakPakaiId: row.hakPakaiId,
    unitNomor: row.unitNomor,
    lokasiId: row.lokasiId,
    catatanPemohon: row.catatanPemohon,
    pemegangBaru:
      row.pemegangBaruName && row.pemegangBaruPhone
        ? { name: row.pemegangBaruName, phoneNumber: row.pemegangBaruPhone, email: row.pemegangBaruEmail }
        : null,
    sebab: row.sebab,
    biayaGantiOffline: row.biayaGantiOffline,
    putaran: row.putaran,
    diajukanPada: row.diajukanPada,
    tenggatPada: row.tenggatPada,
    diputuskanPada: row.diputuskanPada,
    dibatalkanPada: row.dibatalkanPada,
    alasanKeputusan: row.alasanKeputusan,
  };
}

/** The Antrean Lokasi's own row for one Diajukan request, whatever its kind. */
export interface BarisAntreanPermintaanHakPakai {
  id: string;
  jenis: PermintaanHakPakaiJenis;
  unitNomor: string;
  diajukanPada: Date;
  /** 2 Hari Kerja from the latest filing; null while the Lokasi's Jam Operasional is belum diisi. */
  tenggatPada: Date | null;
}

/** The Pemegang Hak of this Hak Pakai, checked by Email Terverifikasi, or null (nothing found). */
async function hakPakaiMilik(deps: PemesananDeps, pemesan: Pemesan, hakPakaiId: string) {
  if (!z.uuid().safeParse(hakPakaiId).success) return null;
  const hakPakai = await deps.inventory.hakPakaiById(hakPakaiId);
  if (!hakPakai) return null;
  const email = normaliseEmail(pemesan.email);
  const pemegang = hakPakai.pemegangHak?.email ? normaliseEmail(hakPakai.pemegangHak.email) : null;
  if (!email || !pemegang || email !== pemegang) return null;
  return hakPakai;
}

async function permintaanTerbuka(deps: Pick<PemesananDeps, "db">, hakPakaiId: string) {
  const [row] = await deps.db
    .select()
    .from(pemesananPermintaanHakPakai)
    .where(and(eq(pemesananPermintaanHakPakai.hakPakaiId, hakPakaiId), inArray(pemesananPermintaanHakPakai.status, ["diajukan", "perlu_perbaikan"])));
  return row ?? null;
}

async function pembatalanTerbuka(deps: Pick<PemesananDeps, "db">, hakPakaiId: string) {
  const [row] = await deps.db
    .select({ id: permintaanPembatalanTerencana.id })
    .from(permintaanPembatalanTerencana)
    .where(and(eq(permintaanPembatalanTerencana.hakPakaiId, hakPakaiId), inArray(permintaanPembatalanTerencana.status, ["diajukan", "perlu_perbaikan"])));
  return row !== undefined;
}

/** When the Lokasi Mitra must answer, or null while its Jam Operasional is belum diisi. */
async function tenggatJawaban(deps: Pick<PemesananDeps, "lokasi">, lokasiId: string, sekarang: Date): Promise<Date | null> {
  const jam = await deps.lokasi.jamOperasionalOf(lokasiId);
  if (!jam.ok) return null;
  const tenggat = addWorkingDays(jam.jamOperasional, sekarang, TENGGAT_PERMINTAAN_HAK_PAKAI_HARI_KERJA);
  return tenggat.ok ? tenggat.at : null;
}

export type AjukanPermintaanResult =
  | { ok: true; permintaan: PermintaanHakPakai }
  | { ok: false; reason: "input_tidak_valid" | "tidak_ditemukan" }
  | { ok: false; reason: SebabPermintaanTerhalang };

/** Why a Ganti request is blocked on this Hak Pakai, or null. */
async function sebabGanti(deps: PemesananDeps, hakPakai: { id: string; lokasiId: string; status: string }, sebab: PermintaanGantiSebab): Promise<SebabPermintaanTerhalang | null> {
  if (hakPakai.status !== "aktif") return "hak_pakai_sudah_berakhir";
  if (await permintaanTerbuka(deps, hakPakai.id)) return "sudah_ada_permintaan";
  if (await pembatalanTerbuka(deps, hakPakai.id)) return "pembatalan_terbuka";
  if (await isBlockedByOverdueTagihan(deps, hakPakai.id)) return "tagihan_lewat_jatuh_tempo";
  if (sebab === "jual") {
    const aturan = await deps.lokasi.aturanGantiPemegangHak(hakPakai.lokasiId);
    if (!aturan?.saleTransfersAllowed) return "jual_tidak_diizinkan";
  }
  return null;
}

/**
 * "Kembalikan Hak Pakai": a request on an unused plot. The plot must have no Pemakaman and no other
 * request open; the warning that compensation is agreed directly with the Lokasi is the screen's.
 */
export async function ajukanPengembalian(deps: PemesananDeps, pemesan: Pemesan, rawInput: unknown): Promise<AjukanPermintaanResult> {
  const parsed = ajukanPengembalianSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const hakPakai = await hakPakaiMilik(deps, pemesan, parsed.data.hakPakaiId);
  if (!hakPakai) return { ok: false, reason: "tidak_ditemukan" };
  if (hakPakai.status !== "aktif") return { ok: false, reason: "hak_pakai_sudah_berakhir" };
  if (hakPakai.pemakaman.length > 0) return { ok: false, reason: "sudah_ada_pemakaman" };
  if (await permintaanTerbuka(deps, hakPakai.id)) return { ok: false, reason: "sudah_ada_permintaan" };
  const now = deps.clock.now();
  const [dibuat] = await deps.db
    .insert(pemesananPermintaanHakPakai)
    .values({
      jenis: "pengembalian",
      status: "diajukan",
      lokasiId: hakPakai.lokasiId,
      hakPakaiId: hakPakai.id,
      unitNomor: hakPakai.unitNomor ?? hakPakai.id,
      pemohonAccountId: pemesan.accountId,
      pemohonEmail: pemesan.email,
      catatanPemohon: parsed.data.catatan === "" ? null : parsed.data.catatan,
      dokumen: [],
      putaran: 0,
      diajukanPada: now,
      tenggatPada: await tenggatJawaban(deps, hakPakai.lokasiId, now),
    })
    .onConflictDoNothing()
    .returning();
  if (!dibuat) return { ok: false, reason: "sudah_ada_permintaan" };
  return { ok: true, permintaan: toPermintaan(dibuat) };
}

/**
 * "Ajukan Ganti Pemegang Hak": the new holder and why, with any documents. A sale is refused where the
 * Lokasi forbids it; inheritance is always allowed. Blocked while a Pembatalan is open or a Saat Duka
 * Tagihan is overdue.
 */
export async function ajukanGantiPemegangHak(deps: PemesananDeps, pemesan: Pemesan, rawInput: unknown): Promise<AjukanPermintaanResult> {
  const parsed = ajukanGantiPemegangHakSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const hakPakai = await hakPakaiMilik(deps, pemesan, parsed.data.hakPakaiId);
  if (!hakPakai) return { ok: false, reason: "tidak_ditemukan" };
  const terhalang = await sebabGanti(deps, hakPakai, parsed.data.sebab);
  if (terhalang) return { ok: false, reason: terhalang };
  const phone = normalisePhoneNumber(parsed.data.pemegangBaru.phoneNumber);
  if (!phone.ok) return { ok: false, reason: "input_tidak_valid" };
  let email: string | null = null;
  if (parsed.data.pemegangBaru.email) {
    email = normaliseEmail(parsed.data.pemegangBaru.email);
    if (!email) return { ok: false, reason: "input_tidak_valid" };
  }
  const now = deps.clock.now();
  const [dibuat] = await deps.db
    .insert(pemesananPermintaanHakPakai)
    .values({
      jenis: "ganti_pemegang_hak",
      status: "diajukan",
      lokasiId: hakPakai.lokasiId,
      hakPakaiId: hakPakai.id,
      unitNomor: hakPakai.unitNomor ?? hakPakai.id,
      pemohonAccountId: pemesan.accountId,
      pemohonEmail: pemesan.email,
      catatanPemohon: parsed.data.catatan === "" ? null : parsed.data.catatan,
      pemegangBaruName: parsed.data.pemegangBaru.name,
      pemegangBaruPhone: phone.phoneNumber,
      pemegangBaruEmail: email,
      sebab: parsed.data.sebab,
      dokumen: parsed.data.dokumen,
      putaran: 0,
      diajukanPada: now,
      tenggatPada: await tenggatJawaban(deps, hakPakai.lokasiId, now),
    })
    .onConflictDoNothing()
    .returning();
  if (!dibuat) return { ok: false, reason: "sudah_ada_permintaan" };
  return { ok: true, permintaan: toPermintaan(dibuat) };
}

export type UbahPermintaanHakPakaiResult =
  | { ok: true; permintaan: PermintaanHakPakai }
  | WriteRefusal
  | { ok: false; reason: "input_tidak_valid" | "tidak_ditemukan" | "sudah_diputuskan" }
  /** The request is not in the state this step needs. */
  | { ok: false; reason: "status_tidak_sesuai" };

/** One request of this Akun, or null: another Akun's request is nothing found. */
async function permintaanMilik(deps: Pick<PemesananDeps, "db">, pemesan: Pemesan, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const [row] = await deps.db.select().from(pemesananPermintaanHakPakai).where(eq(pemesananPermintaanHakPakai.id, id));
  return row && row.pemohonAccountId === pemesan.accountId ? row : null;
}

/** The Pemegang Hak files a request the Admin Lokasi sent back for a fix again (Perlu Perbaikan ↺ Diajukan). */
export async function ajukanUlangPermintaanHakPakai(deps: PemesananDeps, pemesan: Pemesan, rawInput: unknown): Promise<UbahPermintaanHakPakaiResult> {
  const parsed = ajukanUlangPermintaanHakPakaiSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const row = await permintaanMilik(deps, pemesan, parsed.data.id);
  if (!row) return { ok: false, reason: "tidak_ditemukan" };
  if (row.status !== "perlu_perbaikan") return { ok: false, reason: "status_tidak_sesuai" };
  const now = deps.clock.now();
  const [diubah] = await deps.db
    .update(pemesananPermintaanHakPakai)
    .set({
      status: "diajukan",
      diajukanPada: now,
      tenggatPada: await tenggatJawaban(deps, row.lokasiId, now),
      catatanPemohon: parsed.data.catatan === "" ? row.catatanPemohon : parsed.data.catatan,
      diputuskanPada: null,
      diputuskanOleh: null,
      alasanKeputusan: null,
    })
    .where(and(eq(pemesananPermintaanHakPakai.id, row.id), eq(pemesananPermintaanHakPakai.status, "perlu_perbaikan")))
    .returning();
  return diubah ? { ok: true, permintaan: toPermintaan(diubah) } : { ok: false, reason: "status_tidak_sesuai" };
}

/** The Pemegang Hak withdraws its request before any decision (Diajukan or Perlu Perbaikan → Dibatalkan). */
export async function batalkanPermintaanHakPakai(deps: PemesananDeps, pemesan: Pemesan, rawInput: unknown): Promise<UbahPermintaanHakPakaiResult> {
  const parsed = permintaanHakPakaiIdSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const row = await permintaanMilik(deps, pemesan, parsed.data.id);
  if (!row) return { ok: false, reason: "tidak_ditemukan" };
  const [diubah] = await deps.db
    .update(pemesananPermintaanHakPakai)
    .set({ status: "dibatalkan", dibatalkanPada: deps.clock.now() })
    .where(and(eq(pemesananPermintaanHakPakai.id, row.id), inArray(pemesananPermintaanHakPakai.status, ["diajukan", "perlu_perbaikan"])))
    .returning();
  return diubah ? { ok: true, permintaan: toPermintaan(diubah) } : { ok: false, reason: "status_tidak_sesuai" };
}

/** The latest request of a Hak Pakai, whichever kind and state; null when there never was one. */
export async function permintaanHakPakaiTerakhir(deps: Pick<PemesananDeps, "db">, hakPakaiId: string): Promise<PermintaanHakPakai | null> {
  const [row] = await deps.db
    .select()
    .from(pemesananPermintaanHakPakai)
    .where(eq(pemesananPermintaanHakPakai.hakPakaiId, hakPakaiId))
    .orderBy(desc(pemesananPermintaanHakPakai.diajukanPada), desc(pemesananPermintaanHakPakai.id))
    .limit(1);
  return row ? toPermintaan(row) : null;
}

/** Every Diajukan request of one Lokasi Mitra, oldest first: what the Antrean Lokasi row shows. */
export async function antreanPermintaanHakPakai(deps: Pick<PemesananDeps, "db">, lokasiId: string): Promise<BarisAntreanPermintaanHakPakai[]> {
  const rows = await deps.db
    .select()
    .from(pemesananPermintaanHakPakai)
    .where(and(eq(pemesananPermintaanHakPakai.lokasiId, lokasiId), eq(pemesananPermintaanHakPakai.status, "diajukan")))
    .orderBy(pemesananPermintaanHakPakai.diajukanPada);
  return rows.map((row) => ({ id: row.id, jenis: row.jenis, unitNomor: row.unitNomor, diajukanPada: row.diajukanPada, tenggatPada: row.tenggatPada }));
}

type Penolakan = WriteRefusal | { ok: false; reason: "input_tidak_valid" | "tidak_ditemukan" | "sudah_diputuskan" };

/** The request, checked for this Admin Lokasi; the refusal otherwise. */
async function muatUntukLokasi(deps: PemesananDeps, by: Actor, id: string) {
  if (!z.uuid().safeParse(id).success) return { ok: false as const, penolakan: { ok: false as const, reason: "input_tidak_valid" as const } };
  const [row] = await deps.db.select().from(pemesananPermintaanHakPakai).where(eq(pemesananPermintaanHakPakai.id, id));
  if (!row) return { ok: false as const, penolakan: { ok: false as const, reason: "tidak_ditemukan" as const } };
  const refusal = writeRefusal(by, "permintaan_hak_pakai.putuskan", lokasiMitraResource(row.lokasiId));
  if (refusal) return { ok: false as const, penolakan: refusal };
  if (row.status !== "diajukan") return { ok: false as const, penolakan: { ok: false as const, reason: "sudah_diputuskan" as const } };
  return { ok: true as const, row };
}

export type SetujuiPermintaanHakPakaiResult =
  | { ok: true; permintaan: PermintaanHakPakai }
  | Penolakan
  /** The right can no longer be given back or transferred as the request asked. */
  | { ok: false; reason: Exclude<SebabPermintaanTerhalang, "sudah_ada_permintaan"> };

/**
 * Setuju. A Pengembalian ends the Hak Pakai (Berakhir, reason Pengembalian) and frees its plot; a Ganti
 * records the new Pemegang Hak (the history keeps the earlier one) and notes the Lokasi's offline fee.
 * One transaction and one Entri Audit.
 */
export async function setujuiPermintaanHakPakai(deps: PemesananDeps, by: Actor, rawInput: unknown): Promise<SetujuiPermintaanHakPakaiResult> {
  const parsed = setujuiPermintaanHakPakaiSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const dimuat = await muatUntukLokasi(deps, by, parsed.data.id);
  if (!dimuat.ok) return dimuat.penolakan;
  const { row } = dimuat;
  const now = deps.clock.now();
  const hakPakai = await deps.inventory.hakPakaiById(row.hakPakaiId);
  if (!hakPakai) return { ok: false, reason: "tidak_ditemukan" };

  if (row.jenis === "pengembalian") {
    if (hakPakai.status !== "aktif") return { ok: false, reason: "hak_pakai_sudah_berakhir" };
    if (hakPakai.pemakaman.length > 0) return { ok: false, reason: "sudah_ada_pemakaman" };
  } else {
    if (hakPakai.status !== "aktif") return { ok: false, reason: "hak_pakai_sudah_berakhir" };
    if (await pembatalanTerbuka(deps, row.hakPakaiId)) return { ok: false, reason: "pembatalan_terbuka" };
    if (await isBlockedByOverdueTagihan(deps, row.hakPakaiId)) return { ok: false, reason: "tagihan_lewat_jatuh_tempo" };
    // Re-checked here as well as at filing: a Lokasi that forbids sale transfers while the request is in flight still refuses it.
    if (row.sebab === "jual") {
      const aturanJual = await deps.lokasi.aturanGantiPemegangHak(row.lokasiId);
      if (!aturanJual?.saleTransfersAllowed) return { ok: false, reason: "jual_tidak_diizinkan" };
    }
  }

  return deps.audit.staffWrite<SetujuiPermintaanHakPakaiResult>(deps.db, async (tx, record) => {
    const [disetujui] = await tx
      .update(pemesananPermintaanHakPakai)
      .set({ status: "disetujui", diputuskanPada: now, diputuskanOleh: by.accountId, alasanKeputusan: null })
      .where(and(eq(pemesananPermintaanHakPakai.id, row.id), eq(pemesananPermintaanHakPakai.status, "diajukan")))
      .returning();
    if (!disetujui) return { ok: false, reason: "sudah_diputuskan" };
    const inventory = deps.inventory.within(tx);

    if (row.jenis === "pengembalian") {
      const berakhir = await inventory.kembalikanHakPakai({ hakPakaiId: row.hakPakaiId });
      if (!berakhir.ok) return { ok: false, reason: berakhir.reason === "pemakaman_sudah_dicatat" ? "sudah_ada_pemakaman" : "hak_pakai_sudah_berakhir" };
    } else {
      if (!row.pemegangBaruName || !row.pemegangBaruPhone) return { ok: false, reason: "input_tidak_valid" };
      const ganti = await inventory.gantiPemegangHak(by, row.lokasiId, {
        hakPakaiId: row.hakPakaiId,
        pemegangHak: { name: row.pemegangBaruName, phoneNumber: row.pemegangBaruPhone, email: row.pemegangBaruEmail ?? undefined },
        alasan: `Ganti Pemegang Hak (${row.sebab ?? "waris"})`,
        dokumen: row.dokumen,
      });
      if (!ganti.ok) return { ok: false, reason: "hak_pakai_sudah_berakhir" };
      const aturan = await deps.lokasi.aturanGantiPemegangHak(row.lokasiId);
      const biaya = parsed.data.biayaGantiOffline ?? aturan?.gantiPemegangHakFee ?? 0;
      await tx.update(pemesananPermintaanHakPakai).set({ biayaGantiOffline: biaya }).where(eq(pemesananPermintaanHakPakai.id, row.id));
    }

    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "permintaan_hak_pakai.setujui",
      entity: { kind: "permintaan_hak_pakai", id: row.id },
      lokasiId: row.lokasiId,
      before: { status: "diajukan", jenis: row.jenis },
      // No name, phone number or free text of the family goes into the Audit Log.
      after: { status: "disetujui", jenis: row.jenis, unit: row.unitNomor, sebab: row.sebab },
      reason: null,
    });
    // The update to `disetujui` is the row the caller reads back.
    return { ok: true, permintaan: toPermintaan(disetujui) };
  });
}

/** Tolak: nothing changes on the Hak Pakai; the request ends Ditolak with the Lokasi's reason. */
export async function tolakPermintaanHakPakai(deps: PemesananDeps, by: Actor, rawInput: unknown): Promise<UbahPermintaanHakPakaiResult> {
  const parsed = tolakPermintaanHakPakaiSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const dimuat = await muatUntukLokasi(deps, by, parsed.data.id);
  if (!dimuat.ok) return dimuat.penolakan;
  const now = deps.clock.now();
  return deps.audit.staffWrite<UbahPermintaanHakPakaiResult>(deps.db, async (tx, record) => {
    const [ditolak] = await tx
      .update(pemesananPermintaanHakPakai)
      .set({ status: "ditolak", diputuskanPada: now, diputuskanOleh: by.accountId, alasanKeputusan: parsed.data.alasan })
      .where(and(eq(pemesananPermintaanHakPakai.id, dimuat.row.id), eq(pemesananPermintaanHakPakai.status, "diajukan")))
      .returning();
    if (!ditolak) return { ok: false, reason: "status_tidak_sesuai" };
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "permintaan_hak_pakai.tolak",
      entity: { kind: "permintaan_hak_pakai", id: dimuat.row.id },
      lokasiId: dimuat.row.lokasiId,
      before: { status: "diajukan", jenis: dimuat.row.jenis },
      after: { status: "ditolak", jenis: dimuat.row.jenis, unit: dimuat.row.unitNomor },
      reason: parsed.data.alasan,
    });
    return { ok: true, permintaan: toPermintaan(ditolak) };
  });
}

/** Minta perbaikan: the request goes back to its requester with a note (Diajukan → Perlu Perbaikan). */
export async function mintaPerbaikanPermintaanHakPakai(deps: PemesananDeps, by: Actor, rawInput: unknown): Promise<UbahPermintaanHakPakaiResult> {
  const parsed = mintaPerbaikanPermintaanHakPakaiSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const dimuat = await muatUntukLokasi(deps, by, parsed.data.id);
  if (!dimuat.ok) return dimuat.penolakan;
  const now = deps.clock.now();
  return deps.audit.staffWrite<UbahPermintaanHakPakaiResult>(deps.db, async (tx, record) => {
    const [dikembalikan] = await tx
      .update(pemesananPermintaanHakPakai)
      .set({
        status: "perlu_perbaikan",
        putaran: dimuat.row.putaran + 1,
        diputuskanPada: now,
        diputuskanOleh: by.accountId,
        alasanKeputusan: parsed.data.catatan,
      })
      .where(and(eq(pemesananPermintaanHakPakai.id, dimuat.row.id), eq(pemesananPermintaanHakPakai.status, "diajukan")))
      .returning();
    if (!dikembalikan) return { ok: false, reason: "status_tidak_sesuai" };
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "permintaan_hak_pakai.minta_perbaikan",
      entity: { kind: "permintaan_hak_pakai", id: dimuat.row.id },
      lokasiId: dimuat.row.lokasiId,
      before: { status: "diajukan", jenis: dimuat.row.jenis },
      after: { status: "perlu_perbaikan", jenis: dimuat.row.jenis, unit: dimuat.row.unitNomor },
      reason: parsed.data.catatan,
    });
    return { ok: true, permintaan: toPermintaan(dikembalikan) };
  });
}

export type UbahCalonPenghuniResult =
  | { ok: true; calonPenghuni: string | null }
  | { ok: false; reason: "input_tidak_valid" | "tidak_ditemukan" | "hak_pakai_sudah_berakhir" };

/**
 * The Pemegang Hak changes one plot's Calon Penghuni label (or clears it): immediate, with no review
 * and no row, and the Lokasi Mitra's Admin Lokasi is notified.
 */
export async function ubahCalonPenghuni(deps: PemesananDeps, pemesan: Pemesan, rawInput: unknown): Promise<UbahCalonPenghuniResult> {
  const parsed = ubahCalonPenghuniSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const hakPakai = await hakPakaiMilik(deps, pemesan, parsed.data.hakPakaiId);
  if (!hakPakai) return { ok: false, reason: "tidak_ditemukan" };
  const diubah = await deps.inventory.ubahCalonPenghuni({ hakPakaiId: hakPakai.id, label: parsed.data.label });
  if (!diubah.ok) return { ok: false, reason: diubah.reason };
  const penerima = (await deps.identity.adminLokasiOf(hakPakai.lokasiId)).map((admin) => ({ accountId: admin.accountId }));
  await deps.notifikasi.calonPenghuniBerubah({
    hakPakaiId: hakPakai.id,
    lokasiId: hakPakai.lokasiId,
    unitNomor: hakPakai.unitNomor,
    label: parsed.data.label,
    penerima,
  });
  return { ok: true, calonPenghuni: parsed.data.label };
}
