/**
 * The Terencana Pencairan trigger (spec, Billing > Payouts: "Terencana Hak Pakai |
 * end of the Masa Pembatalan, or the first Pemakaman if sooner"; ticket 37).
 *
 * It differs from the Saat Duka trigger in exactly one way — **when** — and that is
 * the whole of this file. The amount is the same: copied from the **issued** Tagihan's
 * line and never quoted again, so a tariff entered after the confirmation cannot move a
 * number the family has already been sent. The recipient is the same: the Lokasi Mitra
 * that provided the line.
 *
 * What the order owns is read through the Pemesanan module's own public read, never
 * from its tables: which orders are paid, the Masa Pembatalan each order **snapshotted**
 * at submission (CONTEXT.md: a later change of the Lokasi Mitra's policy never applies
 * to an order already placed), and the first Pemakaman under each Hak Pakai, which is
 * the only thing that can make an item due sooner.
 *
 * So an item is created as soon as the order is paid and is **not yet due**, and a run
 * makes it due the moment its own instant has passed. That shape is what makes the
 * trigger idempotent and order-free: running the tick before the payment, after it, or
 * twice leaves the same one item, due from the same instant, however many times it runs
 * and however many workers run it at once — `tagihan_id` + `tagihan_posisi` is unique,
 * and the move to `jatuh_tempo` is guarded on `due_at is null`.
 */
import { eq } from "drizzle-orm";
import { refusable } from "@/db/unit-of-work";
import type { Database } from "@/db/client";
import { addWorkingDays, type Lokasi } from "@/domain/lokasi";
import { paymentMethodSchema, type Billing, type Tagihan, type TagihanLine } from "@/domain/billing";
import type { ReportError } from "@/lib/observability/report-error";
import { wib, wibDateOf, addWibDays } from "@/lib/time/jakarta";
import type { Rupiah } from "@/lib/rupiah";
import type { Clock } from "@/ports/clock";
import { itemJatuhTempo } from "./item";
import { pencairanItem, pencairanPembayaran, type PencairanItemKind } from "./schema";
import { TENGGAT_PENCAIRAN_HARI_KERJA } from "./trigger";

/** A line the Lokasi Mitra provides, narrowed to what an item copies from it. */
type PartnerLine = TagihanLine & { provider: { kind: "lokasi_mitra"; lokasiId: string; name: string } };

/**
 * What a paid Pemesanan Terencana means to a Pencairan, as the Pemesanan module (which
 * owns the order) reports it. Never a row of its own here: the Payouts module has no
 * table of Terencairan orders and cannot make one, and every field is a fact the
 * Pemesanan module already keeps.
 */
export interface TerencanaTerbayar {
  nomorPemesanan: string;
  /** The Lunas Tagihan the confirmation issued; its lines are the items' amounts. */
  tagihanId: string;
  /** The Masa Pembatalan snapshotted on the order, in days. */
  masaPembatalanDays: number;
  /**
   * The date of the first Pemakaman under any of the order's Hak Pakai ("YYYY-MM-DD"),
   * or null while none has been recorded. A burial inside the Masa Pembatalan makes the
   * item due then, which is the "or the first Pemakaman if sooner" of the spec.
   */
  pemakamanPertamaPada: string | null;
}

export interface PemicuTerencanaDeps {
  db: Database;
  clock: Clock;
  /** The issued Tagihan, read through Billing's own public read: never its tables. */
  billing: Pick<Billing, "tagihan">;
  /** The Admin Platform Hari Kerja calendar the "2 Hari Kerja" deadline counts on. */
  lokasi: Pick<Lokasi, "adminPlatformCalendar">;
  /** Every paid Pemesanan Terencana with the two facts this trigger needs. */
  terencanaTerbayar(now: Date): Promise<TerencanaTerbayar[]>;
  reportError?: ReportError;
}

/** What one tick found and what it made of it. */
export interface TickPencairanTerencanaResult {
  /** Items created by this run. */
  items: number;
  /** Items this run made due. */
  due: number;
  /** Orders left alone on purpose (already had their items, or a refunded Tagihan). */
  dilewati: number;
}

/** The line kinds a Terencairan item can be, and so may be made due. */
const ITEM_KIND_BY_LINE: Readonly<Record<string, PencairanItemKind | undefined>> = {
  harga_hak_pakai: "harga_hak_pakai",
};

/**
 * The end of a Terencairan's Masa Pembatalan (CONTEXT.md: the period after the order
 * is paid, set per Lokasi Mitra, in which a Pembatalan refunds the full tariff), as the
 * **end of that day**: `masaPembatalanDays` whole days after the payment's own WIB day.
 * Counting to 23:59 rather than to the same clock time makes the last refundable day a
 * whole day, which is what "the end of the Masa Pembatalan" names.
 */
export function akhirMasaPembatalan(dibayarPada: Date, hari: number): Date {
  return wib(`${wibDateOf(addWibDays(dibayarPada, hari))} 23:59`);
}

/**
 * Every paid Terencairan gets its Pencairan items as soon as it is paid, and each
 * becomes due at the earlier of the end of its Masa Pembatalan and the first Pemakaman
 * under it. Idempotent.
 */
export async function tickPencairanTerencana(deps: PemicuTerencanaDeps, now: Date): Promise<TickPencairanTerencanaResult> {
  const orders = await deps.terencanaTerbayar(now);
  const hasil: TickPencairanTerencanaResult = { items: 0, due: 0, dilewati: 0 };
  if (orders.length === 0) return hasil;
  const calendar = await deps.lokasi.adminPlatformCalendar();
  const menungguJatuhTempo = new Map<string, Date>();

  for (const order of orders) {
    const tagihan = await deps.billing.tagihan(order.tagihanId);
    if (!tagihan || tagihan.status !== "lunas") continue;
    const partner = linesOfPartner(tagihan);
    if (!partner.ok) {
      deps.reportError?.(new Error("a Pemesanan Terencana Tagihan line the partner provides has no Pencairan item kind"), {
        tags: { module: "payouts", event: "pencairan_item_jenis_tidak_dikenal", nomorTagihan: tagihan.nomorTagihan },
      });
      continue;
    }
    if (partner.lines.length === 0) {
      hasil.dilewati += 1;
      continue;
    }
    // "Dibayar langsung" (the family paid the Lokasi Mitra itself) leaves no tariff owed
    // to it; the Operator's fee becomes a Potongan, which the Saat Duka trigger's
    // `potongLangsung` already records for any Tagihan whose payment effect reached it.
    // A Terencairan Tagihan is issued on the Operator's own payment routes, so this is
    // left to that trigger rather than duplicated here.
    if (await paymentWasDirect(deps.db, tagihan.id)) {
      hasil.dilewati += 1;
      continue;
    }

    const dibuat = await refusable<{ ok: true; baru: number } | { ok: false }>(deps.db, async (tx) => {
      const sudah = await tx
        .select({ id: pencairanItem.id })
        .from(pencairanItem)
        .where(eq(pencairanItem.tagihanId, tagihan.id))
        .limit(1);
      if (sudah.length > 0) return { ok: true as const, baru: 0 };
      const rows = await tx
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
            tanggalLayanan: null,
            // Not due yet: the end of the Masa Pembatalan, or a first Pemakaman if it
            // comes sooner, is what makes it due, and that is the second half of this run.
            dueAt: null,
            jatuhTempoAt: null,
            status: "belum_jatuh_tempo" as const,
            dibuatPada: now,
          })),
        )
        .onConflictDoNothing({ target: [pencairanItem.tagihanId, pencairanItem.tagihanPosisi] })
        .returning({ id: pencairanItem.id });
      return { ok: true as const, baru: rows.length };
    });
    if (!dibuat.ok) continue;
    if (dibuat.baru === 0) {
      hasil.dilewati += 1;
      continue;
    }
    hasil.items += dibuat.baru;
    menungguJatuhTempo.set(tagihan.id, dueAtOf(tagihan.paidAt ?? now, order));
  }

  hasil.due += await jadikanJatuhTempo(deps, menungguJatuhTempo, now, calendar);
  return hasil;
}

/**
 * The instant a Terencairan's item becomes due: the end of its Masa Pembatalan, or the
 * first Pemakaman under it when that burial came sooner. A whole date is counted from
 * the start of its own WIB day, since a burial has no time of day.
 */
function dueAtOf(dibayarPada: Date, order: TerencanaTerbayar): Date {
  const akhir = akhirMasaPembatalan(dibayarPada, order.masaPembatalanDays);
  if (order.pemakamanPertamaPada === null) return akhir;
  const pemakaman = wib(`${order.pemakamanPertamaPada} 00:00`);
  return pemakaman < akhir ? pemakaman : akhir;
}

/**
 * Every item this run created whose own instant has passed becomes due, with the
 * 2 Hari Kerja deadline stamped on the Admin Platform calendar. Idempotent, and safe
 * with two workers at once: `itemJatuhTempo` is guarded on `due_at is null`, so exactly
 * one of them moves each item.
 */
async function jadikanJatuhTempo(
  deps: PemicuTerencanaDeps,
  menungguJatuhTempo: ReadonlyMap<string, Date>,
  now: Date,
  calendar: Awaited<ReturnType<Lokasi["adminPlatformCalendar"]>>,
): Promise<number> {
  let due = 0;
  for (const [tagihanId, dueAt] of menungguJatuhTempo) {
    if (dueAt > now) continue;
    const items = await deps.db
      .select({ id: pencairanItem.id })
      .from(pencairanItem)
      .where(eq(pencairanItem.tagihanId, tagihanId));
    for (const item of items) {
      const moved = await deps.db.transaction((tx) => itemJatuhTempo(tx, item.id, { now: dueAt, jatuhTempoAt: tenggat(dueAt, calendar) }));
      if (moved.ok) due += 1;
    }
  }
  return due;
}

/** The 2 Hari Kerja deadline on the Admin Platform calendar, which the tick reads once for a whole run. */
function tenggat(dueAt: Date, calendar: Awaited<ReturnType<Lokasi["adminPlatformCalendar"]>>): Date {
  const deadline = addWorkingDays(calendar, dueAt, TENGGAT_PENCAIRAN_HARI_KERJA);
  if (!deadline.ok) throw new Error(`the Admin Platform calendar has no Hari Kerja ahead of ${dueAt.toISOString()}`);
  return deadline.at;
}

/**
 * The Lokasi Mitra's own lines of this Tagihan, in the order they were issued. A line
 * that is not a kind an item can be is **refused**, never silently dropped: a partner
 * line with no item is money that would leave the book without ever reaching the
 * Lokasi Mitra that holds the plot.
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

/**
 * Whether this Tagihan's money went straight to the Lokasi Mitra rather than through
 * the Operator, read from the payment fact the trigger's own Lunas half already keeps
 * (`pencairan_pembayaran`, written by `./efek.ts`). It is `false` when there is no such
 * row, which is every Tagihan the Operator collected itself.
 */
async function paymentWasDirect(db: Database, tagihanId: string): Promise<boolean> {
  const [row] = await db
    .select({ metode: pencairanPembayaran.metode })
    .from(pencairanPembayaran)
    .where(eq(pencairanPembayaran.tagihanId, tagihanId));
  const metode = row ? paymentMethodSchema.safeParse(row.metode) : null;
  return metode?.success === true && metode.data.kind === "langsung_ke_lokasi";
}
