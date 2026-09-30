/**
 * Internal to the Billing module: what the monthly Laporan reads of Billing
 * (spec, Work Queues > Laporan; ticket 33). One pass over the Tagihan and the
 * Bukti Pembayaran for a half-open span of instants, which the Work Queues
 * module cuts at the Asia/Jakarta month boundary. Nothing here changes a row.
 */
import { and, gte, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { DAY_MS } from "@/lib/time/jakarta";
import { TIDAK_TERTAGIH_HARI } from "./chasing";
import type { PaymentMoment } from "./due-rules";
import type { PaymentMethod } from "./shared";
import { buktiPembayaran, tagihan, tagihanLine } from "./schema";

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
  /** Orders placed in the span, counted once each (a reissued Tagihan is not a second order), by payment moment. Every kind is present. */
  pesanan: { kind: PesananKind; jumlah: number }[];
  /** Money that came in for a Tagihan in the span, by how it was paid. Every method is present. */
  diterima: { metode: MetodeBayarKind; jumlahPembayaran: number; amount: number }[];
  /** The Operator's own fee lines on Tagihan that were paid in the span. */
  biaya: { biayaLayananPlatform: number; biayaPengurusan: number };
  /** Tagihan Admin Platform gave up chasing in the span. */
  tidakTertagih: { jumlah: number; amount: number };
}

export async function laporanBilling(db: Database, span: RentangWaktu): Promise<LaporanBilling> {
  const pesananRows = await db
    .select({ kind: sql<string>`${tagihan.moment}->>'kind'`, jumlah: sql<string>`count(*)` })
    .from(tagihan)
    .where(and(isNull(tagihan.replacesId), gte(tagihan.issuedAt, span.dari), lt(tagihan.issuedAt, span.sampai)))
    .groupBy(sql`${tagihan.moment}->>'kind'`);

  const diterimaRows = await db
    .select({
      metode: sql<string>`${buktiPembayaran.method}->>'kind'`,
      jumlahPembayaran: sql<string>`count(*)`,
      amount: sql<string>`coalesce(sum(${buktiPembayaran.amount}), 0)`,
    })
    .from(buktiPembayaran)
    .where(and(gte(buktiPembayaran.paidAt, span.dari), lt(buktiPembayaran.paidAt, span.sampai)))
    .groupBy(sql`${buktiPembayaran.method}->>'kind'`);

  const biayaRows = await db
    .select({ kind: tagihanLine.kind, amount: sql<string>`coalesce(sum(${tagihanLine.amount}), 0)` })
    .from(tagihanLine)
    .innerJoin(tagihan, sql`${tagihan.id} = ${tagihanLine.tagihanId}`)
    .where(
      and(
        isNotNull(tagihan.paidAt),
        gte(tagihan.paidAt, span.dari),
        lt(tagihan.paidAt, span.sampai),
        sql`${tagihanLine.kind} in ('biaya_layanan_platform', 'biaya_pengurusan')`,
      ),
    )
    .groupBy(tagihanLine.kind);

  // A Tagihan declared before `tidak_tertagih_at` existed is dated from H+30 of its overdue anchor, the earliest it could have been declared.
  const tanggalTidakTertagih = sql`coalesce(${tagihan.tidakTertagihAt}, ${tagihan.lewatJatuhTempoAt} + make_interval(secs => ${(TIDAK_TERTAGIH_HARI * DAY_MS) / 1000}))`;
  const [tidakTertagihRow] = await db
    .select({ jumlah: sql<string>`count(*)`, amount: sql<string>`coalesce(sum(${tagihan.total}), 0)` })
    .from(tagihan)
    .where(
      and(
        sql`${tagihan.status} = 'tidak_tertagih'`,
        or(
          and(isNotNull(tagihan.tidakTertagihAt), gte(tagihan.tidakTertagihAt, span.dari), lt(tagihan.tidakTertagihAt, span.sampai)),
          and(
            isNull(tagihan.tidakTertagihAt),
            sql`${tanggalTidakTertagih} >= ${span.dari.toISOString()}::timestamptz`,
            sql`${tanggalTidakTertagih} < ${span.sampai.toISOString()}::timestamptz`,
          ),
        ),
      ),
    );

  const pesananPerKind = new Map(pesananRows.map((row) => [row.kind, Number(row.jumlah)]));
  const diterimaPerMetode = new Map(diterimaRows.map((row) => [row.metode, row]));
  const biayaPerKind = new Map(biayaRows.map((row) => [row.kind, Number(row.amount)]));
  return {
    pesanan: pesananKinds.map((kind) => ({ kind, jumlah: pesananPerKind.get(kind) ?? 0 })),
    diterima: metodeBayarKinds.map((metode) => {
      const row = diterimaPerMetode.get(metode);
      return { metode, jumlahPembayaran: row ? Number(row.jumlahPembayaran) : 0, amount: row ? Number(row.amount) : 0 };
    }),
    biaya: {
      biayaLayananPlatform: biayaPerKind.get("biaya_layanan_platform") ?? 0,
      biayaPengurusan: biayaPerKind.get("biaya_pengurusan") ?? 0,
    },
    tidakTertagih: { jumlah: Number(tidakTertagihRow?.jumlah ?? 0), amount: Number(tidakTertagihRow?.amount ?? 0) },
  };
}
