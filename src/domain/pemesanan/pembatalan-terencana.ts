/**
 * A Pemegang Hak's Pembatalan of a paid Pemesanan Terencana (spec, Pemesanan > Requests from the Pemegang
 * Hak; stories 102 and 107; ticket 38). This file is the requester's half: seeing what "Ajukan Pembatalan"
 * would refund before asking, asking, filing the request again after the Admin Lokasi sent it back for a
 * fix, and withdrawing it before any decision. The Admin Lokasi's answer is `./pembatalan-terencana-lokasi.ts`.
 *
 * - **Who may ask** is the Pemegang Hak of the Hak Pakai, told apart the way Akun Saya's Makam tab tells
 *   them: the Akun's Email Terverifikasi equals the email recorded on the Hak Pakai's current holder
 *   (ADR 0004). The Pemesan who paid may be somebody else, and is asked for the bank account later.
 * - **The order is cancelled as a whole.** A Terencana order is one Tagihan paid once for every plot on it,
 *   so the request names one Hak Pakai but ends all of them together, and every one of them must still be
 *   cancellable: Aktif, with no Pemakaman under it and no Ganti Pemegang Hak before.
 * - **The refund is fixed at the first filing** from the order's own Syarat snapshot (`./pembatalan-terencana-hitung.ts`).
 *   Sending the request back for a fix and filing it again keeps that figure.
 * - The Lokasi Mitra's answer is due in **2 Hari Kerja** on its own Jam Operasional calendar (ticket 11); the
 *   Antrean Lokasi row exists while the request is Diajukan. Nothing here is a staff write, so nothing is
 *   audited: a family acting on its own request is not staff.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { normaliseEmail } from "@/domain/identity";
import type { HakPakaiDetail } from "@/domain/inventory";
import { addWorkingDays } from "@/domain/lokasi";
import type { Pemesan, PemesananDeps } from "./deps";
import { hitungPembatalanTerencana, type HitungPembatalan } from "./pembatalan-terencana-hitung";
import { toPermintaan, type PermintaanPembatalan } from "./reads-pembatalan-terencana";
import { pemesananTerencana, pemesananTerencanaUnit, permintaanPembatalanTerencana } from "./schema";
import {
  ajukanPembatalanTerencanaSchema,
  ajukanUlangPembatalanTerencanaSchema,
  permintaanPembatalanTerencanaSchema,
} from "./skema-pembatalan";
import { nomorUnit, unitsOfOrder, type UnitRow } from "./terencana-unit";

/** How soon the Lokasi Mitra must answer: 2 Hari Kerja (spec, Work Queues: requests from the Pemegang Hak). */
export const TENGGAT_PEMBATALAN_HARI_KERJA = 2;

/** Why "Ajukan Pembatalan" is not offered for a Hak Pakai. */
export type SebabPembatalanTerhalang =
  /** The order is not Aktif any more: unpaid, declined, withdrawn, or already cancelled. */
  | "pesanan_tidak_aktif"
  /** A Hak Pakai of the order has ended (Kedaluwarsa, Berakhir or Dibatalkan). */
  | "hak_pakai_sudah_berakhir"
  /** A Pembatalan request of this order is open (Diajukan, or sent back for a fix). */
  | "sudah_ada_permintaan"
  /** A Pemakaman is recorded under a Hak Pakai of the order: the grave is dug. */
  | "sudah_ada_pemakaman"
  /** A Ganti Pemegang Hak already happened on a Hak Pakai of the order. */
  | "pernah_ganti_pemegang_hak";

/** One Hak Pakai of a paid Terencana order as its Pemegang Hak sees its Pembatalan. */
export interface PembatalanHakPakai {
  hakPakaiId: string;
  nomor: string;
  lokasi: { id: string; name: string };
  /** Every plot the order covers, since it is cancelled together. */
  unit: { nomor: string; jenisMakamName: string }[];
  /** The Syarat the order was placed under: what the refund follows. */
  syarat: { masaPembatalanDays: number; refundAfterMasaPembatalanPercent: number };
  masaPembatalanBerakhirPada: Date | null;
  /** The request in progress, else the latest one that ended; null when there never was one. */
  permintaan: PermintaanPembatalan | null;
  /** What asking now would refund, or why it cannot be asked. */
  bisaMengajukan: { ok: true; refund: HitungPembatalan } | { ok: false; sebab: SebabPembatalanTerhalang };
}

export type PratinjauPembatalanResult = { ok: true; pembatalan: PembatalanHakPakai } | { ok: false; reason: "tidak_ditemukan" };

interface Konteks {
  order: typeof pemesananTerencana.$inferSelect;
  units: UnitRow[];
  hakPakai: HakPakaiDetail[];
  /** The Hak Pakai the caller named. */
  diminta: HakPakaiDetail;
}

/** The order a Hak Pakai belongs to, with every Hak Pakai on it; null when it is no Terencana order's, or is not this Akun's to cancel. */
async function muatKonteks(deps: PemesananDeps, pemesan: Pemesan, hakPakaiId: string): Promise<Konteks | null> {
  const [unit] = await deps.db.select().from(pemesananTerencanaUnit).where(eq(pemesananTerencanaUnit.hakPakaiId, hakPakaiId));
  if (!unit) return null;
  const [order] = await deps.db.select().from(pemesananTerencana).where(eq(pemesananTerencana.id, unit.pemesananId));
  if (!order) return null;
  const units = await unitsOfOrder(deps.db, order.id);
  const semua = await Promise.all(units.flatMap((satu) => (satu.hakPakaiId ? [deps.inventory.hakPakaiById(satu.hakPakaiId)] : [])));
  const hakPakai = semua.flatMap((satu) => (satu ? [satu] : []));
  const diminta = hakPakai.find((satu) => satu.id === hakPakaiId);
  if (!diminta) return null;
  // The Pemegang Hak is who the Hak Pakai names, by the Email Terverifikasi (ADR 0004): anybody else is told nothing found.
  const email = normaliseEmail(pemesan.email);
  const pemegang = diminta.pemegangHak?.email ? normaliseEmail(diminta.pemegangHak.email) : null;
  if (!email || !pemegang || email !== pemegang) return null;
  return { order, units, hakPakai, diminta };
}

/** Whether every Hak Pakai of the order can still be given back, or the first reason it cannot. */
export function sebabTerhalang(order: { status: string }, hakPakai: readonly HakPakaiDetail[], adaPermintaanTerbuka: boolean): SebabPembatalanTerhalang | null {
  if (order.status !== "aktif") return "pesanan_tidak_aktif";
  if (hakPakai.some((satu) => satu.status !== "aktif")) return "hak_pakai_sudah_berakhir";
  if (adaPermintaanTerbuka) return "sudah_ada_permintaan";
  if (hakPakai.some((satu) => satu.pemakaman.length > 0)) return "sudah_ada_pemakaman";
  if (hakPakai.some((satu) => satu.pernahGantiPemegangHak)) return "pernah_ganti_pemegang_hak";
  return null;
}

async function permintaanTerbuka(deps: Pick<PemesananDeps, "db">, pemesananId: string) {
  const [row] = await deps.db
    .select()
    .from(permintaanPembatalanTerencana)
    .where(and(eq(permintaanPembatalanTerencana.pemesananId, pemesananId), inArray(permintaanPembatalanTerencana.status, ["diajukan", "perlu_perbaikan"])));
  return row ?? null;
}

async function permintaanTerakhir(deps: Pick<PemesananDeps, "db">, pemesananId: string) {
  const [row] = await deps.db
    .select()
    .from(permintaanPembatalanTerencana)
    .where(eq(permintaanPembatalanTerencana.pemesananId, pemesananId))
    .orderBy(desc(permintaanPembatalanTerencana.diajukanPada), desc(permintaanPembatalanTerencana.id))
    .limit(1);
  return row ?? null;
}

/** The refund asking now would give, from the order's own Tagihan and Syarat; null when the order's Tagihan cannot be read. */
async function hitungSekarang(deps: PemesananDeps, order: typeof pemesananTerencana.$inferSelect, sekarang: Date): Promise<HitungPembatalan | null> {
  if (!order.tagihanId || !order.masaPembatalanBerakhirPada) return null;
  const tagihan = await deps.billing.tagihan(order.tagihanId);
  if (!tagihan) return null;
  return hitungPembatalanTerencana({
    lines: tagihan.lines,
    syarat: order.syarat,
    masaPembatalanBerakhirPada: order.masaPembatalanBerakhirPada,
    sekarang,
    nomorPemesanan: order.nomor,
    lokasiId: order.lokasiId,
  });
}

/**
 * The Makam tab's "Ajukan Pembatalan": for one Hak Pakai of a paid Terencana order whose Pemegang Hak this
 * Akun is, what asking would refund under the order's own Syarat, or why it cannot be asked. Nothing is
 * written. Anyone else, and a Hak Pakai that is no Terencana order's, is nothing found.
 */
export async function pratinjauPembatalanTerencana(deps: PemesananDeps, pemesan: Pemesan, hakPakaiId: string): Promise<PratinjauPembatalanResult> {
  if (!z.uuid().safeParse(hakPakaiId).success) return { ok: false, reason: "tidak_ditemukan" };
  const konteks = await muatKonteks(deps, pemesan, hakPakaiId);
  if (!konteks) return { ok: false, reason: "tidak_ditemukan" };
  const { order, units, diminta } = konteks;
  const terbuka = await permintaanTerbuka(deps, order.id);
  const terakhir = terbuka ?? (await permintaanTerakhir(deps, order.id));
  const sebab = sebabTerhalang(order, konteks.hakPakai, terbuka !== null);
  const refund = sebab ? null : await hitungSekarang(deps, order, deps.clock.now());
  return {
    ok: true,
    pembatalan: {
      hakPakaiId: diminta.id,
      nomor: order.nomor,
      lokasi: { id: order.lokasiId, name: order.lokasiName },
      unit: units.map((satu) => ({ nomor: nomorUnit(satu), jenisMakamName: satu.jenisMakamName })),
      syarat: { masaPembatalanDays: order.syarat.masaPembatalanDays, refundAfterMasaPembatalanPercent: order.syarat.refundAfterMasaPembatalanPercent },
      masaPembatalanBerakhirPada: order.masaPembatalanBerakhirPada,
      permintaan: terakhir ? toPermintaan(terakhir) : null,
      bisaMengajukan: sebab ? { ok: false, sebab } : refund ? { ok: true, refund } : { ok: false, sebab: "pesanan_tidak_aktif" },
    },
  };
}

/** When the Lokasi Mitra must answer a request filed at `sekarang`, or null while its Jam Operasional is belum diisi. */
async function tenggatJawaban(deps: Pick<PemesananDeps, "lokasi">, lokasiId: string, sekarang: Date): Promise<Date | null> {
  const jam = await deps.lokasi.jamOperasionalOf(lokasiId);
  if (!jam.ok) return null;
  const tenggat = addWorkingDays(jam.jamOperasional, sekarang, TENGGAT_PEMBATALAN_HARI_KERJA);
  return tenggat.ok ? tenggat.at : null;
}

export type AjukanPembatalanResult =
  | { ok: true; permintaan: PermintaanPembatalan }
  | { ok: false; reason: "input_tidak_valid" | "tidak_ditemukan" }
  | { ok: false; reason: SebabPembatalanTerhalang };

/**
 * "Ajukan Pembatalan": the request is written Diajukan with the refund the order's Syarat gives at this
 * moment, and the Antrean Lokasi has its row, due in 2 Hari Kerja. Only the Pemegang Hak of a Hak Pakai that
 * can still be given back may ask, and only once at a time.
 */
export async function ajukanPembatalanTerencana(deps: PemesananDeps, pemesan: Pemesan, rawInput: unknown): Promise<AjukanPembatalanResult> {
  const parsed = ajukanPembatalanTerencanaSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const konteks = await muatKonteks(deps, pemesan, parsed.data.hakPakaiId);
  if (!konteks) return { ok: false, reason: "tidak_ditemukan" };
  const { order } = konteks;
  const terbuka = await permintaanTerbuka(deps, order.id);
  const sebab = sebabTerhalang(order, konteks.hakPakai, terbuka !== null);
  if (sebab) return { ok: false, reason: sebab };
  const now = deps.clock.now();
  const refund = await hitungSekarang(deps, order, now);
  if (!refund) return { ok: false, reason: "pesanan_tidak_aktif" };
  const tenggatPada = await tenggatJawaban(deps, order.lokasiId, now);

  const [dibuat] = await deps.db
    .insert(permintaanPembatalanTerencana)
    .values({
      pemesananId: order.id,
      nomorPemesanan: order.nomor,
      lokasiId: order.lokasiId,
      status: "diajukan",
      pemohonAccountId: pemesan.accountId,
      pemohonEmail: pemesan.email,
      catatanPemohon: parsed.data.catatan === "" ? null : parsed.data.catatan,
      dalamMasaPembatalan: refund.dalamMasaPembatalan,
      persenRefund: refund.persenRefund,
      jumlahRefund: refund.jumlahRefund,
      lines: refund.lines,
      putaran: 0,
      diajukanPada: now,
      tenggatPada,
    })
    .onConflictDoNothing()
    .returning();
  // Two filings at once: the second finds the first, and there is still one request.
  if (!dibuat) return { ok: false, reason: "sudah_ada_permintaan" };
  return { ok: true, permintaan: toPermintaan(dibuat) };
}

export type UbahPermintaanResult =
  | { ok: true; permintaan: PermintaanPembatalan }
  | { ok: false; reason: "input_tidak_valid" | "tidak_ditemukan" }
  /** The request is not in the state this step needs (already decided, already withdrawn, or not sent back). */
  | { ok: false; reason: "status_tidak_sesuai" };

/** One request of this Akun, or null: another Akun's request is nothing found. */
async function permintaanMilik(deps: Pick<PemesananDeps, "db">, pemesan: Pemesan, id: string) {
  const [row] = await deps.db.select().from(permintaanPembatalanTerencana).where(eq(permintaanPembatalanTerencana.id, id));
  return row && row.pemohonAccountId === pemesan.accountId ? row : null;
}

/**
 * The Pemegang Hak files a request the Admin Lokasi sent back for a fix again (Perlu Perbaikan ↺ Diajukan): it
 * is Diajukan afresh with a new 2 Hari Kerja deadline, its Antrean Lokasi row is back, and the **refund keeps
 * the figure of the first filing**. A new note replaces the old one when the family writes one.
 */
export async function ajukanUlangPembatalanTerencana(deps: PemesananDeps, pemesan: Pemesan, rawInput: unknown): Promise<UbahPermintaanResult> {
  const parsed = ajukanUlangPembatalanTerencanaSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const row = await permintaanMilik(deps, pemesan, parsed.data.id);
  if (!row) return { ok: false, reason: "tidak_ditemukan" };
  if (row.status !== "perlu_perbaikan") return { ok: false, reason: "status_tidak_sesuai" };
  const now = deps.clock.now();
  const tenggatPada = await tenggatJawaban(deps, row.lokasiId, now);
  const [diubah] = await deps.db
    .update(permintaanPembatalanTerencana)
    .set({
      status: "diajukan",
      diajukanPada: now,
      tenggatPada,
      catatanPemohon: parsed.data.catatan === "" ? row.catatanPemohon : parsed.data.catatan,
      diputuskanPada: null,
      diputuskanOleh: null,
      alasanKeputusan: null,
    })
    .where(and(eq(permintaanPembatalanTerencana.id, row.id), eq(permintaanPembatalanTerencana.status, "perlu_perbaikan")))
    .returning();
  return diubah ? { ok: true, permintaan: toPermintaan(diubah) } : { ok: false, reason: "status_tidak_sesuai" };
}

/**
 * The Pemegang Hak withdraws its request before any decision (Diajukan or Perlu Perbaikan → Dibatalkan): the
 * Antrean Lokasi row is gone, nothing was changed on the Hak Pakai, and the family may ask again.
 */
export async function batalkanPermintaanPembatalanTerencana(deps: PemesananDeps, pemesan: Pemesan, rawInput: unknown): Promise<UbahPermintaanResult> {
  const parsed = permintaanPembatalanTerencanaSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const row = await permintaanMilik(deps, pemesan, parsed.data.id);
  if (!row) return { ok: false, reason: "tidak_ditemukan" };
  const [diubah] = await deps.db
    .update(permintaanPembatalanTerencana)
    .set({ status: "dibatalkan", dibatalkanPada: deps.clock.now() })
    .where(and(eq(permintaanPembatalanTerencana.id, row.id), inArray(permintaanPembatalanTerencana.status, ["diajukan", "perlu_perbaikan"])))
    .returning();
  return diubah ? { ok: true, permintaan: toPermintaan(diubah) } : { ok: false, reason: "status_tidak_sesuai" };
}
