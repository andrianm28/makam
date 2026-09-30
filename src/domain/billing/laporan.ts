/**
 * Internal to the Billing module: what the monthly Laporan reads of Billing
 * (spec, Work Queues > Laporan; ticket 33). One pass over the Tagihan and the
 * Bukti Pembayaran for a half-open span of instants, which the Work Queues
 * module cuts at the Asia/Jakarta month boundary. Nothing here changes a row.
 *
 * Date basis: money and orders both count in the month of the payment's own
 * moment (the Bukti Pembayaran's `paid_at`, which is also the Tagihan's), so
 * what came in and the fees earned on it always fall in the same month.
 * A Tagihan paid directly to a Lokasi Mitra is never money the Operator
 * received: it is listed by method but left out of the received total and of the
 * fees (the platform fee of such an order reaches the Operator as a Potongan).
 */
import { and, gte, isNotNull, lt, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { laporanResource, writeRefusal, type Actor } from "@/domain/identity";
import { DAY_MS } from "@/lib/time/jakarta";
import { TIDAK_TERTAGIH_HARI } from "./chasing";
import type { PaymentMoment } from "./due-rules";
import type { PaymentMethod } from "./shared";
import { buktiPembayaran, tagihan } from "./schema";

/** Every payment moment a Tagihan is issued for: the kinds an order is counted under. */
export const pesananKinds = [
  "saat_duka",
  "pemakaman_hak_pakai_ada",
  "terencana",
  "perpanjangan",
  "pengurusan_berkas",
  "layanan",
  "paket_cycle",
] as const satisfies readonly PaymentMoment["kind"][];
export type PesananKind = (typeof pesananKinds)[number];

/** Every way a Tagihan is paid. */
export const metodeBayarKinds = [
  "penyedia_pembayaran",
  "transfer_manual",
  "tunai",
  "langsung_ke_lokasi",
  "tanpa_pembayaran",
] as const satisfies readonly PaymentMethod["kind"][];
export type MetodeBayarKind = (typeof metodeBayarKinds)[number];

/** A half-open span of instants: `dari` is inside, `sampai` is not. */
export interface RentangWaktu {
  dari: Date;
  sampai: Date;
}

export interface LaporanBilling {
  /** Orders paid in the span, one each whatever number of Tagihan it took, by the payment moment of its first paid Tagihan. A cancelled Tagihan (Dibatalkan, replaced, or refunded after a cancellation) is no order. Every kind is present. */
  pesanan: { kind: PesananKind; jumlah: number }[];
  /** Money that came in for a Tagihan in the span, by how it was paid. Every method is present. */
  diterima: { metode: MetodeBayarKind; jumlahPembayaran: number; amount: number }[];
  /** Money the Operator itself received: every method except "Dibayar langsung ke Lokasi Mitra". */
  totalDiterimaOperator: number;
  /** The Operator's own fee lines on what it received in the span (gross: a refund that returned the fee is Refunds'). */
  biaya: { biayaLayananPlatform: number; biayaPengurusan: number };
  /** Tagihan Admin Platform gave up chasing in the span: fixed by the day of the declaration, never changed by a later payment. */
  tidakTertagih: { jumlah: number; amount: number };
  /** Tagihan declared Tidak Tertagih earlier that were paid in the span after all: the correction the month of payment shows. */
  dibayarSetelahTidakTertagih: { jumlah: number; amount: number };
}

const kosong = (): LaporanBilling => ({
  pesanan: pesananKinds.map((kind) => ({ kind, jumlah: 0 })),
  diterima: metodeBayarKinds.map((metode) => ({ metode, jumlahPembayaran: 0, amount: 0 })),
  totalDiterimaOperator: 0,
  biaya: { biayaLayananPlatform: 0, biayaPengurusan: 0 },
  tidakTertagih: { jumlah: 0, amount: 0 },
  dibayarSetelahTidakTertagih: { jumlah: 0, amount: 0 },
});

export type LaporanBillingResult = { ok: true; laporan: LaporanBilling } | { ok: false; reason: "tidak_berwenang" | "perlu_totp" };

export async function laporanBilling(db: Database, by: Actor, span: RentangWaktu): Promise<LaporanBillingResult> {
  const ditolak = writeRefusal(by, "laporan.lihat", laporanResource());
  if (ditolak) return ditolak;
  const dari = span.dari.toISOString();
  const sampai = span.sampai.toISOString();

  // One order once: the first paid, not-Dibatalkan Tagihan of each Nomor Pemesanan (a Tagihan with none is its own order) names its kind and its month.
  const pesananRows = await db.execute<{ kind: string; jumlah: string }>(sql`
    select kind, count(*) as jumlah from (
      select distinct on (coalesce(nomor_pemesanan, id::text)) moment->>'kind' as kind, paid_at
      from tagihan
      where cancelled_at is null and paid_at is not null
      order by coalesce(nomor_pemesanan, id::text), paid_at, id
    ) pertama
    where paid_at >= ${dari}::timestamptz and paid_at < ${sampai}::timestamptz
    group by kind`);

  const diterimaRows = await db
    .select({
      metode: sql<string>`${buktiPembayaran.method}->>'kind'`,
      jumlahPembayaran: sql<string>`count(*)`,
      amount: sql<string>`coalesce(sum(${buktiPembayaran.amount}), 0)`,
    })
    .from(buktiPembayaran)
    .where(and(gte(buktiPembayaran.paidAt, span.dari), lt(buktiPembayaran.paidAt, span.sampai)))
    .groupBy(sql`${buktiPembayaran.method}->>'kind'`);

  const biayaRows = await db.execute<{ kind: string; amount: string }>(sql`
    select l.kind, coalesce(sum(l.amount), 0) as amount
    from bukti_pembayaran b
    join tagihan_line l on l.tagihan_id = b.tagihan_id
    where b.paid_at >= ${dari}::timestamptz and b.paid_at < ${sampai}::timestamptz
      and b.method->>'kind' <> 'langsung_ke_lokasi'
      and l.kind in ('biaya_layanan_platform', 'biaya_pengurusan')
    group by l.kind`);

  // A Tagihan declared before `tidak_tertagih_at` existed is dated from H+30 of its overdue anchor, the earliest it could have been declared.
  const tanggalTidakTertagih = sql`coalesce(${tagihan.tidakTertagihAt}, ${tagihan.lewatJatuhTempoAt} + make_interval(secs => ${(TIDAK_TERTAGIH_HARI * DAY_MS) / 1000}))`;
  const [tidakTertagihRow] = await db
    .select({ jumlah: sql<string>`count(*)`, amount: sql<string>`coalesce(sum(${tagihan.total}), 0)` })
    .from(tagihan)
    .where(
      and(
        sql`(${tagihan.tidakTertagihAt} is not null or ${tagihan.status} = 'tidak_tertagih')`,
        sql`${tanggalTidakTertagih} >= ${dari}::timestamptz`,
        sql`${tanggalTidakTertagih} < ${sampai}::timestamptz`,
      ),
    );
  const [setelahRow] = await db
    .select({ jumlah: sql<string>`count(*)`, amount: sql<string>`coalesce(sum(${tagihan.total}), 0)` })
    .from(tagihan)
    .where(
      and(
        isNotNull(tagihan.tidakTertagihAt),
        isNotNull(tagihan.paidAt),
        gte(tagihan.paidAt, span.dari),
        lt(tagihan.paidAt, span.sampai),
        sql`${tagihan.paidAt} >= ${tagihan.tidakTertagihAt}`,
      ),
    );

  const hasil = kosong();
  for (const row of pesananRows.rows) {
    const target = hasil.pesanan.find((satu) => satu.kind === row.kind);
    if (target) target.jumlah = Number(row.jumlah);
  }
  for (const row of diterimaRows) {
    const target = hasil.diterima.find((satu) => satu.metode === row.metode);
    if (target) {
      target.jumlahPembayaran = Number(row.jumlahPembayaran);
      target.amount = Number(row.amount);
    }
  }
  hasil.totalDiterimaOperator = hasil.diterima.filter((satu) => satu.metode !== "langsung_ke_lokasi").reduce((jumlah, satu) => jumlah + satu.amount, 0);
  for (const row of biayaRows.rows) {
    if (row.kind === "biaya_layanan_platform") hasil.biaya.biayaLayananPlatform = Number(row.amount);
    if (row.kind === "biaya_pengurusan") hasil.biaya.biayaPengurusan = Number(row.amount);
  }
  hasil.tidakTertagih = { jumlah: Number(tidakTertagihRow?.jumlah ?? 0), amount: Number(tidakTertagihRow?.amount ?? 0) };
  hasil.dibayarSetelahTidakTertagih = { jumlah: Number(setelahRow?.jumlah ?? 0), amount: Number(setelahRow?.amount ?? 0) };
  return { ok: true, laporan: hasil };
}
