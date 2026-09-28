import { and, asc, eq, inArray, lte } from "drizzle-orm";
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
import { currentHeader, headerSchema, newDocumentLink, noHeader, withinPaymentCap, type DocumentHeader } from "./shared";

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

export interface Tagihan {
  id: string;
  nomorTagihan: string;
  status: TagihanStatus;
  kind: TagihanKind;
  issuedAt: Date;
  dueAt: Date;
  /**
   * When the money arrived, for a Tagihan that has been paid; null while it is unpaid.
   * A Pencairan trigger counts a Masa Pembatalan from it (ticket 37), so it is on the
   * Tagihan's own read and not only on the Bukti Pembayaran.
   */
  paidAt: Date | null;
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
  /** The Tagihan or Bukti behind a cancel-and-reissue chain, or null. */
  replacedByNomorTagihan: string | null;
  cancelledReason: "batas_pembayaran_lewat" | "diganti" | "dibatalkan_pemesan" | null;
}

export interface IssueTagihanInput {
  moment: PaymentMoment;
  addressee: { name: string; phoneNumber: string; accountId: string | null };
  nomorPemesanan: string | null;
  placeName: string | null;
  lines: NewTagihanLine[];
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

const instant = z.coerce.date();
/** A payment moment as kept on the Tagihan, plus the instant its issue-relative due rules count from. */
const storedMomentSchema = z.intersection(
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("saat_duka"), burialAt: instant, paymentWindowHours: z.number().int().min(1).max(24 * 30) }),
    z.object({ kind: z.literal("pemakaman_hak_pakai_ada"), burialAt: instant }),
    z.object({ kind: z.literal("terencana"), holdExpiresAt: instant }),
    z.object({ kind: z.literal("perpanjangan") }),
    z.object({ kind: z.literal("pengurusan_berkas") }),
    z.object({ kind: z.literal("layanan") }),
    z.object({ kind: z.literal("paket_cycle"), cycleDate: wibDate }),
  ]),
  z.object({ anchorAt: instant }),
);
type StoredMoment = PaymentMoment & { anchorAt: Date };

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

/**
 * Issues a Tagihan in `db`'s transaction at `now`; `replaces` is the Tagihan
 * it replaces, whose payment moment (and due-date anchor) it keeps.
 */
async function issueIn(
  tx: Database,
  deps: EffectDeps,
  input: IssueTagihanInput & { anchorAt: Date },
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

/** Tagihan that can still be cancelled and reissued: not paid, not cancelled, not given up. */
const REISSUABLE: readonly TagihanStatus[] = ["belum_dibayar", "lewat_jatuh_tempo"];

/**
 * Cancels an unpaid Tagihan and issues its replacement with these lines and a
 * new Nomor Tagihan, in one transaction. The replacement keeps the payment
 * moment, the addressee and the order, and its due date counts from the
 * original issue, so a reissue never extends the time to pay.
 */
export async function reissueTagihan(
  deps: TagihanDeps,
  tagihanId: string,
  input: { lines: NewTagihanLine[] },
  now: Date,
): Promise<ReissueTagihanResult> {
  const header = await currentHeader(deps.operatorSettings);
  if (!header) return noHeader;
  return refusable<ReissueTagihanResult>(deps.db, async (tx) => {
    if (!z.uuid().safeParse(tagihanId).success) return { ok: false, reason: "tidak_ditemukan" };
    const [old] = await tx.select().from(tagihan).where(eq(tagihan.id, tagihanId)).for("update");
    if (!old) return { ok: false, reason: "tidak_ditemukan" };
    if (!REISSUABLE.includes(old.status)) return { ok: false, reason: "tagihan_tidak_bisa_diganti" };
    const { anchorAt, ...moment } = storedMomentSchema.parse(old.moment) as StoredMoment;
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

export type BatalkanTagihanResult =
  | { ok: true; tagihan: Tagihan }
  | { ok: false; reason: "tidak_ditemukan" }
  /** Lunas, Tidak Tertagih, already cancelled or replaced: money that arrived is a refund, never a cancellation. */
  | { ok: false; reason: "tagihan_tidak_bisa_dibatalkan" };

/**
 * Cancels an unpaid Tagihan that its order withdrew: Dibatalkan, with no replacement
 * and nothing owed (spec, Billing: "never changed once issued, only cancelled and
 * replaced"). The caller is the module that owns the order, inside its own
 * transaction, so a withdrawn order can never keep a payable Tagihan.
 *
 * Refused for a Tagihan that is Lunas, Tidak Tertagih, already cancelled or replaced:
 * money that arrived is a refund (the Refunds module, ticket 31), never a cancellation.
 */
export async function batalkanTagihan(
  deps: TagihanDeps,
  tagihanId: string,
  rawReason: unknown,
  now: Date,
): Promise<BatalkanTagihanResult> {
  const parsed = z.object({ reason: z.literal("dibatalkan_pemesan") }).safeParse({ reason: rawReason });
  if (!parsed.success || !z.uuid().safeParse(tagihanId).success) return { ok: false, reason: "tidak_ditemukan" };
  return refusable<{ ok: true; tagihan: Tagihan } | { ok: false; reason: "tidak_ditemukan" | "tagihan_tidak_bisa_dibatalkan" }>(
    deps.db,
    async (tx) => {
      const [old] = await tx.select().from(tagihan).where(eq(tagihan.id, tagihanId)).for("update");
      if (!old) return { ok: false as const, reason: "tidak_ditemukan" as const };
      if (!REISSUABLE.includes(old.status)) return { ok: false as const, reason: "tagihan_tidak_bisa_dibatalkan" as const };
      await tx
        .update(tagihan)
        .set({ status: "dibatalkan", cancelledAt: now, cancelledReason: parsed.data.reason })
        .where(eq(tagihan.id, old.id));
      const cancelled = await readTagihan(tx, old.id);
      if (!cancelled) throw new Error("cancelled Tagihan not found");
      return { ok: true as const, tagihan: cancelled };
    },
  );
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
    paidAt: row.paidAt,
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
