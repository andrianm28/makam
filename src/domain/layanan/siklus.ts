/**
 * A Paket Layanan subscription and its recurring cycles (spec, Layanan >
 * Recurring cycles; ticket 54). A Pemesan subscribes a Paket Layanan to one
 * grave; the cycle tick issues each cycle's Tagihan at H-7, pay-first, due H-1,
 * with the cycle's items and the one Biaya Layanan Platform (the due rule
 * itself is Billing's `tagihanDue`, `paket_cycle`).
 *
 * A cycle is a `pesanan_layanan` row carrying `pesanan_paket_id` and `siklus`,
 * with its own items and its jobs in `menunggu_pembayaran`: the payment that
 * settles its Tagihan is the same `efekJadwalkanPekerjaan` a one-off order uses,
 * so this module never grows a second scheduling rule. That reuse is what makes
 * "a paid cycle schedules one Pekerjaan Layanan per item" true without any new
 * effect. The one-off order's read (proof, Keluhan, refund) then works on a
 * cycle's jobs unchanged.
 *
 * `next_cycle_date` is the whole idempotency story: the tick issues the cycle it
 * names once, advances it by the frequency, and a second tick for the same `now`
 * finds the next cycle's H-7 still ahead and issues nothing. A `sekali` Paket has
 * one cycle and then no next date.
 *
 * A cycle Billing refuses for passing the Rilis 1 QRIS cap is paused here — the
 * one refusal that can never succeed on a retry — with a Peringatan to the
 * Pemesan. Ticket 54's other later slices add skip → pause, resume, Hentikan,
 * the stop on a Berakhir Hak Pakai, the tariff-change wording and the optional
 * email field; none of them is built here.
 */
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import type { Tagihan, TagihanKind, TagihanStatus } from "@/domain/billing";
import type { PhoneNumberResult } from "@/domain/identity";
import { refusable } from "@/db/unit-of-work";
import { addWibDateDays, addWibDateMonths, wibDateOf } from "@/lib/time/jakarta";
import type { LayananDeps, PemesanLayanan } from "./deps";
import { offeringsUntukOrder, type VarianUntukOrder } from "./harga";
import { barisTagihan, cekPemesanDanGrave, tulisPesananLayanan } from "./pesanan";
import { findPaketById } from "./paket";
import {
  pesananLayanan,
  pesananLayananItem,
  pesananPaket,
  pesananPaketItem,
  pekerjaanLayanan,
  type Frekuensi,
  type PaketStatus,
  type PekerjaanLayananStatus,
} from "./schema";

/** A phone number the Tagihan could not be addressed to, as the Identity module words it. */
type PhoneRefusal = Extract<PhoneNumberResult, { ok: false }>["reason"];

/** How many days before its cycle date a Paket cycle's Tagihan is issued (spec: H-7). */
const JENDELA_TERBIT_CYCLE_HARI = 7;

export type AlasanTolakLangganan =
  | "input_tidak_valid"
  | "grave_tidak_ditemukan"
  | "lokasi_tidak_terbuka"
  | "hak_pakai_berakhir"
  | "paket_tidak_tersedia"
  | "email_bukan_akun_ini"
  | PhoneRefusal;

export type BerlanggananPaketResult =
  | { ok: true; paket: { id: string; nomor: string; frekuensi: Frekuensi; nextCycleDate: string | null } }
  | { ok: false; reason: AlasanTolakLangganan };

const langgananSchema = z.object({
  paketId: z.uuid(),
  lokasiId: z.uuid(),
  petakId: z.uuid(),
  mulai: z.iso.date(),
  pemesanName: z.string().trim().min(1).max(200),
  phoneNumber: z.string().min(1),
});

/**
 * Subscribes a Pemesan to a Paket Layanan for one grave: the subscription and
 * its item snapshot, in one transaction. Nothing is charged here — the cycles are
 * issued by the tick — but the grave and the Paket are checked now, so a
 * subscription that could never have a cycle is refused rather than stored.
 */
export async function berlanggananPaket(deps: LayananDeps, pemesan: PemesanLayanan, rawInput: unknown): Promise<BerlanggananPaketResult> {
  const parsed = langgananSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;

  const penjaga = await cekPemesanDanGrave(deps, pemesan, {
    lokasiId: input.lokasiId,
    petakId: input.petakId,
    phoneNumber: input.phoneNumber,
  });
  if (!penjaga.ok) return penjaga;
  const { email, phoneNumber, tertulis } = penjaga;
  const pemesanName = input.pemesanName.trim();

  const paket = await findPaketById(deps.db, input.paketId);
  if (!paket || paket.item.length === 0) return { ok: false, reason: "paket_tidak_tersedia" };
  // A Paket is offered only where every item is (the same rule the price uses).
  const tersedia = new Set((await offeringsUntukOrder(deps, input.lokasiId, deps.clock.now())).map((one) => one.id));
  if (paket.item.some((one) => !tersedia.has(one.id))) return { ok: false, reason: "paket_tidak_tersedia" };

  const now = deps.clock.now();
  const hasil = await refusable(deps.db, async (tx) => {
    const nomor = await deps.billing.within(tx).nextNomorPemesanan();
    const [row] = await tx
      .insert(pesananPaket)
      .values({
        nomor,
        lokasiId: input.lokasiId,
        petakId: input.petakId,
        hakPakaiId: tertulis.hak.id,
        paketId: input.paketId,
        lokasiName: tertulis.lokasi.name,
        petakNomor: tertulis.petak.nomor,
        pemesanName,
        pemesanPhone: phoneNumber,
        pemesanEmail: email,
        pemesanAccountId: pemesan.accountId,
        frekuensi: paket.frekuensi,
        status: "aktif",
        nextCycleDate: input.mulai,
        createdAt: now,
      })
      .returning({ id: pesananPaket.id });

    await tx.insert(pesananPaketItem).values(
      paket.item.map((one, posisi) => ({
        pesananPaketId: row.id,
        posisi,
        layananId: one.layananId,
        layananVariantId: one.id,
      })),
    );
    return { ok: true as const, paket: { id: row.id, nomor, frekuensi: paket.frekuensi, nextCycleDate: input.mulai } };
  });
  return hasil;
}

/**
 * The worker's cycle tick (spec, Scheduler: "issue Paket cycles"): every `aktif`
 * subscription whose next cycle's H-7 has come gets that cycle's Tagihan, its
 * items and its jobs. Idempotent: the cycle is the one `next_cycle_date` names,
 * and it is advanced by the frequency in the same transaction.
 */
export async function tickSiklusPaket(deps: LayananDeps, now: Date): Promise<{ diterbitkan: number }> {
  const aktif = await deps.db
    .select({ id: pesananPaket.id, nextCycleDate: pesananPaket.nextCycleDate })
    .from(pesananPaket)
    .where(and(eq(pesananPaket.status, "aktif"), isNotNull(pesananPaket.nextCycleDate)));
  const due = aktif.filter((one) => one.nextCycleDate !== null && h7TelahTiba(one.nextCycleDate, now));
  let diterbitkan = 0;
  for (const satu of due) {
    if (await terbitkanSiklus(deps, satu.id, now)) diterbitkan += 1;
  }
  return { diterbitkan };
}

/** Whether a cycle dated `cycleDate` has reached its H-7 at `now` (both WIB dates). */
function h7TelahTiba(cycleDate: string, now: Date): boolean {
  return wibDateOf(now) >= addWibDateDays(cycleDate, -JENDELA_TERBIT_CYCLE_HARI);
}

/**
 * Issues one subscription's due cycle: its `pesanan_layanan` row, its items, its
 * jobs in `menunggu_pembayaran` and its pay-first Tagihan, then advances
 * `next_cycle_date`. Returns false when the cycle cannot be issued (a price or an
 * offering is missing), leaving the date alone so the next tick tries again.
 *
 * A Tagihan Billing refuses for passing the Rilis 1 QRIS cap is the one refusal
 * that will never succeed on a retry: it pauses the Paket (`dijeda`) and tells
 * the Pemesan, in the same transaction, so the tick stops retrying it.
 */
async function terbitkanSiklus(deps: LayananDeps, pesananPaketId: string, now: Date): Promise<boolean> {
  const hasil = await refusable(deps.db, async (tx) => {
    const [paket] = await tx.select().from(pesananPaket).where(eq(pesananPaket.id, pesananPaketId)).for("update");
    if (!paket || paket.status !== "aktif" || paket.nextCycleDate === null) return { ok: true as const, diterbitkan: false };
    const cycleDate = paket.nextCycleDate;
    // The unique index is the last guard; this read makes a repeated tick a no-op before it.
    const [sudah] = await tx
      .select({ id: pesananLayanan.id })
      .from(pesananLayanan)
      .where(and(eq(pesananLayanan.pesananPaketId, paket.id), eq(pesananLayanan.siklus, cycleDate)));
    if (sudah) return { ok: true as const, diterbitkan: false };

    const item = await tx
      .select({ layananVariantId: pesananPaketItem.layananVariantId })
      .from(pesananPaketItem)
      .where(eq(pesananPaketItem.pesananPaketId, paket.id))
      .orderBy(asc(pesananPaketItem.posisi));
    const tersedia = await offeringsUntukOrder(deps, paket.lokasiId, now);
    const varian: VarianUntukOrder[] = [];
    for (const satu of item) {
      const cocok = tersedia.find((kandidat) => kandidat.id === satu.layananVariantId);
      if (!cocok) return { ok: true as const, diterbitkan: false };
      varian.push(cocok);
    }

    const quoted = await deps.tariffs.quote(
      varian.map((one) => ({ kind: "layanan_lokasi" as const, lokasiId: paket.lokasiId, layananVariantId: one.id })),
      now,
    );
    if (!quoted.ok) return { ok: true as const, diterbitkan: false };
    const baris = barisTagihan(quoted, varian.map((one) => ({ varian: one, targetDate: cycleDate })), paket.lokasiId, paket.lokasiName);
    if (!baris.ok) return { ok: true as const, diterbitkan: false };

    const billing = deps.billing.within(tx);
    const nomor = await billing.nextNomorPemesanan();
    const tagihan = await billing.issueTagihan({
      moment: { kind: "paket_cycle", cycleDate },
      addressee: { name: paket.pemesanName, phoneNumber: paket.pemesanPhone, accountId: paket.pemesanAccountId },
      nomorPemesanan: nomor,
      placeName: paket.lokasiName,
      lines: baris.lines,
    });
    if (!tagihan.ok) {
      // A cycle whose total passes the Rilis 1 QRIS cap can never be issued, so
      // the Paket is paused instead of retried forever: the pause and the
      // Peringatan that explains it commit in this transaction (ticket 54).
      if (tagihan.reason === "melebihi_batas_qris") {
        await deps.notifikasi.paketSiklusDijeda(tx, {
          nomor: paket.nomor,
          email: paket.pemesanEmail,
          pemesanName: paket.pemesanName,
          lokasi: { id: paket.lokasiId, name: paket.lokasiName },
          petak: { nomor: paket.petakNomor },
          siklus: cycleDate,
        });
        await tx.update(pesananPaket).set({ status: "dijeda" }).where(eq(pesananPaket.id, paket.id));
        return { ok: true as const, diterbitkan: false };
      }
      return { ok: true as const, diterbitkan: false };
    }

    await tulisPesananLayanan(
      tx,
      {
        nomor,
        lokasiId: paket.lokasiId,
        petakId: paket.petakId,
        hakPakaiId: paket.hakPakaiId,
        lokasiName: paket.lokasiName,
        petakNomor: paket.petakNomor,
        pemesanName: paket.pemesanName,
        pemesanPhone: paket.pemesanPhone,
        pemesanEmail: paket.pemesanEmail,
        pemesanAccountId: paket.pemesanAccountId,
        tagihanId: tagihan.tagihan.id,
        total: tagihan.tagihan.total,
        pesananPaketId: paket.id,
        siklus: cycleDate,
        createdAt: now,
      },
      varian.map((satu, posisi) => ({
        varian: satu,
        label: baris.perBaris[posisi].label,
        amount: baris.perBaris[posisi].amount,
        targetDate: cycleDate,
        teks: null,
      })),
    );

    await tx
      .update(pesananPaket)
      .set({ nextCycleDate: siklusBerikut(paket.frekuensi, cycleDate) })
      .where(eq(pesananPaket.id, paket.id));
    return { ok: true as const, diterbitkan: true };
  });
  return hasil.diterbitkan;
}

/** The WIB date of the cycle after `cycleDate`, or null for a `sekali` Paket, which has only one. */
function siklusBerikut(frekuensi: Frekuensi, cycleDate: string): string | null {
  switch (frekuensi) {
    case "sekali":
      return null;
    case "bulanan":
      return addWibDateMonths(cycleDate, 1);
    case "tiga_bulanan":
      return addWibDateMonths(cycleDate, 3);
    case "tahunan":
      return addWibDateMonths(cycleDate, 12);
  }
}

/** One cycle of a subscription as its Pemesan reads it: its Tagihan, its date and its jobs. */
export interface SiklusPaketTerbaca {
  /** The cycle's own Nomor Pemesanan. */
  nomor: string;
  siklus: string;
  tagihan: { id: string; nomorTagihan: string; total: number; dueAt: Date; kind: TagihanKind; status: TagihanStatus } | null;
  pekerjaan: { id: string; label: string; status: PekerjaanLayananStatus; targetDate: string }[];
}

/** One subscription as its Pemesan reads it, with every cycle issued so far. */
export interface PesananPaketTerbaca {
  id: string;
  nomor: string;
  frekuensi: Frekuensi;
  status: PaketStatus;
  nextCycleDate: string | null;
  lokasi: { id: string; name: string };
  petak: { id: string; nomor: string };
  siklus: SiklusPaketTerbaca[];
}

/** One subscription with its cycles, or null. */
export async function bacaPesananPaket(deps: LayananDeps, pesananPaketId: string): Promise<PesananPaketTerbaca | null> {
  if (!z.uuid().safeParse(pesananPaketId).success) return null;
  const [row] = await deps.db.select().from(pesananPaket).where(eq(pesananPaket.id, pesananPaketId));
  if (!row) return null;
  const orders = await deps.db
    .select()
    .from(pesananLayanan)
    .where(eq(pesananLayanan.pesananPaketId, row.id))
    .orderBy(asc(pesananLayanan.siklus));
  const orderIds = orders.map((one) => one.id);
  const items = orderIds.length === 0 ? [] : await deps.db.select().from(pesananLayananItem).where(inArray(pesananLayananItem.pesananId, orderIds));
  const jobs = orderIds.length === 0 ? [] : await deps.db.select().from(pekerjaanLayanan).where(inArray(pekerjaanLayanan.pesananId, orderIds));
  const labelOf = new Map(items.map((one) => [one.id, one.label] as const));

  const siklus: SiklusPaketTerbaca[] = [];
  for (const order of orders) {
    const tagihan: Tagihan | null = await deps.billing.tagihan(order.tagihanId);
    siklus.push({
      nomor: order.nomor,
      siklus: order.siklus ?? "",
      tagihan: tagihan
        ? { id: tagihan.id, nomorTagihan: tagihan.nomorTagihan, total: tagihan.total, dueAt: tagihan.dueAt, kind: tagihan.kind, status: tagihan.status }
        : null,
      pekerjaan: jobs
        .filter((job) => job.pesananId === order.id)
        .map((job) => ({ id: job.id, label: labelOf.get(job.pesananItemId) ?? "", status: job.status, targetDate: job.targetDate })),
    });
  }
  return {
    id: row.id,
    nomor: row.nomor,
    frekuensi: row.frekuensi,
    status: row.status,
    nextCycleDate: row.nextCycleDate,
    lokasi: { id: row.lokasiId, name: row.lokasiName },
    petak: { id: row.petakId, nomor: row.petakNomor },
    siklus,
  };
}
