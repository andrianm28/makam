/**
 * The Saat Duka Pencairan trigger (spec, Billing > Payouts: "Saat Duka Petak and
 * a later burial's Biaya Pemakaman | Lunas **and** Pemakaman recorded"; ticket
 * 32's AC 1, 2, 3, 9).
 *
 * The two halves of that condition are written by the two modules that own
 * them, each in its own transaction and neither reading the other back:
 * - the Lunas half by the payment effect (`./efek.ts`), inside the transaction
 *   that settles the Tagihan — that half runs in this release;
 * - the burial half by `pemakamanTercatat`, whose caller is the Pemakaman module
 *   (ticket 25) and is **not merged yet**, so in this release the tests are the
 *   only thing that writes it.
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
import { and, eq, isNotNull, isNull, lte, notExists } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { refusable } from "@/db/unit-of-work";
import { paymentMethodSchema, type Billing, type Tagihan, type TagihanLine } from "@/domain/billing";
import { addWorkingDays, type Lokasi } from "@/domain/lokasi";
import type { ReportError } from "@/lib/observability/report-error";
import { sumRupiah, type Rupiah } from "@/lib/rupiah";
import type { Clock } from "@/ports/clock";
import { pencairanItem, pencairanPemakaman, pencairanPembayaran, pencairanTerencana, type PencairanItemKind } from "./schema";
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
  billing: Pick<Billing, "tagihan" | "pembayaranPerluDitinjau">;
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
 * the Saat Duka trigger. The caller is the Pemakaman module (ticket 25), calling
 * it inside its own transaction so the fact commits with the burial; the item it
 * makes due is written by the tick, whether the money arrived before or after.
 *
 * **No caller exists yet**: ticket 25 is not merged, so in this release only the
 * tests write the fact, and both orders (money first, burial first) are driven
 * directly in `./trigger.test.ts`.
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

/** Which trigger is writing an order's items: the Saat Duka / Terencana ones, or the Perpanjangan one (ticket 40). */
type Jalur = "saat_duka" | "perpanjangan";

/**
 * Whether the trigger that is running owns a line kind, and so may make its item
 * due. The Saat Duka and Terencana triggers own the Petak's tariff and the Biaya
 * Pemakaman; the Perpanjangan trigger (ticket 40: "Perpanjangan | on payment") owns
 * the Perpanjangan line, due at the instant of payment.
 */
function milikTriggerIni(jalur: Jalur, kind: TagihanLine["kind"]): boolean {
  return jalur === "perpanjangan" ? kind === "perpanjangan" : kind === "harga_hak_pakai" || kind === "biaya_pemakaman";
}

/**
 * A Harga Khusus partner share (ticket 30) recorded on the issued Tagihan,
 * taken off the Lokasi Mitra's own lines at the moment their items are
 * created — oldest line first, the same rule `kurangiPencairanPesanan` applies
 * to an item that already exists. An item the share empties completely is
 * created already `dibatalkan` rather than at Rp 0 (mirrors that function's
 * own rule: a Bukti Pencairan never carries a Rp 0 line).
 */
function porsiMitraOf(
  tagihan: Tagihan,
  partnerLines: readonly { position: number; line: PartnerLine }[],
): Map<number, { jumlahDisesuaikan: Rupiah; habis: boolean }> {
  const adjustments = new Map<number, { jumlahDisesuaikan: Rupiah; habis: boolean }>();
  const porsi = tagihan.hargaKhususPorsiMitra;
  if (!porsi || porsi.amount <= 0) return adjustments;
  let sisa = porsi.amount as number;
  for (const { position, line } of partnerLines) {
    if (sisa <= 0) break;
    const dipotong = Math.min(line.amount, sisa);
    adjustments.set(position, { jumlahDisesuaikan: (line.amount - dipotong) as Rupiah, habis: dipotong === line.amount });
    sisa -= dipotong;
  }
  return adjustments;
}

/** The deadline on the Admin Platform calendar: 2 Hari Kerja after the item became due (AC 6). */
function tenggat(dueAt: Date, calendar: Awaited<ReturnType<Lokasi["adminPlatformCalendar"]>>): Date {
  const deadline = addWorkingDays(calendar, dueAt, TENGGAT_PENCAIRAN_HARI_KERJA);
  if (!deadline.ok) throw new Error(`the Admin Platform calendar has no Hari Kerja ahead of ${dueAt.toISOString()}`);
  return deadline.at;
}

/**
 * One paid order's Pencairan, made due at `dueAt`: what both triggers do once
 * their own condition holds. Everything an order's items need is read from the
 * issued Tagihan, and the whole is one transaction that skips an order whose items
 * already exist, so calling it again (a second tick, the other trigger arriving
 * later) changes nothing.
 */
async function tulisPencairan(
  deps: PemicuDeps,
  row: { tagihanId: string; jalur: Jalur; metode: unknown; dibatalkan: Date | null; dibayarPada: Date; dueAt: Date },
  calendar: Awaited<ReturnType<Lokasi["adminPlatformCalendar"]>>,
  now: Date,
): Promise<HasilSatu> {
  // A payment method that does not read is not a trigger this module acts on:
  // a row it cannot understand is left alone rather than guessed at.
  const metode = paymentMethodSchema.safeParse(row.metode);
  if (!metode.success) return { ok: false, dibuat: 0, dilewati: false, potongan: false };
  // Read before the transaction opens, so a write never holds its connection
  // while another read is pending.
  const tagihan = await deps.billing.tagihan(row.tagihanId);
  if (!tagihan) return { ok: false, dibuat: 0, dilewati: false, potongan: false };
  // Not a Perpanjangan after all (a payment with no order that this trigger does not own): left alone.
  if (row.jalur === "perpanjangan" && !tagihan.lines.some((line) => line.kind === "perpanjangan" && line.provider.kind === "lokasi_mitra")) {
    return { ok: false, dibuat: 0, dilewati: false, potongan: false };
  }
  const langsung = metode.data.kind === "langsung_ke_lokasi" && !row.dibatalkan;
  const ditulis = await refusable<{ ok: boolean; dibuat: number; dilewati: boolean }>(deps.db, async (tx) => {
    const sudah = await tx
      .select({ id: pencairanItem.id })
      .from(pencairanItem)
      .where(eq(pencairanItem.tagihanId, row.tagihanId))
      .limit(1);
    if (sudah.length > 0) return { ok: true, dibuat: 0, dilewati: true };
    const partner = linesOfPartner(tagihan);
    if (!partner.ok) {
      deps.reportError?.(new Error("a Tagihan line the partner provides has no Pencairan item kind"), {
        tags: { module: "payouts", event: "pencairan_item_jenis_tidak_dikenal", nomorTagihan: tagihan.nomorTagihan },
      });
      return { ok: false, dibuat: 0, dilewati: false };
    }
    // A Tagihan refunded in full owes nobody anything: the family's money went
    // back to them, so no partner is paid for it and nothing is clawed back
    // afterwards (the owner's decision recorded in the ticket's Comments).
    if (tagihan.status === "dikembalikan_penuh") return { ok: true, dibuat: 0, dilewati: true };

    const jatuhTempoAt = tenggat(row.dueAt, calendar);
    if (langsung) {
      // "Dibayar langsung": the family paid the Lokasi Mitra itself, so no
      // tariff is owed to it — and the Operator's own fee becomes a Potongan.
      return { ok: true, dibuat: await potongLangsung(tx, tagihan, partner.lines, now), dilewati: false };
    }
    const porsiMitra = porsiMitraOf(tagihan, partner.lines);
    const dibuat = await tx
      .insert(pencairanItem)
      .values(
        partner.lines.map(({ position, line }) => {
          const adjustment = porsiMitra.get(position);
          return {
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
            dueAt: milikTriggerIni(row.jalur, line.kind) ? row.dueAt : null,
            jatuhTempoAt: milikTriggerIni(row.jalur, line.kind) ? jatuhTempoAt : null,
            status:
              adjustment?.habis ? ("dibatalkan" as const) : milikTriggerIni(row.jalur, line.kind) ? ("jatuh_tempo" as const) : ("belum_jatuh_tempo" as const),
            batalAlasan: adjustment?.habis ? ("telah_ditanggung" as const) : null,
            batalPada: adjustment?.habis ? now : null,
            jumlahDisesuaikan: adjustment && !adjustment.habis ? adjustment.jumlahDisesuaikan : null,
            alasanPenyesuaian: adjustment && !adjustment.habis ? ("porsi_pemegang_saham" as const) : null,
            catatanPenyesuaian: adjustment && !adjustment.habis ? tagihan.hargaKhususPorsiMitra!.catatan : null,
            disesuaikanPada: adjustment && !adjustment.habis ? now : null,
            dibuatPada: now,
          };
        }),
      )
      .onConflictDoNothing({ target: [pencairanItem.tagihanId, pencairanItem.tagihanPosisi] })
      .returning({ id: pencairanItem.id });
    return { ok: true, dibuat: dibuat.length, dilewati: false };
  });
  return { ...ditulis, potongan: langsung };
}

/** What writing one order's Pencairan came to. */
interface HasilSatu {
  ok: boolean;
  dibuat: number;
  dilewati: boolean;
  /** The order was paid straight to the Lokasi Mitra, so what was written is a Potongan, not items. */
  potongan: boolean;
}

/** Adds one order's outcome to a tick's totals. */
function catat(hasil: TickPencairanResult, satu: HasilSatu): void {
  if (!satu.ok) return;
  if (satu.dilewati) hasil.dilewati += 1;
  else if (satu.potongan) hasil.potongan += satu.dibuat;
  else hasil.items += satu.dibuat;
}

/**
 * Every order whose Tagihan is Lunas **and** whose Pemakaman is recorded gets
 * its Pencairan items, due from the later of the two instants. Idempotent.
 *
 * A Pemesanan Terencana has its own trigger beside it (`tickPencairanTerencana`,
 * run first): its Hak Pakai item is due at the end of the Masa Pembatalan, or at
 * the first Pemakaman if that comes sooner, and the Pemakaman is this trigger's own
 * fact, so the sooner of the two is whichever condition the ticks find first.
 */
export async function tickPencairan(deps: PemicuDeps, now: Date): Promise<TickPencairanResult> {
  const { hasil: terencana, diperiksa } = await tickPencairanTerencana(deps, now);
  const menunggu = await deps.db
    .select({
      tagihanId: pencairanPembayaran.tagihanId,
      nomorPemesanan: pencairanPembayaran.nomorPemesanan,
      dibayarPada: pencairanPembayaran.dibayarPada,
      metode: pencairanPembayaran.metode,
      // Ticket 30's AC 2 reversal: once set, this row is treated as an
      // ordinary partner-paid order below, whatever `metode` still says.
      dibatalkan: pencairanPembayaran.dibayarLangsungDibatalkanPada,
      pemakamanPada: pencairanPemakaman.pemakamanPada,
    })
    .from(pencairanPembayaran)
    .innerJoin(pencairanPemakaman, eq(pencairanPemakaman.nomorPemesanan, pencairanPembayaran.nomorPemesanan))
    .where(isNotNull(pencairanPembayaran.nomorPemesanan))
    .orderBy(pencairanPembayaran.dibayarPada);
  // A Perpanjangan is no Pemesanan (it has no Nomor Pemesanan and no burial to
  // wait for): every settled Tagihan without one and without items yet is a
  // candidate, and only one carrying a Perpanjangan line of a Lokasi Mitra
  // becomes items, due at the instant of payment (ticket 40).
  const perpanjangan = await deps.db
    .select({
      tagihanId: pencairanPembayaran.tagihanId,
      dibayarPada: pencairanPembayaran.dibayarPada,
      metode: pencairanPembayaran.metode,
      dibatalkan: pencairanPembayaran.dibayarLangsungDibatalkanPada,
    })
    .from(pencairanPembayaran)
    .where(
      and(
        isNull(pencairanPembayaran.nomorPemesanan),
        notExists(deps.db.select({ one: pencairanItem.id }).from(pencairanItem).where(eq(pencairanItem.tagihanId, pencairanPembayaran.tagihanId))),
      ),
    )
    .orderBy(pencairanPembayaran.dibayarPada);
  if (menunggu.length === 0 && perpanjangan.length === 0) return terencana;

  const calendar = await deps.lokasi.adminPlatformCalendar();
  const hasil: TickPencairanResult = { ...terencana };
  for (const row of menunggu) {
    // An order the Terencana trigger just looked at is not this trigger's to count a second time.
    if (row.nomorPemesanan === null || diperiksa.has(row.tagihanId)) continue;
    const dueAt = new Date(Math.max(row.dibayarPada.getTime(), row.pemakamanPada.getTime()));
    catat(hasil, await tulisPencairan(deps, { ...row, jalur: "saat_duka", dueAt }, calendar, now));
  }
  if (perpanjangan.length > 0) {
    // A payment under review (money that could not be applied, ticket 40) owes the Lokasi nothing until
    // Admin Platform decides, so it is not a candidate: a refund settles it, and applying it is by hand.
    const dalamTinjauan = new Set((await deps.billing.pembayaranPerluDitinjau()).flatMap((entry) => (entry.tagihan ? [entry.tagihan.id] : [])));
    for (const row of perpanjangan) {
      if (dalamTinjauan.has(row.tagihanId)) continue;
      catat(hasil, await tulisPencairan(deps, { ...row, jalur: "perpanjangan", dueAt: row.dibayarPada }, calendar, now));
    }
  }
  return hasil;
}

/**
 * Records that a Pemesanan Terencana was paid and its Masa Pembatalan runs until
 * `berakhirPada` (spec, Billing > Payouts: "Pemesanan Terencana Hak Pakai | end of
 * the Masa Pembatalan, or the first Pemakaman if sooner"; ticket 37). The caller is
 * the Pemesanan module, inside the very transaction that makes the order Aktif, so
 * the fact commits with the payment; the item it makes due is the tick's. Idempotent:
 * recording the same order again keeps the first end.
 */
export async function masaPembatalanDimulai(tx: Database, input: { nomorPemesanan: string; berakhirPada: Date }): Promise<void> {
  const nomor = nomorPemesananSchema.safeParse(input.nomorPemesanan);
  const berakhirPada = z.date().safeParse(input.berakhirPada);
  if (!nomor.success || !berakhirPada.success) {
    throw new Error("masaPembatalanDimulai needs a Nomor Pemesanan and the instant the Masa Pembatalan ends");
  }
  await tx
    .insert(pencairanTerencana)
    .values({ nomorPemesanan: nomor.data, masaPembatalanBerakhirPada: berakhirPada.data })
    .onConflictDoNothing();
}

/**
 * Every paid Pemesanan Terencana whose Masa Pembatalan has ended gets its Pencairan
 * items, due at that end, or at the first Pemakaman recorded under it when that came
 * sooner. Reads the two facts (the Lunas half from the payment effect, the Masa
 * Pembatalan from `masaPembatalanDimulai`), so it is idempotent twice over: an order
 * that already has its items is skipped, and the unique index on an item's Tagihan
 * line makes a repeated insert a no-op.
 */
async function tickPencairanTerencana(deps: PemicuDeps, now: Date): Promise<{ hasil: TickPencairanResult; diperiksa: Set<string> }> {
  const selesai = await deps.db
    .select({
      tagihanId: pencairanPembayaran.tagihanId,
      nomorPemesanan: pencairanPembayaran.nomorPemesanan,
      dibayarPada: pencairanPembayaran.dibayarPada,
      metode: pencairanPembayaran.metode,
      dibatalkan: pencairanPembayaran.dibayarLangsungDibatalkanPada,
      berakhirPada: pencairanTerencana.masaPembatalanBerakhirPada,
      pemakamanPada: pencairanPemakaman.pemakamanPada,
    })
    .from(pencairanPembayaran)
    .innerJoin(pencairanTerencana, eq(pencairanTerencana.nomorPemesanan, pencairanPembayaran.nomorPemesanan))
    .leftJoin(pencairanPemakaman, eq(pencairanPemakaman.nomorPemesanan, pencairanPembayaran.nomorPemesanan))
    .where(and(isNotNull(pencairanPembayaran.nomorPemesanan), lte(pencairanTerencana.masaPembatalanBerakhirPada, now)))
    .orderBy(pencairanPembayaran.dibayarPada);
  const hasil: TickPencairanResult = { items: 0, potongan: 0, dilewati: 0 };
  const diperiksa = new Set<string>();
  if (selesai.length === 0) return { hasil, diperiksa };

  const calendar = await deps.lokasi.adminPlatformCalendar();
  for (const row of selesai) {
    if (row.nomorPemesanan === null) continue;
    diperiksa.add(row.tagihanId);
    const lebihAwal = row.pemakamanPada && row.pemakamanPada < row.berakhirPada ? row.pemakamanPada : row.berakhirPada;
    const dueAt = new Date(Math.max(row.dibayarPada.getTime(), lebihAwal.getTime()));
    catat(hasil, await tulisPencairan(deps, { ...row, jalur: "saat_duka", dueAt }, calendar, now));
  }
  return { hasil, diperiksa };
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
