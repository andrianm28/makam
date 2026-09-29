/**
 * The Admin Lokasi's answer to a Pembatalan request of a paid Pemesanan Terencana (spec, Pemesanan >
 * Requests from the Pemegang Hak: "the Admin Lokasi confirms no Pemakaman, the refund is computed from the
 * snapshot policy ..., then an Admin Platform refund row is created"; ticket 38). Three answers, each one
 * staff write in its own transaction and each audited on the Lokasi Mitra:
 *
 * - **Setuju**: the Lokasi confirms there is no Pemakaman. In one commit the Hak Pakai the request names becomes
 *   Dibatalkan (so its Petak is Tersedia again; the other Hak Pakai of the order carry on, and the order becomes
 *   Dibatalkan ("Pembatalan") only when none is left), the refund the request holds is asked of Refunds (Admin Platform's Tier 3 "Pembatalan refund approval" row, due 2
 *   Hari Kerja on its calendar), and the family is told. A refund of nothing (a Syarat that gives 0% after the
 *   Masa Pembatalan) raises no refund request at all: the right ends and the money stays with the Lokasi Mitra.
 *   A refusal anywhere rolls all of it back, so a Hak Pakai never ends with its money unasked for.
 * - **Tolak**: with a reason; nothing changes on the Hak Pakai and the family is told why.
 * - **Minta perbaikan**: the request goes back to the requester with a note; its Antrean Lokasi row closes
 *   until it is filed again.
 *
 * "There is no Pemakaman" is not taken on the caller's word: the Hak Pakai is read again inside the commit,
 * and Inventory itself refuses to end one with a grave dug under it.
 */
import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { lokasiMitraResource, normaliseEmail, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { addWorkingDays } from "@/domain/lokasi";
import type { PemesananDeps } from "./deps";
import { sebabTerhalang, type SebabPembatalanTerhalang } from "./pembatalan-terencana";
import { toPermintaan, type PermintaanPembatalan } from "./reads-pembatalan-terencana";
import { pemesananTerencana, permintaanPembatalanTerencana } from "./schema";
import {
  mintaPerbaikanPembatalanTerencanaSchema,
  permintaanPembatalanTerencanaSchema,
  tolakPembatalanTerencanaSchema,
} from "./skema-pembatalan";
import { nomorUnit, unitsOfOrder } from "./terencana-unit";

/** How soon Admin Platform must approve the refund an approved Pembatalan raised: 2 Hari Kerja (spec, Work Queues, Tier 3). */
export const TENGGAT_PERSETUJUAN_REFUND_HARI_KERJA = 2;

/** The refusals every answer shares. */
type Penolakan =
  | WriteRefusal
  | { ok: false; reason: "input_tidak_valid" | "tidak_ditemukan" }
  /** The request is not Diajukan (already answered, withdrawn, or sent back and not filed again). */
  | { ok: false; reason: "sudah_diputuskan" };

export type SetujuiPembatalanResult =
  | { ok: true; permintaan: PermintaanPembatalan; pengembalian: { permintaanId: string } | null }
  | Penolakan
  /** A Pemakaman, a Ganti Pemegang Hak, an ended Hak Pakai or an order that is no longer Aktif: the Pembatalan is no longer allowed. */
  | { ok: false; reason: Exclude<SebabPembatalanTerhalang, "sudah_ada_permintaan"> }
  /** Refunds could not take the refund (another refund of this Tagihan is being processed): nothing was changed. */
  | { ok: false; reason: "pengembalian_tidak_bisa_diajukan" };

export type KeputusanPembatalanResult = { ok: true; permintaan: PermintaanPembatalan } | Penolakan;

/** The request and its order, checked for this Admin Lokasi; the refusal otherwise. */
async function muat(deps: PemesananDeps, by: Actor, id: string) {
  const [row] = await deps.db.select().from(permintaanPembatalanTerencana).where(eq(permintaanPembatalanTerencana.id, id));
  if (!row) return { ok: false as const, penolakan: { ok: false as const, reason: "tidak_ditemukan" as const } };
  const refusal = writeRefusal(by, "pembatalan.putuskan", lokasiMitraResource(row.lokasiId));
  if (refusal) return { ok: false as const, penolakan: refusal };
  if (row.status !== "diajukan") return { ok: false as const, penolakan: { ok: false as const, reason: "sudah_diputuskan" as const } };
  const [order] = await deps.db.select().from(pemesananTerencana).where(eq(pemesananTerencana.id, row.pemesananId));
  if (!order) return { ok: false as const, penolakan: { ok: false as const, reason: "tidak_ditemukan" as const } };
  return { ok: true as const, row, order };
}

/**
 * Setuju: the Hak Pakai are Dibatalkan, the order is Dibatalkan, the refund is asked and the family is
 * told, in one transaction and one Entri Audit.
 */
export async function setujuiPembatalanTerencana(deps: PemesananDeps, by: Actor, rawInput: unknown): Promise<SetujuiPembatalanResult> {
  const parsed = permintaanPembatalanTerencanaSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const dimuat = await muat(deps, by, parsed.data.id);
  if (!dimuat.ok) return dimuat.penolakan;
  const { row, order } = dimuat;

  const units = await unitsOfOrder(deps.db, order.id);
  const satuUnit = units.find((satu) => satu.hakPakaiId === row.hakPakaiId);
  const hakPakai = await deps.inventory.hakPakaiById(row.hakPakaiId);
  if (!satuUnit || !hakPakai) return { ok: false, reason: "tidak_ditemukan" };
  const sebab = sebabTerhalang(order, hakPakai, false);
  if (sebab) return { ok: false, reason: sebab as Exclude<SebabPembatalanTerhalang, "sudah_ada_permintaan"> };
  // The order ends with its last Hak Pakai: the others on it, read now, decide whether this one is the last still standing.
  const lain = await Promise.all(units.filter((satu) => satu.hakPakaiId && satu.hakPakaiId !== row.hakPakaiId).map((satu) => deps.inventory.hakPakaiById(satu.hakPakaiId!)));
  const terakhir = lain.every((satu) => satu?.status === "dibatalkan");

  const now = deps.clock.now();
  const kalender = row.jumlahRefund > 0 ? await deps.lokasi.adminPlatformCalendar() : null;
  const tenggatRefund = kalender ? addWorkingDays(kalender, now, TENGGAT_PERSETUJUAN_REFUND_HARI_KERJA) : null;
  if (tenggatRefund && !tenggatRefund.ok) throw new Error(`the Admin Platform calendar has no Hari Kerja ahead of ${now.toISOString()}`);
  const unit = [{ nomor: nomorUnit(satuUnit), jenisMakamName: satuUnit.jenisMakamName }];

  return deps.audit.staffWrite<SetujuiPembatalanResult>(deps.db, async (tx, record) => {
    const disetujui = await tx
      .update(permintaanPembatalanTerencana)
      .set({ status: "disetujui", diputuskanPada: now, diputuskanOleh: by.accountId, alasanKeputusan: null })
      .where(and(eq(permintaanPembatalanTerencana.id, row.id), eq(permintaanPembatalanTerencana.status, "diajukan")))
      .returning({ id: permintaanPembatalanTerencana.id });
    if (disetujui.length === 0) return { ok: false, reason: "sudah_diputuskan" };

    // The right ends and the plot sells again; the order's other Hak Pakai carry on.
    const berakhir = await deps.inventory.within(tx).batalkanHakPakai({ hakPakaiId: row.hakPakaiId, alasan: "Pembatalan disetujui Lokasi Mitra" });
    if (!berakhir.ok) return { ok: false, reason: berakhir.reason === "pemakaman_sudah_dicatat" ? "sudah_ada_pemakaman" : "hak_pakai_sudah_berakhir" };
    if (terakhir) {
      const dibatalkan = await tx
        .update(pemesananTerencana)
        .set({ status: "dibatalkan", dibatalkanPada: now, alasan: "pembatalan" })
        .where(and(eq(pemesananTerencana.id, order.id), eq(pemesananTerencana.status, "aktif")))
        .returning({ id: pemesananTerencana.id });
      if (dibatalkan.length === 0) return { ok: false, reason: "pesanan_tidak_aktif" };
    }

    // The refund the family was shown, asked of Refunds in this same commit. The Tagihan is Dikembalikan penuh only when,
    // with this one, everything the fee rule returns has been refunded in full: Refunds decides that from the whole Tagihan.
    let pengembalian: { permintaanId: string } | null = null;
    if (row.jumlahRefund > 0) {
      if (!order.tagihanId) throw new Error("a paid Pemesanan Terencana has no Tagihan to refund");
      const diminta = await deps.refunds.ajukanBaris(order.tagihanId, { pihakBersalah: "pemesan", penuhBilaLengkap: row.persenRefund === 100, lines: row.lines }, tx);
      if (!diminta.ok) return { ok: false, reason: "pengembalian_tidak_bisa_diajukan" };
      pengembalian = { permintaanId: diminta.permintaanId };
      await tx
        .update(permintaanPembatalanTerencana)
        .set({ permintaanPengembalianId: diminta.permintaanId, persetujuanRefundTenggatPada: tenggatRefund?.ok ? tenggatRefund.at : null })
        .where(eq(permintaanPembatalanTerencana.id, row.id));
    }

    await umumkanDisetujui(deps, tx, row, order, unit);
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "pembatalan_terencana.setujui",
      entity: { kind: "permintaan_pembatalan_terencana", id: row.id },
      lokasiId: order.lokasiId,
      before: { status: "diajukan", pesanan: "aktif" },
      // Amounts and numbers only: no name, email or free text of the family goes into the Audit Log.
      after: {
        status: "disetujui",
        pesanan: terakhir ? "dibatalkan" : "aktif",
        nomorPemesanan: order.nomor,
        persenRefund: row.persenRefund,
        jumlahRefund: row.jumlahRefund,
        unit: unit.map((satu) => satu.nomor),
      },
      reason: null,
    });
    const [setelah] = await tx.select().from(permintaanPembatalanTerencana).where(eq(permintaanPembatalanTerencana.id, row.id));
    return { ok: true, permintaan: toPermintaan(setelah), pengembalian };
  });
}

/**
 * The approval is told to the Pemesan who paid (who is asked for the bank account when a refund is due) and,
 * when the Pemegang Hak who asked is somebody else, to that person too. One email when they are the same.
 */
async function umumkanDisetujui(
  deps: PemesananDeps,
  tx: Database,
  row: typeof permintaanPembatalanTerencana.$inferSelect,
  order: typeof pemesananTerencana.$inferSelect,
  unit: { nomor: string; jenisMakamName: string }[],
): Promise<void> {
  const dasar = {
    peristiwa: "disetujui" as const,
    permintaanId: row.id,
    nomor: order.nomor,
    lokasi: { id: order.lokasiId, name: order.lokasiName },
    unit,
    persenRefund: row.persenRefund,
    jumlahRefund: row.jumlahRefund,
    dalamMasaPembatalan: row.dalamMasaPembatalan,
  };
  await deps.notifikasi.pembatalanTerencana(tx, { ...dasar, kepada: "pemesan", email: order.email });
  if (normaliseEmail(row.pemohonEmail) !== normaliseEmail(order.email)) {
    await deps.notifikasi.pembatalanTerencana(tx, { ...dasar, kepada: "pemohon", email: row.pemohonEmail });
  }
}

/** The Jenis Makam of one plot of an order, for the family's message; the plot number is the request's own. */
async function jenisMakamOf(deps: PemesananDeps, pemesananId: string, unitNomor: string): Promise<string> {
  return (await unitsOfOrder(deps.db, pemesananId)).find((satu) => nomorUnit(satu) === unitNomor)?.jenisMakamName ?? "Makam";
}

/** Tolak: nothing changes on the Hak Pakai, and the family is told why. */
export async function tolakPembatalanTerencana(deps: PemesananDeps, by: Actor, rawInput: unknown): Promise<KeputusanPembatalanResult> {
  const parsed = tolakPembatalanTerencanaSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const dimuat = await muat(deps, by, parsed.data.id);
  if (!dimuat.ok) return dimuat.penolakan;
  const { row, order } = dimuat;
  const unit = [{ nomor: row.unitNomor, jenisMakamName: await jenisMakamOf(deps, order.id, row.unitNomor) }];
  const now = deps.clock.now();
  return deps.audit.staffWrite<KeputusanPembatalanResult>(deps.db, async (tx, record) => {
    const [ditolak] = await tx
      .update(permintaanPembatalanTerencana)
      .set({ status: "ditolak", diputuskanPada: now, diputuskanOleh: by.accountId, alasanKeputusan: parsed.data.alasan })
      .where(and(eq(permintaanPembatalanTerencana.id, row.id), eq(permintaanPembatalanTerencana.status, "diajukan")))
      .returning();
    if (!ditolak) return { ok: false, reason: "sudah_diputuskan" };
    await deps.notifikasi.pembatalanTerencana(tx, {
      peristiwa: "ditolak",
      permintaanId: row.id,
      nomor: order.nomor,
      email: row.pemohonEmail,
      lokasi: { id: order.lokasiId, name: order.lokasiName },
      unit,
      alasan: parsed.data.alasan,
    });
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "pembatalan_terencana.tolak",
      entity: { kind: "permintaan_pembatalan_terencana", id: row.id },
      lokasiId: order.lokasiId,
      before: { status: "diajukan" },
      after: { status: "ditolak", nomorPemesanan: order.nomor },
      reason: parsed.data.alasan,
    });
    return { ok: true, permintaan: toPermintaan(ditolak) };
  });
}

/** Minta perbaikan: the request goes back to its requester with a note (Diajukan → Perlu Perbaikan), and its row leaves the Antrean Lokasi. */
export async function mintaPerbaikanPembatalanTerencana(deps: PemesananDeps, by: Actor, rawInput: unknown): Promise<KeputusanPembatalanResult> {
  const parsed = mintaPerbaikanPembatalanTerencanaSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const dimuat = await muat(deps, by, parsed.data.id);
  if (!dimuat.ok) return dimuat.penolakan;
  const { row, order } = dimuat;
  const unit = [{ nomor: row.unitNomor, jenisMakamName: await jenisMakamOf(deps, order.id, row.unitNomor) }];
  const now = deps.clock.now();
  return deps.audit.staffWrite<KeputusanPembatalanResult>(deps.db, async (tx, record) => {
    const [dikembalikan] = await tx
      .update(permintaanPembatalanTerencana)
      .set({
        status: "perlu_perbaikan",
        putaran: row.putaran + 1,
        diputuskanPada: now,
        diputuskanOleh: by.accountId,
        alasanKeputusan: parsed.data.catatan,
      })
      .where(and(eq(permintaanPembatalanTerencana.id, row.id), eq(permintaanPembatalanTerencana.status, "diajukan")))
      .returning();
    if (!dikembalikan) return { ok: false, reason: "sudah_diputuskan" };
    await deps.notifikasi.pembatalanTerencana(tx, {
      peristiwa: "perlu_perbaikan",
      permintaanId: row.id,
      nomor: order.nomor,
      email: row.pemohonEmail,
      lokasi: { id: order.lokasiId, name: order.lokasiName },
      unit,
      putaran: dikembalikan.putaran,
      catatan: parsed.data.catatan,
    });
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "pembatalan_terencana.minta_perbaikan",
      entity: { kind: "permintaan_pembatalan_terencana", id: row.id },
      lokasiId: order.lokasiId,
      before: { status: "diajukan" },
      after: { status: "perlu_perbaikan", nomorPemesanan: order.nomor },
      reason: parsed.data.catatan,
    });
    return { ok: true, permintaan: toPermintaan(dikembalikan) };
  });
}
