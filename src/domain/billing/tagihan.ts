import { and, asc, desc, eq, ilike, inArray, isNotNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { refusable } from "@/db/unit-of-work";
import { normalisePhoneNumber, type PhoneNumberRejection } from "@/domain/identity";
import type { OperatorSettings } from "@/domain/operator-settings";
import { RUPIAH_MAX, rupiahSchema, sumRupiah, type Rupiah } from "@/lib/rupiah";
import { tagihanDue, type DueLine, type PaymentMoment, type TagihanKind } from "./due-rules";
import { nextDocumentNumber } from "./numbering";
import { tagihan, tagihanLine, type tagihanStatuses } from "./schema";
import { issueBuktiPembayaranIn, type EffectDeps } from "./settlement";
import { currentHeader, headerSchema, momentOf, newDocumentLink, noHeader, withinPaymentCap, type DocumentHeader } from "./shared";

/** Who provides a line: the Lokasi Mitra for its tariff lines (named as it was at issue), the Operator, or the Pemda. */
export type LineProvider = { kind: "lokasi_mitra"; lokasiId: string; name: string } | { kind: "operator" } | { kind: "pemda" };

/** The tariff lines a quote prices (Tariffs' QuotedLine kinds). */
export const TARIFF_LINE_KINDS = [
  "harga_hak_pakai",
  "biaya_pemakaman",
  "perpanjangan",
  "biaya_pengurusan",
  "retribusi_pemda",
  "biaya_layanan_platform",
] as const;
export type TariffLineKind = (typeof TARIFF_LINE_KINDS)[number];

/** How a Harga Khusus reads on every Tagihan. */
export const PENYESUAIAN_HARGA_KHUSUS = "Penyesuaian Harga Khusus";

/**
 * A line to issue. `label` is the wording the Tagihan keeps (e.g. from
 * `quoteLineLabel`). A Harga Khusus is its own line, the reduction given as
 * a positive amount and shown negative.
 */
export type NewTagihanLine =
  | { kind: TariffLineKind; label: string; amount: Rupiah; provider: LineProvider }
  /** A Layanan for a target date (WIB "YYYY-MM-DD"); `leadTimeDays` is the Layanan's lead time. */
  | { kind: "layanan"; label: string; amount: Rupiah; provider: LineProvider; targetDate: string; leadTimeDays: number }
  | { kind: "penyesuaian_harga_khusus"; amount: Rupiah };

/** A line as issued; `amount` is whole rupiah, negative only for the Penyesuaian Harga Khusus. */
export type TagihanLine =
  | { kind: TariffLineKind; label: string; amount: number; provider: LineProvider }
  | { kind: "layanan"; label: string; amount: number; provider: LineProvider; targetDate: string; leadTimeDays: number }
  | { kind: "penyesuaian_harga_khusus"; label: string; amount: number; provider: { kind: "operator" } };

export type TagihanStatus = (typeof tagihanStatuses)[number];

/**
 * Every Tagihan status that still needs the family's money — the same set a
 * reissue is offered for (`REISSUABLE`, below): once nothing is owed any more
 * (Lunas, Dibatalkan, Dikembalikan) or the Operator has stopped chasing it
 * (Tidak Tertagih — CONTEXT.md: "stays payable, but no one is owed a Pencairan
 * for it"), there is nothing left to pay or to reissue for. One classification,
 * because reissuable and still-owed are one fact about the Tagihan, not two.
 */
export const TAGIHAN_PERLU_DIBAYAR: readonly TagihanStatus[] = ["belum_dibayar", "lewat_jatuh_tempo"];

/** Whether `status` still needs the family's money (Akun Saya's Perlu Tindakan strip, ticket 27). */
export function tagihanPerluDibayar(status: TagihanStatus): boolean {
  return TAGIHAN_PERLU_DIBAYAR.includes(status);
}

export interface Tagihan {
  id: string;
  nomorTagihan: string;
  status: TagihanStatus;
  kind: TagihanKind;
  issuedAt: Date;
  dueAt: Date;
  /** The Pemesan, or the Pemegang Hak for a Perpanjangan. Anyone may pay. */
  addressee: { role: "pemesan" | "pemegang_hak"; name: string; phoneNumber: string; accountId: string | null };
  nomorPemesanan: string | null;
  /** The Lokasi Makam the Tagihan is for, as named at issue. */
  placeName: string | null;
  lines: TagihanLine[];
  total: Rupiah;
  header: DocumentHeader;
  /** The unguessable part of the Tagihan page's link. */
  link: string;
  replacesNomorTagihan: string | null;
  replacedByNomorTagihan: string | null;
  cancelledReason: "batas_pembayaran_lewat" | "diganti" | "pemesanan_dibatalkan" | null;
  /**
   * The refund this Tagihan's cancellation asked for, or null while none has been
   * asked (no money came in, or only the Biaya Layanan Platform did). Approving
   * and paying it out is ticket 31's; recording it here is what stops a
   * cancellation from losing a payment (ticket 24).
   */
  pengembalianDiminta: { jumlah: Rupiah; dimintaPada: Date } | null;
  /**
   * The share of a Harga Khusus reduction the Lokasi Mitra agreed to bear,
   * entered when this Tagihan was reissued for one (ticket 30); null while
   * none was entered. 0 means the Operator bears the whole reduction.
   */
  hargaKhususPorsiMitra: { amount: Rupiah; catatan: string } | null;
}

export interface IssueTagihanInput {
  moment: PaymentMoment;
  addressee: { name: string; phoneNumber: string; accountId: string | null };
  nomorPemesanan: string | null;
  placeName: string | null;
  lines: NewTagihanLine[];
  /** The partner share of a Harga Khusus reduction (ticket 30's `tetapkanHargaKhusus` only). */
  hargaKhususPorsiMitra?: { amount: Rupiah; catatan: string } | null;
}

export type IssueRefusal =
  /** No lines, or a malformed line (e.g. a Layanan without a target date, or a standalone Layanan order without Layanan). */
  | { ok: false; reason: "baris_tidak_valid" }
  /** The Harga Khusus is larger than the other lines together. */
  | { ok: false; reason: "harga_khusus_melebihi_total" }
  /** The total would pass Rp 100.000.000.000. */
  | { ok: false; reason: "jumlah_terlalu_besar" }
  /** The total would pass Rp 10.000.000, the QRIS payment cap: v1 takes no such order. */
  | { ok: false; reason: "melebihi_batas_qris" }
  /** No Pengaturan Operator yet: a Tagihan cannot be issued without the Operator's header. */
  | { ok: false; reason: "pengaturan_operator_belum_diisi" }
  | PhoneNumberRejection;

export type IssueTagihanResult = { ok: true; tagihan: Tagihan } | IssueRefusal;

export type ReissueTagihanResult =
  | { ok: true; tagihan: Tagihan; cancelled: Tagihan }
  | IssueRefusal
  | { ok: false; reason: "tidak_ditemukan" }
  /** Only an unpaid Tagihan (Belum Dibayar, Lewat Jatuh Tempo) can be cancelled and reissued. */
  | { ok: false; reason: "tagihan_tidak_bisa_diganti" };

export interface TagihanDeps extends EffectDeps {
  db: Database;
  operatorSettings: Pick<OperatorSettings, "current">;
}

const wibDate = z.iso.date();
const idText = z.string().trim().min(1).max(200);
const labelText = z.string().trim().min(1).max(300);
const providerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("lokasi_mitra"), lokasiId: idText, name: labelText }),
  z.object({ kind: z.literal("operator") }),
  z.object({ kind: z.literal("pemda") }),
]);
const newLineSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.enum(TARIFF_LINE_KINDS), label: labelText, amount: rupiahSchema, provider: providerSchema }),
  z.object({
    kind: z.literal("layanan"),
    label: labelText,
    amount: rupiahSchema,
    provider: providerSchema,
    targetDate: wibDate,
    leadTimeDays: z.number().int().min(0).max(365),
  }),
  z.object({ kind: z.literal("penyesuaian_harga_khusus"), amount: rupiahSchema }),
]);

/** The lines as issued, or why they are refused. */
function linesToIssue(lines: readonly NewTagihanLine[]): { ok: true; lines: TagihanLine[]; total: Rupiah } | IssueRefusal {
  const parsed = z.array(newLineSchema).min(1).safeParse(lines);
  if (!parsed.success) return { ok: false, reason: "baris_tidak_valid" };
  const issued: TagihanLine[] = parsed.data.map((line) =>
    line.kind === "penyesuaian_harga_khusus"
      ? { kind: line.kind, label: PENYESUAIAN_HARGA_KHUSUS, amount: -line.amount, provider: { kind: "operator" } }
      : line,
  );
  const charged = sumRupiah(issued.flatMap((line) => (line.amount > 0 ? [line.amount as Rupiah] : [])));
  if (!charged.ok) return charged;
  const reduced = issued.reduce((sum, line) => sum + Math.min(line.amount, 0), 0);
  const total = charged.amount + reduced;
  if (total < 0) return { ok: false, reason: "harga_khusus_melebihi_total" };
  if (total > RUPIAH_MAX) return { ok: false, reason: "jumlah_terlalu_besar" };
  if (!withinPaymentCap(total)) return { ok: false, reason: "melebihi_batas_qris" };
  return { ok: true, lines: issued, total: total as Rupiah };
}

const dueLine = (line: TagihanLine): DueLine =>
  line.kind === "layanan" ? { kind: "layanan", targetDate: line.targetDate, leadTimeDays: line.leadTimeDays } : { kind: "other" };

/** Called inside the issuing transaction once the Tagihan and its lines exist, before any Rp 0 settlement effect runs. */
export type SebelumBukti = (
  tx: Database,
  baru: { id: string; nomorTagihan: string; link: string; total: number; dueAt: Date },
) => Promise<void>;

/**
 * Issues a Tagihan in `db`'s transaction at `now`; `replaces` is the Tagihan
 * it replaces, whose payment moment (and due-date anchor) it keeps.
 */
async function issueIn(
  tx: Database,
  deps: EffectDeps,
  input: IssueTagihanInput & { anchorAt: Date; sebelumBukti?: SebelumBukti },
  header: DocumentHeader,
  now: Date,
  replacesId: string | null,
): Promise<IssueTagihanResult> {
  const checked = linesToIssue(input.lines);
  if (!checked.ok) return checked;
  const phone = normalisePhoneNumber(input.addressee.phoneNumber);
  if (!phone.ok) return phone;
  const name = input.addressee.name.trim();
  if (name === "") return { ok: false, reason: "baris_tidak_valid" };
  if (input.moment.kind === "layanan" && !checked.lines.some((line) => line.kind === "layanan")) {
    return { ok: false, reason: "baris_tidak_valid" };
  }
  const due = tagihanDue(input.moment, checked.lines.map(dueLine), input.anchorAt);
  const nomor = await nextDocumentNumber(tx, "TGH", now);
  const [row] = await tx
    .insert(tagihan)
    .values({
      nomor,
      link: newDocumentLink(),
      kind: due.kind,
      moment: { ...input.moment, anchorAt: input.anchorAt },
      issuedAt: now,
      dueAt: due.dueAt,
      addresseeRole: input.moment.kind === "perpanjangan" ? "pemegang_hak" : "pemesan",
      addresseeName: name,
      addresseePhone: phone.phoneNumber,
      addresseeAccountId: input.addressee.accountId,
      nomorPemesanan: input.nomorPemesanan,
      placeName: input.placeName,
      lineCount: checked.lines.length,
      total: checked.total,
      header,
      replacesId,
      // A Rp 0 Tagihan (a Harga Khusus waiver) is Lunas at once.
      status: checked.total === 0 ? "lunas" : "belum_dibayar",
      paidAt: checked.total === 0 ? now : null,
      hargaKhususPorsiMitra: input.hargaKhususPorsiMitra?.amount ?? null,
      hargaKhususPorsiMitraCatatan: input.hargaKhususPorsiMitra?.catatan ?? null,
    })
    .returning({ id: tagihan.id, link: tagihan.link });
  await tx.insert(tagihanLine).values(
    checked.lines.map((line, position) => ({
      tagihanId: row.id,
      position,
      kind: line.kind,
      label: line.label,
      amount: line.amount,
      provider: line.provider,
      layananTargetDate: line.kind === "layanan" ? line.targetDate : null,
      layananLeadTimeDays: line.kind === "layanan" ? line.leadTimeDays : null,
    })),
  );
  // Before a Rp 0 settlement's effects run, so whoever announces the Tagihan has recorded its contact by then.
  await input.sebelumBukti?.(tx, { id: row.id, nomorTagihan: nomor, link: row.link, total: checked.total, dueAt: due.dueAt });
  if (checked.total === 0) {
    await issueBuktiPembayaranIn(
      tx,
      deps,
      {
        tagihanId: row.id,
        nomorTagihan: nomor,
        nomorPemesanan: input.nomorPemesanan,
        link: row.link,
        amount: checked.total,
        method: { kind: "tanpa_pembayaran" },
        reference: null,
        header,
        paidAt: now,
      },
      now,
    );
  }
  const issued = await readTagihan(tx, row.id);
  if (!issued) throw new Error("issued Tagihan not found");
  return { ok: true, tagihan: issued };
}

export async function issueTagihan(deps: TagihanDeps, input: IssueTagihanInput, now: Date): Promise<IssueTagihanResult> {
  const header = await currentHeader(deps.operatorSettings);
  if (!header) return noHeader;
  return refusable(deps.db, (tx) => issueIn(tx, deps, { ...input, anchorAt: now }, header, now, null));
}

/**
 * Tagihan that can still be cancelled and reissued: not paid, not cancelled,
 * not given up — exactly `TAGIHAN_PERLU_DIBAYAR`, see its own comment.
 */
const REISSUABLE = TAGIHAN_PERLU_DIBAYAR;

/**
 * Cancels an unpaid Tagihan and issues its replacement with these lines and a
 * new Nomor Tagihan, in one transaction. The replacement keeps the payment
 * moment, the addressee and the order, and its due date counts from the
 * original issue, so a reissue never extends the time to pay.
 */
export async function reissueTagihan(
  deps: TagihanDeps,
  tagihanId: string,
  input: { lines: NewTagihanLine[]; hargaKhususPorsiMitra?: { amount: Rupiah; catatan: string } | null; sebelumBukti?: SebelumBukti },
  now: Date,
): Promise<ReissueTagihanResult> {
  const header = await currentHeader(deps.operatorSettings);
  if (!header) return noHeader;
  return refusable<ReissueTagihanResult>(deps.db, async (tx) => {
    if (!z.uuid().safeParse(tagihanId).success) return { ok: false, reason: "tidak_ditemukan" };
    const [old] = await tx.select().from(tagihan).where(eq(tagihan.id, tagihanId)).for("update");
    if (!old) return { ok: false, reason: "tidak_ditemukan" };
    // Immutability holds even a moment before the lapse tick runs: a pay-first
    // Tagihan at or past its own due date has already lapsed in fact, whether or
    // not the tick has caught up yet (spec, Billing: "a reissue never extends the
    // time to pay"), so it is refused here exactly as `notPayableBecause` refuses
    // a payment on it.
    const lapsedInFact = old.kind === "pay_first" && old.dueAt <= now;
    if (!REISSUABLE.includes(old.status) || lapsedInFact) return { ok: false, reason: "tagihan_tidak_bisa_diganti" };
    const { anchorAt, ...moment } = momentOf(old.moment);
    const reissued = await issueIn(
      tx,
      deps,
      {
        moment,
        anchorAt,
        addressee: { name: old.addresseeName, phoneNumber: old.addresseePhone, accountId: old.addresseeAccountId },
        nomorPemesanan: old.nomorPemesanan,
        placeName: old.placeName,
        lines: input.lines,
        hargaKhususPorsiMitra: input.hargaKhususPorsiMitra,
        sebelumBukti: input.sebelumBukti,
      },
      header,
      now,
      old.id,
    );
    if (!reissued.ok) return reissued;
    await tx
      .update(tagihan)
      .set({ status: "dibatalkan", cancelledAt: now, cancelledReason: "diganti", replacedById: reissued.tagihan.id })
      .where(eq(tagihan.id, old.id));
    const cancelled = await readTagihan(tx, old.id);
    if (!cancelled) throw new Error("cancelled Tagihan not found");
    return { ok: true, tagihan: reissued.tagihan, cancelled };
  });
}

/**
 * The lapse of pay-first Tagihan: every one still Belum Dibayar at its due
 * date becomes Dibatalkan ("batas pembayaran lewat"). Pay-after Tagihan never
 * lapse. Idempotent: a Tagihan already lapsed, paid or cancelled is left alone.
 * Returns the ids lapsed by this call.
 */
export async function lapseDuePayFirstTagihan(db: Database, now: Date): Promise<string[]> {
  const lapsed = await db
    .update(tagihan)
    .set({ status: "dibatalkan", cancelledAt: now, cancelledReason: "batas_pembayaran_lewat" })
    .where(and(eq(tagihan.kind, "pay_first"), eq(tagihan.status, "belum_dibayar"), lte(tagihan.dueAt, now)))
    .returning({ id: tagihan.id });
  return lapsed.map((row) => row.id);
}

const providerOf = (value: unknown) => providerSchema.parse(value) as LineProvider;

/** One Tagihan as issued, with its lines and where it sits in a cancel-and-reissue chain. */
export async function readTagihan(db: Database, tagihanId: string): Promise<Tagihan | null> {
  if (!z.uuid().safeParse(tagihanId).success) return null;
  const [row] = await db.select().from(tagihan).where(eq(tagihan.id, tagihanId));
  if (!row) return null;
  return toTagihan(db, row);
}

/** A Lunas Tagihan the Operator still owes a town's charge on: the shape the Setor Retribusi row and its recording are about. */
export interface RetribusiTagihan {
  tagihanId: string;
  nomorTagihan: string;
  /** The order the Retribusi line was charged on, when it is about one. */
  nomorPemesanan: string | null;
  /** The TPU the charge belongs to, as the Tagihan named the place; a filing-only charge has none. */
  placeName: string | null;
  /** When the money came in, the instant the Setor Retribusi deadline counts from. */
  lunasAt: Date;
  /** The Retribusi Pemda line's own amount: what has to reach the town, never the order's total. */
  amount: number;
}

/**
 * Every Lunas Tagihan carrying a non-zero Retribusi Pemda line, oldest payment
 * first (spec, Work Queues: the Tier 3 "Setor Retribusi" row, due two working
 * days after Lunas, "only for a non-zero Retribusi Pemda line"). A Rp 0 line
 * charges the family nothing and the town is owed nothing, so it never appears:
 * every Retribusi is Rp 0 today, and v1 builds the structure only.
 */
export async function listTagihanRetribusiLunas(db: Database): Promise<RetribusiTagihan[]> {
  const rows = await db
    .select({
      id: tagihan.id,
      nomor: tagihan.nomor,
      nomorPemesanan: tagihan.nomorPemesanan,
      placeName: tagihan.placeName,
      paidAt: tagihan.paidAt,
    })
    .from(tagihan)
    .where(and(eq(tagihan.status, "lunas"), isNotNull(tagihan.paidAt)))
    .orderBy(asc(tagihan.paidAt), asc(tagihan.nomor));

  const found: RetribusiTagihan[] = [];
  for (const row of rows) {
    const [line] = await db
      .select({ amount: tagihanLine.amount })
      .from(tagihanLine)
      .where(and(eq(tagihanLine.tagihanId, row.id), eq(tagihanLine.kind, "retribusi_pemda")));
    // A Tagihan with no Retribusi line at all, or a Rp 0 one, is nobody's row.
    if (!line || line.amount <= 0 || !row.paidAt) continue;
    found.push({
      tagihanId: row.id,
      nomorTagihan: row.nomor,
      nomorPemesanan: row.nomorPemesanan,
      placeName: row.placeName,
      lunasAt: row.paidAt,
      amount: line.amount,
    });
  }
  return found;
}

/**
 * Every Tagihan whose cancellation (or another module's write) asked for money
 * back, oldest request first: the Refunds module's (ticket 31) own source for
 * what still needs an Admin Platform decision. A Tagihan a refund has already
 * been issued for stays in this list — Billing does not know Refunds' own
 * state — so the caller (Refunds) is the one that skips what it already holds
 * a request for.
 */
export async function listTagihanMenungguPengembalian(db: Database): Promise<Tagihan[]> {
  const rows = await db
    .select({ id: tagihan.id })
    .from(tagihan)
    .where(isNotNull(tagihan.pengembalianDimintaAt))
    .orderBy(asc(tagihan.pengembalianDimintaAt), asc(tagihan.id));
  const found: Tagihan[] = [];
  for (const row of rows) {
    const read = await readTagihan(db, row.id);
    if (read) found.push(read);
  }
  return found;
}

export type TandaiPengembalianResult = { ok: true } | { ok: false; reason: "tidak_ditemukan" };

/**
 * Moves a Tagihan to Dikembalikan sebagian / penuh once a Bukti Pengembalian
 * Dana is issued for it (spec, Billing > Documents; ticket 31's own write,
 * taken `within` the transaction that issues that Bukti, so the two commit
 * together). This is the one place anything but Billing itself changes a
 * Tagihan's status, because the Tagihan is Billing's own table.
 */
export async function tandaiPengembalian(
  db: Database,
  tagihanId: string,
  input: { kind: "sebagian" | "penuh" },
): Promise<TandaiPengembalianResult> {
  if (!z.uuid().safeParse(tagihanId).success) return { ok: false, reason: "tidak_ditemukan" };
  const status = input.kind === "penuh" ? "dikembalikan_penuh" : "dikembalikan_sebagian";
  const updated = await db.update(tagihan).set({ status }).where(eq(tagihan.id, tagihanId)).returning({ id: tagihan.id });
  return updated.length > 0 ? { ok: true } : { ok: false, reason: "tidak_ditemukan" };
}

/** The Tagihan behind a document link, or null. */
export async function tagihanByLink(db: Database, link: string): Promise<Tagihan | null> {
  const [row] = await db.select().from(tagihan).where(eq(tagihan.link, link));
  return row ? toTagihan(db, row) : null;
}

async function toTagihan(db: Database, row: typeof tagihan.$inferSelect): Promise<Tagihan> {
  const lines = await db.select().from(tagihanLine).where(eq(tagihanLine.tagihanId, row.id)).orderBy(asc(tagihanLine.position));
  const chained = [row.replacesId, row.replacedById].filter((id): id is string => id !== null);
  const numbers = new Map(
    chained.length === 0
      ? []
      : (await db.select({ id: tagihan.id, nomor: tagihan.nomor }).from(tagihan).where(inArray(tagihan.id, chained))).map(
          (other) => [other.id, other.nomor] as const,
        ),
  );
  return {
    id: row.id,
    nomorTagihan: row.nomor,
    status: row.status,
    kind: row.kind,
    issuedAt: row.issuedAt,
    dueAt: row.dueAt,
    addressee: {
      role: row.addresseeRole,
      name: row.addresseeName,
      phoneNumber: row.addresseePhone,
      accountId: row.addresseeAccountId,
    },
    nomorPemesanan: row.nomorPemesanan,
    placeName: row.placeName,
    lines: lines.map(toLine),
    total: row.total,
    header: headerSchema.parse(row.header),
    link: row.link,
    replacesNomorTagihan: row.replacesId ? (numbers.get(row.replacesId) ?? null) : null,
    replacedByNomorTagihan: row.replacedById ? (numbers.get(row.replacedById) ?? null) : null,
    cancelledReason: row.cancelledReason,
    pengembalianDiminta:
      row.pengembalianDimintaAt && row.pengembalianJumlah !== null
        ? { jumlah: row.pengembalianJumlah, dimintaPada: row.pengembalianDimintaAt }
        : null,
    hargaKhususPorsiMitra:
      row.hargaKhususPorsiMitra !== null ? { amount: row.hargaKhususPorsiMitra, catatan: row.hargaKhususPorsiMitraCatatan ?? "" } : null,
  };
}

function toLine(row: typeof tagihanLine.$inferSelect): TagihanLine {
  const base = { label: row.label, amount: row.amount };
  if (row.kind === "penyesuaian_harga_khusus") return { ...base, kind: row.kind, provider: { kind: "operator" } };
  if (row.kind === "layanan") {
    return {
      ...base,
      kind: row.kind,
      provider: providerOf(row.provider),
      targetDate: row.layananTargetDate ?? "",
      leadTimeDays: row.layananLeadTimeDays ?? 0,
    };
  }
  return { ...base, kind: z.enum(TARIFF_LINE_KINDS).parse(row.kind), provider: providerOf(row.provider) };
}

/** One Tagihan in a lookup result: enough to recognise it and open it. */
export interface TagihanRingkas {
  id: string;
  nomorTagihan: string;
  nomorPemesanan: string | null;
  addresseeName: string;
  status: TagihanStatus;
  total: Rupiah;
  issuedAt: Date;
}

/** The most one lookup returns; a nomor is precise, so more than this means the query was too short. */
const CARI_TAGIHAN_MAX = 20;

/**
 * Finds Tagihan by Nomor Tagihan (`TGH/2026/000123`, or its start) or by the
 * Nomor Pemesanan of the order (`MKM-2026-000123`), newest first. A read for the
 * staff who must open a Tagihan by hand (ticket 30); a query shorter than 3
 * characters finds nothing, and `%`/`_` never act as wildcards.
 */
export async function cariTagihan(db: Database, query: string): Promise<TagihanRingkas[]> {
  const parsed = z.string().trim().min(3).max(40).safeParse(query);
  if (!parsed.success) return [];
  const literal = parsed.data.replace(/[\\%_]/g, (character) => `\\${character}`);
  const rows = await db
    .select({
      id: tagihan.id,
      nomor: tagihan.nomor,
      nomorPemesanan: tagihan.nomorPemesanan,
      addresseeName: tagihan.addresseeName,
      status: tagihan.status,
      total: tagihan.total,
      issuedAt: tagihan.issuedAt,
    })
    .from(tagihan)
    .where(or(ilike(tagihan.nomor, `${literal}%`), ilike(tagihan.nomorPemesanan, `${literal}%`)))
    .orderBy(desc(tagihan.issuedAt), desc(tagihan.nomor))
    .limit(CARI_TAGIHAN_MAX);
  return rows.map((row) => ({
    id: row.id,
    nomorTagihan: row.nomor,
    nomorPemesanan: row.nomorPemesanan,
    addresseeName: row.addresseeName,
    status: row.status,
    total: row.total,
    issuedAt: row.issuedAt,
  }));
}
