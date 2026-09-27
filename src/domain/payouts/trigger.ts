/**
 * The Saat Duka Pencairan trigger (spec, Billing > Payouts: "Saat Duka Petak and
 * a later burial's Biaya Pemakaman | Lunas **and** Pemakaman recorded"; ticket
 * 32's AC 1, 2, 3, 9).
 *
 * The two halves of that condition are written by the two modules that own
 * them, each in its own transaction and neither reading the other back:
 * - the Lunas half by the payment effect (`./efek.ts`), inside the transaction
 *   that settles the Tagihan;
 * - the burial half by `pemakamanTercatat`, which the Pemakaman module (ticket
 *   25) calls inside the transaction that records the burial.
 *
 * This tick is where the pair becomes money. Reading the facts rather than
 * being called from either side is what makes "in either order" true by
 * construction, and it is idempotent twice over: an order that already has its
 * items is skipped, and the unique index on the item's Tagihan line makes a
 * repeated insert a no-op rather than a second item.
 *
 * The amount is **copied from the issued Tagihan's line** and never quoted
 * again. An issued Tagihan's lines are immutable (Billing's own trigger refuses
 * to change them) and the family has been sent that number, so a tariff entered
 * between the issue and the burial must not move what the Lokasi Mitra is paid.
 */
import { eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { refusable } from "@/db/unit-of-work";
import { paymentMethodSchema, type Billing, type Tagihan, type TagihanLine } from "@/domain/billing";
import { addWorkingDays, type Lokasi } from "@/domain/lokasi";
import type { ReportError } from "@/lib/observability/report-error";
import { sumRupiah, type Rupiah } from "@/lib/rupiah";
import type { Clock } from "@/ports/clock";
import { pencairanItem, pencairanPemakaman, pencairanPembayaran, type PencairanItemKind } from "./schema";
import { sisipPotongan } from "./potongan";

/** How long after an item becomes due Admin Platform must have transferred it: 2 Hari Kerja (AC 6). */
export const TENGGAT_PENCAIRAN_HARI_KERJA = 2;

/** The Tagihan line kind whose fee a "dibayar langsung" order leaves the Operator (a platform-fee Potongan). */
export const BIAYA_LAYANAN_PLATFORM = "biaya_layanan_platform";

const nomorPemesananSchema = z.string().trim().regex(/^MKM-\d{4}-\d{6}$/);

/** A line a Lokasi Mitra provides, narrowed to what an item copies from it. */
type PartnerLine = TagihanLine & { provider: { kind: "lokasi_mitra"; lokasiId: string; name: string } };

export interface PemicuDeps {
  db: Database;
  clock: Clock;
  /** The issued Tagihan, read through Billing's own public read: never its tables. */
  billing: Pick<Billing, "tagihan">;
  /** The Admin Platform Hari Kerja calendar the "2 Hari Kerja" deadline counts on (AC 6). */
  lokasi: Pick<Lokasi, "adminPlatformCalendar">;
  /** Where a trigger that cannot be applied is reported (an unexpected line kind); tags only, no money in them. */
  reportError?: ReportError;
}

/** What one tick found waiting for its other half, and what it made of it. */
export interface TickPencairanResult {
  /** Items created. */
  items: number;
  /** Potongan created for a "dibayar langsung" order. */
  potongan: number;
  /** Orders that had both halves and were left alone on purpose. */
  dilewati: number;
}

/**
 * Records that one order's Pemakaman is recorded, which is the second half of
 * the Saat Duka trigger. **The Pemakaman module (ticket 25) calls this inside
 * its own transaction**, so the fact commits with the burial; the item it makes
 * due is written by the tick, whether the money arrived before or after.
 *
 * Idempotent: recording the same burial again changes nothing.
 */
export async function pemakamanTercatat(tx: Database, input: { nomorPemesanan: string; pemakamanAt: Date }): Promise<void> {
  const nomor = nomorPemesananSchema.safeParse(input.nomorPemesanan);
  const pemakamanAt = z.date().safeParse(input.pemakamanAt);
  if (!nomor.success || !pemakamanAt.success) {
    throw new Error("pemakamanTercatat needs a Nomor Pemesanan and a Pemakaman instant");
  }
  await tx
    .insert(pencairanPemakaman)
    .values({ nomorPemesanan: nomor.data, pemakamanPada: pemakamanAt.data })
    .onConflictDoUpdate({ target: pencairanPemakaman.nomorPemesanan, set: { pemakamanPada: pemakamanAt.data } });
}

/** The line kind each issuable line becomes as a Pencairan item; a kind absent here has no item. */
const ITEM_KIND_BY_LINE: Readonly<Record<string, PencairanItemKind | undefined>> = {
  harga_hak_pakai: "harga_hak_pakai",
  biaya_pemakaman: "biaya_pemakaman",
  perpanjangan: "perpanjangan",
  layanan: "layanan",
};

/**
 * The lines this Lokasi Mitra provides, in the order they were issued. A line
 * that is not one of the four kinds an item can be is **refused**, never
 * silently dropped: a partner line with no item is money that would leave the
 * book without ever reaching the partner who did the work.
 */
function linesOfPartner(tagihan: Tagihan): { ok: true; lines: { position: number; line: PartnerLine }[] } | { ok: false } {
  const lines: { position: number; line: PartnerLine }[] = [];
  for (const [position, line] of tagihan.lines.entries()) {
    if (line.provider.kind !== "lokasi_mitra") continue;
    if (line.amount <= 0) continue;
    if (ITEM_KIND_BY_LINE[line.kind] === undefined) return { ok: false };
    lines.push({ position, line: line as PartnerLine });
  }
  return { ok: true, lines };
}

/** Whether this ticket's Saat Duka trigger owns a line kind, and so may make its item due. */
function milikTriggerIni(kind: TagihanLine["kind"]): boolean {
  return kind === "harga_hak_pakai" || kind === "biaya_pemakaman";
}

/** The deadline on the Admin Platform calendar: 2 Hari Kerja after the item became due (AC 6). */
function tenggat(dueAt: Date, calendar: Awaited<ReturnType<Lokasi["adminPlatformCalendar"]>>): Date {
  const deadline = addWorkingDays(calendar, dueAt, TENGGAT_PENCAIRAN_HARI_KERJA);
  if (!deadline.ok) throw new Error(`the Admin Platform calendar has no Hari Kerja ahead of ${dueAt.toISOString()}`);
  return deadline.at;
}

/**
 * Every order whose Tagihan is Lunas **and** whose Pemakaman is recorded gets
 * its Pencairan items, due from the later of the two instants. Idempotent.
 */
export async function tickPencairan(deps: PemicuDeps, now: Date): Promise<TickPencairanResult> {
  const menunggu = await deps.db
    .select({
      tagihanId: pencairanPembayaran.tagihanId,
      nomorPemesanan: pencairanPembayaran.nomorPemesanan,
      dibayarPada: pencairanPembayaran.dibayarPada,
      metode: pencairanPembayaran.metode,
      pemakamanPada: pencairanPemakaman.pemakamanPada,
    })
    .from(pencairanPembayaran)
    .innerJoin(pencairanPemakaman, eq(pencairanPemakaman.nomorPemesanan, pencairanPembayaran.nomorPemesanan))
    .where(isNotNull(pencairanPembayaran.nomorPemesanan))
    .orderBy(pencairanPembayaran.dibayarPada);
  if (menunggu.length === 0) return { items: 0, potongan: 0, dilewati: 0 };

  const calendar = await deps.lokasi.adminPlatformCalendar();
  const hasil: TickPencairanResult = { items: 0, potongan: 0, dilewati: 0 };
  for (const row of menunggu) {
    if (row.nomorPemesanan === null) continue;
    // A payment method that does not read is not a trigger this module acts on:
    // a row it cannot understand is left alone rather than guessed at.
    const metode = paymentMethodSchema.safeParse(row.metode);
    if (!metode.success) continue;
    // Read before the transaction opens, so a write never holds its connection
    // while another read is pending.
    const tagihan = await deps.billing.tagihan(row.tagihanId);
    if (!tagihan) continue;
    const ditulis = await refusable(deps.db, async (tx) => {
      const sudah = await tx
        .select({ id: pencairanItem.id })
        .from(pencairanItem)
        .where(eq(pencairanItem.tagihanId, row.tagihanId))
        .limit(1);
      if (sudah.length > 0) return { ok: true, dibuat: 0, dilewati: true } as const;
      const partner = linesOfPartner(tagihan);
      if (!partner.ok) {
        deps.reportError?.(new Error("a Tagihan line the partner provides has no Pencairan item kind"), {
          tags: { module: "payouts", event: "pencairan_item_jenis_tidak_dikenal", nomorTagihan: tagihan.nomorTagihan },
        });
        return { ok: false, dibuat: 0, dilewati: false } as const;
      }
      // A Tagihan refunded in full owes nobody anything: the family's money went
      // back to them, so no partner is paid for it and nothing is clawed back
      // afterwards (the owner's decision recorded in the ticket's Comments).
      if (tagihan.status === "dikembalikan_penuh") return { ok: true, dibuat: 0, dilewati: true } as const;

      const dueAt = new Date(Math.max(row.dibayarPada.getTime(), row.pemakamanPada.getTime()));
      const jatuhTempoAt = tenggat(dueAt, calendar);
      if (metode.data.kind === "langsung_ke_lokasi") {
        // "Dibayar langsung": the family paid the Lokasi Mitra itself, so no
        // tariff is owed to it — and the Operator's own fee becomes a Potongan.
        return { ok: true, dibuat: await potongLangsung(tx, tagihan, partner.lines, now), dilewati: false } as const;
      }
      const dibuat = await tx
        .insert(pencairanItem)
        .values(
          partner.lines.map(({ position, line }) => ({
            penerimaKind: "lokasi_mitra" as const,
            lokasiId: line.provider.lokasiId,
            penerimaNama: line.provider.name,
            penerimaAkunId: null,
            kind: ITEM_KIND_BY_LINE[line.kind] as PencairanItemKind,
            label: line.label,
            amount: line.amount as Rupiah,
            tagihanId: tagihan.id,
            tagihanPosisi: position,
            nomorPemesanan: tagihan.nomorPemesanan,
            tanggalLayanan: line.kind === "layanan" ? line.targetDate : null,
            // A line kind whose own trigger another ticket owns (a Perpanjangan
            // paid straight away, a Layanan's job after its Keluhan window) is
            // recorded now and waits: the amount is fixed by the issued Tagihan
            // either way, and nothing is ever paid before its own trigger says so.
            dueAt: milikTriggerIni(line.kind) ? dueAt : null,
            jatuhTempoAt: milikTriggerIni(line.kind) ? jatuhTempoAt : null,
            status: milikTriggerIni(line.kind) ? ("jatuh_tempo" as const) : ("belum_jatuh_tempo" as const),
            dibuatPada: now,
          })),
        )
        .onConflictDoNothing({ target: [pencairanItem.tagihanId, pencairanItem.tagihanPosisi] })
        .returning({ id: pencairanItem.id });
      return { ok: true, dibuat: dibuat.length, dilewati: false } as const;
    });
    if (!ditulis.ok) continue;
    if (ditulis.dilewati) hasil.dilewati += 1;
    else if (metode.data.kind === "langsung_ke_lokasi") hasil.potongan += ditulis.dibuat;
    else hasil.items += ditulis.dibuat;
  }
  return hasil;
}

/** The platform-fee Potongan a "dibayar langsung" order leaves the Operator with; 0 when the Tagihan carried no fee line. */
async function potongLangsung(tx: Database, tagihan: Tagihan, partnerLines: { line: PartnerLine }[], now: Date): Promise<number> {
  const lokasi = partnerLines[0]?.line.provider;
  if (!lokasi) return 0;
  const fee = sumRupiah(
    tagihan.lines.filter((line) => line.kind === BIAYA_LAYANAN_PLATFORM && line.amount > 0).map((line) => line.amount as Rupiah),
  );
  if (!fee.ok || fee.amount === 0) return 0;
  const dibuat = await sisipPotongan(
    tx,
    {
      lokasiId: lokasi.lokasiId,
      amount: fee.amount,
      alasanKind: BIAYA_LAYANAN_PLATFORM,
      alasan: `Biaya Layanan Platform untuk pesanan ${tagihan.nomorPemesanan ?? tagihan.nomorTagihan}, yang dibayar langsung ke Lokasi Mitra.`,
      sumberTagihanId: tagihan.id,
      sumberNomorPemesanan: tagihan.nomorPemesanan,
    },
    now,
  );
  return dibuat ? 1 : 0;
}
