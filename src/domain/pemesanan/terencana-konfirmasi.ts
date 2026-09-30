/**
 * The Lokasi Mitra's answer to a Pemesanan Terencana, the payment hold it starts, and
 * how that hold ends without a payment (spec, Pemesanan > Terencana: Diajukan (plots
 * held) → Dikonfirmasi (hold running, pay-first Tagihan due at hold expiry) → Aktif,
 * plus Ditolak and Dibatalkan; ticket 37):
 *
 * - **Konfirmasi**: the Admin Lokasi confirms and, in one transaction, the payment hold
 *   starts (Lokasi policy, 24 h by default), the pay-first Tagihan is issued and due
 *   when the hold ends, the family gets one email carrying both the order and the
 *   Tagihan, and an Entri Audit is written. No plot is chosen here: the Pemesan already
 *   chose them on the Denah, and they have been held since submission.
 * - **Tolak**: the Admin Lokasi declines with a reason off the closed list. The order
 *   becomes Ditolak, the plots are released and the family is sent back to the Lokasi
 *   step.
 * - **Tarik**: the Pemesan withdraws, free, any time before paying. A confirmed order's
 *   Tagihan is cancelled and the plots are released; a Tagihan already paid is
 *   never cancelled here (that is a Pembatalan, ticket 38).
 * - **Lewat batas bayar** (the scheduler's tick): a confirmed order whose hold ran out
 *   unpaid becomes Dibatalkan ("batas pembayaran lewat") and its plots are released.
 *
 * The order of the writes matters, because a payment settles a Tagihan and then
 * changes the order: **every path that changes both takes the Tagihan's lock first**
 * (`batalkanTagihan`), and only then changes the order row with a conditional
 * `UPDATE ... WHERE status = ...`. Taking the order first would deadlock against a
 * payment settling the same Tagihan, and whichever loses that race must lose cleanly:
 * a payment that settles first makes the withdrawal refuse, and one that arrives after
 * finds a Dibatalkan Tagihan.
 */
import { and, eq, lte } from "drizzle-orm";
import { z } from "zod";
import { refusable } from "@/db/unit-of-work";
import { withinPaymentCap } from "@/domain/billing";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { nextWorkingDayEnd } from "@/domain/lokasi";
import { ALASAN_TOLAK, alasanTolakTerencanaSchema, type AlasanTolakTerencana } from "./alasan-tolak";
import type { Pemesan, PemesananDeps } from "./deps";
import { linesOf } from "./konfirmasi-saat-duka";
import { pemesananTerencana, pemesananTerencanaUnit } from "./schema";
import { nomorUnit, unitsOfOrder } from "./terencana-unit";

const nomorSchema = z.string().trim().regex(/^MKM-\d{4}-\d{6}$/);

/** What the Admin Lokasi's confirm form sends: the order, and nothing else — its plots were chosen by the Pemesan. */
export const konfirmasiTerencanaSchema = z.object({ nomor: nomorSchema });
export type KonfirmasiTerencanaInput = z.infer<typeof konfirmasiTerencanaSchema>;

/** What the Admin Lokasi's decline form sends: a reason off the closed list. */
export const tolakTerencanaSchema = z.object({ nomor: nomorSchema, alasan: alasanTolakTerencanaSchema });
export type TolakTerencanaInput = z.infer<typeof tolakTerencanaSchema>;

/** What the Pemesan's withdrawal sends. */
export const tarikTerencanaSchema = z.object({ nomor: nomorSchema });
export type TarikTerencanaInput = z.infer<typeof tarikTerencanaSchema>;

export type KonfirmasiTerencanaResult =
  | {
      ok: true;
      pesanan: { nomor: string; status: "dikonfirmasi"; tahanSampai: Date };
      tagihan: { id: string; nomorTagihan: string; total: number; dueAt: Date; kind: "pay_first"; link: string };
    }
  | WriteRefusal
  | { ok: false; reason: "input_tidak_valid" }
  | { ok: false; reason: "pesanan_tidak_ditemukan" }
  /** Already Dikonfirmasi (or Aktif): its hold and its Tagihan stand. */
  | { ok: false; reason: "pesanan_sudah_dikonfirmasi" }
  /** Ditolak or Dibatalkan: there is nothing to confirm. */
  | { ok: false; reason: "pesanan_sudah_ditutup" }
  /** A chosen Jenis Makam can no longer be priced. */
  | { ok: false; reason: "harga_tidak_tersedia" }
  /** The total is past the Rp 10.000.000 QRIS cap v1 takes. */
  | { ok: false; reason: "melebihi_batas_qris"; total: number }
  /** The Lokasi Mitra is not there any more, so its hold policy cannot be read. */
  | { ok: false; reason: "lokasi_tidak_terbuka" }
  /** A Tagihan could not be issued (no Pengaturan Operator, a total past a cap): nothing at all is written. */
  | { ok: false; reason: "tagihan_tidak_terbit" };

/**
 * When the Lokasi Mitra must answer a Terencana order placed at `now`: the end of its
 * next working day (spec, Pemesanan > Terencana), or null while its Jam Operasional is
 * belum diisi. `placeTerencana` writes it on the order; nothing cancels the order when
 * it passes.
 */
export async function tenggatKonfirmasiTerencana(deps: Pick<PemesananDeps, "lokasi">, lokasiId: string, now: Date): Promise<Date | null> {
  const jam = await deps.lokasi.jamOperasionalOf(lokasiId);
  if (!jam.ok) return null;
  const tenggat = nextWorkingDayEnd(jam.jamOperasional, now);
  return tenggat.ok ? tenggat.at : null;
}

/**
 * Confirms one Diajukan Terencana order: the hold starts, the pay-first Tagihan is
 * issued and due when it ends, and the family is told — all in one transaction, so a
 * failure anywhere leaves the order Diajukan, its plots held and nothing billed.
 * Only that Lokasi's Admin Lokasi may confirm; Admin Platform chases the Lokasi by
 * phone (its Tier 3 "Konfirmasi Terencana terlambat" row) but never confirms for it.
 */
export async function konfirmasiTerencana(deps: PemesananDeps, by: Actor, rawInput: unknown): Promise<KonfirmasiTerencanaResult> {
  const parsed = konfirmasiTerencanaSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const [order] = await deps.db.select().from(pemesananTerencana).where(eq(pemesananTerencana.nomor, parsed.data.nomor));
  if (!order) return { ok: false, reason: "pesanan_tidak_ditemukan" };
  const refusal = writeRefusal(by, "pemesanan.konfirmasi", lokasiMitraResource(order.lokasiId));
  if (refusal) return refusal;
  if (order.status === "dikonfirmasi" || order.status === "aktif") return { ok: false, reason: "pesanan_sudah_dikonfirmasi" };
  if (order.status !== "diajukan") return { ok: false, reason: "pesanan_sudah_ditutup" };

  const units = await unitsOfOrder(deps.db, order.id);
  const now = deps.clock.now();
  const holdHours = await deps.lokasi.terencanaHoldHours(order.lokasiId);
  if (holdHours === null) return { ok: false, reason: "lokasi_tidak_terbuka" };
  const tahanSampai = new Date(now.getTime() + holdHours * 3_600_000);

  // Priced now, as any confirmation is: the Tagihan carries the Harga Hak Pakai in force today.
  const harga = await deps.tariffs.quote(
    units.map((unit) => ({ kind: "harga_hak_pakai" as const, jenisMakamId: unit.jenisMakamId })),
    now,
  );
  if (!harga.ok) return { ok: false, reason: "harga_tidak_tersedia" };
  if (!withinPaymentCap(harga.total)) return { ok: false, reason: "melebihi_batas_qris", total: harga.total };
  const baris = linesOf(harga.lines, order);
  if (!baris.ok) return { ok: false, reason: "tagihan_tidak_terbit" };
  // One Harga Hak Pakai line per plot, in the order the plots were picked; the Biaya Layanan Platform line follows them.
  const lines = baris.lines.map((line, index) =>
    index < units.length && "label" in line ? { ...line, label: `${line.label} · ${nomorUnit(units[index])}` } : line,
  );
  const tenures = harga.lines.slice(0, units.length).map((line) => (line.kind === "harga_hak_pakai" && line.tenure.kind === "tahun" ? line.tenure.years : null));

  const hasil = await deps.audit.staffWrite(deps.db, async (tx, record) => {
    const dikonfirmasi = await tx
      .update(pemesananTerencana)
      .set({ status: "dikonfirmasi", dikonfirmasiPada: now, tahanSampai })
      .where(and(eq(pemesananTerencana.id, order.id), eq(pemesananTerencana.status, "diajukan")))
      .returning({ id: pemesananTerencana.id });
    if (dikonfirmasi.length === 0) return { ok: false as const, reason: "pesanan_sudah_dikonfirmasi" as const };
    for (const [index, unit] of units.entries()) {
      await tx.update(pemesananTerencanaUnit).set({ tenureYears: tenures[index] ?? null }).where(eq(pemesananTerencanaUnit.id, unit.id));
    }

    // The plots have been held since submission; now the hold has a deadline, which is the Tagihan's.
    await deps.inventory.within(tx).mulaiTahanBayar({ nomorPemesanan: order.nomor, sampai: tahanSampai });
    const tagihan = await deps.billing.within(tx).issueTagihan({
      moment: { kind: "terencana", holdExpiresAt: tahanSampai },
      addressee: { name: order.pemesanName, phoneNumber: order.phoneNumber, accountId: order.pemesanAccountId },
      nomorPemesanan: order.nomor,
      placeName: order.lokasiName,
      lines,
    });
    if (!tagihan.ok) return { ok: false as const, reason: "tagihan_tidak_terbit" as const };
    await tx.update(pemesananTerencana).set({ tagihanId: tagihan.tagihan.id }).where(eq(pemesananTerencana.id, order.id));

    // Announced in the transaction that issues the Tagihan, exactly as a Saat Duka confirmation does (ticket 89): this
    // records where the Tagihan's messages go and schedules the one reminder about 4 h before the hold ends. The
    // confirmation email below already carries the Tagihan's number and link, so no second "Tagihan terbit" email goes out.
    const diumumkan = await deps.notifikasi.tagihanTerbit(tx, {
      tagihanId: tagihan.tagihan.id,
      bersamaKonfirmasi: true,
      momentKind: "terencana",
      nomorTagihan: tagihan.tagihan.nomorTagihan,
      nomorPemesanan: order.nomor,
      email: order.email,
      perihal: `Hak Pakai makam di ${order.lokasiName}`,
      total: tagihan.tagihan.total,
      dueAt: tagihan.tagihan.dueAt,
      link: tagihan.tagihan.link,
    });
    if (!diumumkan.ok) return { ok: false as const, reason: "tagihan_tidak_terbit" as const };
    const kontak = await deps.lokasi.kontakSiagaOf(order.lokasiId);
    await deps.notifikasi.terencanaDikonfirmasi(tx, {
      pemesananId: order.id,
      nomor: order.nomor,
      email: order.email,
      lokasi: { id: order.lokasiId, name: order.lokasiName },
      unit: units.map((unit) => ({ nomor: nomorUnit(unit), jenisMakamName: unit.jenisMakamName })),
      // "Untuk saya sendiri" names the Pemesan themselves, whoever the Pemegang Hak is.
      calonName: order.calonPenghuni.name ?? order.pemesanName,
      tahanSampai,
      kontakLokasi: { name: kontak?.name || order.lokasiName, phoneNumber: kontak?.phoneNumber ?? null },
      tagihan: { nomorTagihan: tagihan.tagihan.nomorTagihan, total: tagihan.tagihan.total, dueAt: tagihan.tagihan.dueAt, link: tagihan.tagihan.link },
    });

    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "pemesanan.konfirmasi_terencana",
      entity: { kind: "pemesanan_terencana", id: order.id },
      lokasiId: order.lokasiId,
      before: { status: "diajukan", tagihanId: null },
      after: {
        status: "dikonfirmasi",
        unit: units.map(nomorUnit),
        tahanSampai: tahanSampai.toISOString(),
        nomorTagihan: tagihan.tagihan.nomorTagihan,
      },
      reason: null,
    });
    return {
      ok: true as const,
      pesanan: { nomor: order.nomor, status: "dikonfirmasi" as const, tahanSampai },
      tagihan: {
        id: tagihan.tagihan.id,
        nomorTagihan: tagihan.tagihan.nomorTagihan,
        total: tagihan.tagihan.total,
        dueAt: tagihan.tagihan.dueAt,
        kind: "pay_first" as const,
        link: tagihan.tagihan.link,
      },
    };
  });
  return hasil;
}

export type TolakTerencanaResult =
  | { ok: true; pesanan: { nomor: string; status: "ditolak"; alasan: AlasanTolakTerencana } }
  | WriteRefusal
  | { ok: false; reason: "input_tidak_valid" | "pesanan_tidak_ditemukan" }
  /** The order has moved on (confirmed, already declined, withdrawn): a Tolak changes nothing. */
  | { ok: false; reason: "pesanan_sudah_ditutup" };

/**
 * Declines one Diajukan Terencana order with a reason off the closed list, audited on
 * the Lokasi: the plots are released in the same transaction, and the family is told
 * why and sent back to the Lokasi step. A Diajukan order has no Tagihan, so there is
 * nothing to cancel and nothing was charged.
 */
export async function tolakTerencana(deps: PemesananDeps, by: Actor, rawInput: unknown): Promise<TolakTerencanaResult> {
  const parsed = tolakTerencanaSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;
  const [order] = await deps.db.select().from(pemesananTerencana).where(eq(pemesananTerencana.nomor, input.nomor));
  if (!order) return { ok: false, reason: "pesanan_tidak_ditemukan" };
  const refusal = writeRefusal(by, "pemesanan.tolak", lokasiMitraResource(order.lokasiId));
  if (refusal) return refusal;
  if (order.status !== "diajukan") return { ok: false, reason: "pesanan_sudah_ditutup" };

  const units = await unitsOfOrder(deps.db, order.id);
  const now = deps.clock.now();
  const ditolak = await deps.audit.staffWrite(deps.db, async (tx, record) => {
    const moved = await tx
      .update(pemesananTerencana)
      .set({ status: "ditolak", ditolakPada: now, alasanTolak: input.alasan })
      .where(and(eq(pemesananTerencana.id, order.id), eq(pemesananTerencana.status, "diajukan")))
      .returning({ id: pemesananTerencana.id });
    if (moved.length === 0) return { ok: false as const, reason: "pesanan_sudah_ditutup" as const };
    await deps.inventory.within(tx).lepasTahan(order.nomor);
    await deps.notifikasi.terencanaDitolak(tx, {
      pemesananId: order.id,
      nomor: order.nomor,
      email: order.email,
      lokasi: { id: order.lokasiId, name: order.lokasiName },
      unit: units.map((unit) => ({ nomor: nomorUnit(unit), jenisMakamName: unit.jenisMakamName })),
      alasan: ALASAN_TOLAK[input.alasan],
    });
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "pemesanan.tolak_terencana",
      entity: { kind: "pemesanan_terencana", id: order.id },
      lokasiId: order.lokasiId,
      before: { status: "diajukan", alasanTolak: null },
      after: { status: "ditolak", alasan: input.alasan, dilepas: units.map(nomorUnit) },
      reason: ALASAN_TOLAK[input.alasan],
    });
    return { ok: true as const, pesanan: { nomor: order.nomor, status: "ditolak" as const, alasan: input.alasan } };
  });
  return ditolak;
}

export type TarikTerencanaResult =
  | { ok: true; pesanan: { nomor: string; status: "dibatalkan" }; tagihan: { nomorTagihan: string } | null }
  | { ok: false; reason: "input_tidak_valid" | "pesanan_tidak_ditemukan" }
  /** Already Ditolak or Dibatalkan: there is nothing to withdraw. */
  | { ok: false; reason: "pesanan_sudah_ditutup" }
  /** Paid (Aktif, or the Tagihan is Lunas): taking it back is a Pembatalan, with a refund under the Syarat, never a free withdrawal. */
  | { ok: false; reason: "sudah_dibayar" };

/** How many times a withdrawal re-reads an order that changed under it before it gives up. */
const PERCOBAAN_TARIK = 3;

/**
 * The Pemesan withdraws its own Terencana order, free, any time before paying (spec,
 * Pemesanan > Terencana): the order becomes Dibatalkan, a confirmed order's Tagihan is
 * cancelled, the plots are released and nothing is charged. No Entri Audit: a family
 * acting on its own order is not a staff write.
 *
 * A confirmation or a payment can land while this runs. The Tagihan's lock is taken
 * first and the order is changed with a conditional update, so when the order moved
 * under this call the whole transaction rolls back and the order is read again; a
 * payment that settled first makes it refuse with `sudah_dibayar`.
 */
export async function tarikTerencana(deps: PemesananDeps, pemesan: Pemesan, rawInput: unknown): Promise<TarikTerencanaResult> {
  const parsed = tarikTerencanaSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  for (let percobaan = 0; percobaan < PERCOBAAN_TARIK; percobaan += 1) {
    const [order] = await deps.db
      .select()
      .from(pemesananTerencana)
      .where(and(eq(pemesananTerencana.nomor, parsed.data.nomor), eq(pemesananTerencana.pemesanAccountId, pemesan.accountId)));
    if (!order) return { ok: false, reason: "pesanan_tidak_ditemukan" };
    if (order.status === "aktif") return { ok: false, reason: "sudah_dibayar" };
    if (order.status !== "diajukan" && order.status !== "dikonfirmasi") return { ok: false, reason: "pesanan_sudah_ditutup" };

    const now = deps.clock.now();
    const hasil = await refusable<TarikTerencanaResult | { ok: false; reason: "berubah" }>(deps.db, async (tx) => {
      let nomorTagihan: string | null = null;
      if (order.tagihanId) {
        // A Harga Khusus reissues the Tagihan under a new id: the one in force is what is withdrawn, never the replaced one (ticket 93).
        const berlaku = await deps.billing.within(tx).tagihanBerlaku(order.tagihanId);
        if (!berlaku) throw new Error("a Terencana order names a Tagihan that does not exist");
        const dibatalkan = await deps.billing.within(tx).batalkanTagihan(berlaku.id, { alasan: "pemesanan_dibatalkan", hanyaBelumDibayar: true });
        if (dibatalkan.ok) nomorTagihan = dibatalkan.tagihan.nomorTagihan;
        else if (dibatalkan.reason === "tagihan_sudah_dibayar") return { ok: false as const, reason: "sudah_dibayar" as const };
        else if (dibatalkan.reason === "tidak_ditemukan") throw new Error("a Terencana order names a Tagihan that does not exist");
        // A Tagihan Billing already lapsed is the same end: nothing is owed and nothing was paid.
      }
      const moved = await tx
        .update(pemesananTerencana)
        .set({ status: "dibatalkan", dibatalkanPada: now, alasan: "ditarik_pemesan" })
        .where(and(eq(pemesananTerencana.id, order.id), eq(pemesananTerencana.status, order.status), order.tagihanId ? eq(pemesananTerencana.tagihanId, order.tagihanId) : undefined))
        .returning({ id: pemesananTerencana.id });
      // The order changed since it was read (a confirmation landed): roll back and read it again.
      if (moved.length === 0) return { ok: false as const, reason: "berubah" as const };
      await deps.inventory.within(tx).lepasTahan(order.nomor);
      return { ok: true as const, pesanan: { nomor: order.nomor, status: "dibatalkan" as const }, tagihan: nomorTagihan ? { nomorTagihan } : null };
    });
    if (hasil.ok || hasil.reason !== "berubah") return hasil as TarikTerencanaResult;
  }
  return { ok: false, reason: "pesanan_sudah_ditutup" };
}

/** What one run of the lapse tick did. */
export interface LewatBatasBayarHasil {
  /** Orders that became Dibatalkan ("batas pembayaran lewat") with their plots released. */
  dibatalkan: number;
}

/**
 * The scheduler's tick (idempotent, from database state): every Dikonfirmasi order
 * whose payment hold has ended with its Tagihan unpaid becomes Dibatalkan, "batas
 * pembayaran lewat", its Tagihan Dibatalkan and its plots released; the family is told.
 * A Tagihan that was paid is left alone: its payment effect makes the order Aktif.
 * Orders are handled one by one, each in its own transaction, so one that cannot be
 * closed never holds the rest back.
 */
export async function lewatBatasBayarTerencana(deps: PemesananDeps, now: Date): Promise<LewatBatasBayarHasil> {
  const lewat = await deps.db
    .select()
    .from(pemesananTerencana)
    .where(and(eq(pemesananTerencana.status, "dikonfirmasi"), lte(pemesananTerencana.tahanSampai, now)))
    .orderBy(pemesananTerencana.tahanSampai, pemesananTerencana.nomor);
  const hasil: LewatBatasBayarHasil = { dibatalkan: 0 };
  for (const order of lewat) {
    const tagihanId = order.tagihanId;
    if (!tagihanId) {
      // A confirmed order always has its Tagihan (the confirmation issues both in one transaction): one without is a
      // broken invariant, reported by its number (no personal data) rather than skipped in silence.
      deps.reportError?.(new Error("a Dikonfirmasi Pemesanan Terencana has no Tagihan"), {
        tags: { module: "pemesanan", event: "terencana_tanpa_tagihan", nomor: order.nomor },
      });
      continue;
    }
    const units = await unitsOfOrder(deps.db, order.id);
    const ditutup = await refusable<{ ok: boolean }>(deps.db, async (tx) => {
      // The Tagihan in force, not the id the order stored: a Harga Khusus reissued it (ticket 93).
      const berlaku = await deps.billing.within(tx).tagihanBerlaku(tagihanId);
      if (!berlaku) {
        deps.reportError?.(new Error("a Dikonfirmasi Pemesanan Terencana names a Tagihan that does not exist"), {
          tags: { module: "pemesanan", event: "terencana_tagihan_hilang", nomor: order.nomor },
        });
        return { ok: false };
      }
      const dibatalkan = await deps.billing.within(tx).batalkanTagihan(berlaku.id, { alasan: "batas_pembayaran_lewat", hanyaBelumDibayar: true });
      let nomorTagihan = "";
      if (dibatalkan.ok) nomorTagihan = dibatalkan.tagihan.nomorTagihan;
      else if (dibatalkan.reason === "tagihan_sudah_dibayar") return { ok: false };
      else if (dibatalkan.reason === "tidak_ditemukan") {
        deps.reportError?.(new Error("a Dikonfirmasi Pemesanan Terencana names a Tagihan that does not exist"), {
          tags: { module: "pemesanan", event: "terencana_tagihan_hilang", nomor: order.nomor },
        });
        return { ok: false };
      } else {
        // Billing's own lapse tick got there first: the Tagihan is already Dibatalkan, and it is its number the family reads.
        nomorTagihan = berlaku.nomorTagihan;
      }
      const moved = await tx
        .update(pemesananTerencana)
        .set({ status: "dibatalkan", dibatalkanPada: now, alasan: "batas_pembayaran_lewat" })
        .where(and(eq(pemesananTerencana.id, order.id), eq(pemesananTerencana.status, "dikonfirmasi")))
        .returning({ id: pemesananTerencana.id });
      if (moved.length === 0) return { ok: false };
      await deps.inventory.within(tx).lepasTahan(order.nomor);
      await deps.notifikasi.terencanaBatasBayarLewat(tx, {
        pemesananId: order.id,
        nomor: order.nomor,
        email: order.email,
        lokasi: { id: order.lokasiId, name: order.lokasiName },
        unit: units.map((unit) => ({ nomor: nomorUnit(unit), jenisMakamName: unit.jenisMakamName })),
        nomorTagihan,
      });
      return { ok: true };
    });
    if (ditutup.ok) hasil.dibatalkan += 1;
  }
  return hasil;
}
