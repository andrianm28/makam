import { addWibDays, wib, wibDateOf } from "@/lib/time/jakarta";

const HOUR_MS = 3_600_000;
const THREE_DAYS_HOURS = 72;

/** The payment moment a Tagihan is for, with the facts its due date depends on. */
export type PaymentMoment =
  /** A Saat Duka checkout (Lokasi Mitra or DKI TPU): due the Lokasi's payment window after the planned burial. */
  | { kind: "saat_duka"; burialAt: Date; paymentWindowHours: number }
  /** A burial under an existing Hak Pakai: due 3×24 h after the recorded Pemakaman. */
  | { kind: "pemakaman_hak_pakai_ada"; burialAt: Date }
  /** A Pemesanan Terencana: due when its hold expires. */
  | { kind: "terencana"; holdExpiresAt: Date }
  /** A Perpanjangan Makam at a Lokasi Mitra: due 3×24 h after issue. */
  | { kind: "perpanjangan" }
  /** A filing-only Pengurusan (Pengurusan IPTM): due 3×24 h after issue. */
  | { kind: "pengurusan_berkas" }
  /** A standalone Layanan order: due as its Layanan lines are. */
  | { kind: "layanan" }
  /** One cycle of a Paket Layanan, whose Pekerjaan Layanan are on `cycleDate` (WIB, "YYYY-MM-DD"): due at H-1, 23:59 WIB. */
  | { kind: "paket_cycle"; cycleDate: string };

export type TagihanKind = "pay_first" | "pay_after";

export interface TagihanDue {
  kind: TagihanKind;
  dueAt: Date;
}

/**
 * One line as far as the due date is concerned: a Layanan line (its target
 * date, WIB "YYYY-MM-DD", and the Layanan's lead time in days), or any other.
 */
export type DueLine = { kind: "layanan"; targetDate: string; leadTimeDays: number } | { kind: "other" };

/**
 * Payment moments whose Layanan lines take the moment's own due date instead
 * of their own: hari-H Layanan on a Saat Duka (or a later burial's) Tagihan,
 * which so stays pay-after; Layanan added at a Perpanjangan checkout (their
 * target dates are constrained instead); a Paket cycle's Layanan.
 */
const LAYANAN_TAKE_MOMENT_DUE: ReadonlySet<PaymentMoment["kind"]> = new Set([
  "saat_duka",
  "pemakaman_hak_pakai_ada",
  "perpanjangan",
  "paket_cycle",
]);

const hoursAfter = (instant: Date, hours: number) => new Date(instant.getTime() + hours * HOUR_MS);

/** 23:59 WIB on the WIB date `days` days after (or, negative, before) `date`. */
const endOfWibDay = (date: string, days = 0) => wib(`${wibDateOf(addWibDays(wib(date), days))} 23:59`);

/**
 * A pay-first Layanan line's due date: the earlier of 24 h after issue or the
 * last lead-time day (its target date minus the Layanan's lead time) at 23:59 WIB.
 */
function layananDue(line: Extract<DueLine, { kind: "layanan" }>, issuedAt: Date): Date {
  const lastLeadTimeDay = endOfWibDay(line.targetDate, -line.leadTimeDays);
  const dayAfterIssue = hoursAfter(issuedAt, 24);
  return lastLeadTimeDay < dayAfterIssue ? lastLeadTimeDay : dayAfterIssue;
}

/**
 * The kind and due date of a Tagihan for this payment moment and these lines,
 * issued at `issuedAt`: the one pure rule every Tagihan's due date comes from.
 * The kind is the moment's; the due date is the earliest of its lines' due
 * dates (the moment's own, and each Layanan line's that does not take the moment's).
 */
export function tagihanDue(moment: PaymentMoment, lines: readonly DueLine[], issuedAt: Date): TagihanDue {
  const own = momentDue(moment, issuedAt);
  if (LAYANAN_TAKE_MOMENT_DUE.has(moment.kind) && own.dueAt) return { kind: own.kind, dueAt: own.dueAt };
  const dues = lines.flatMap((line) => (line.kind === "layanan" ? [layananDue(line, issuedAt)] : []));
  if (own.dueAt) dues.push(own.dueAt);
  if (dues.length === 0) throw new Error(`A ${moment.kind} Tagihan needs a Layanan line to take its due date from`);
  return { kind: own.kind, dueAt: dues.reduce((earliest, due) => (due < earliest ? due : earliest)) };
}

/**
 * When a pay-after payment moment counted from the burial that was **recorded**
 * is Lewat Jatuh Tempo: the moment's own window — the Lokasi Mitra's Saat Duka
 * payment window, or 3×24 h for a burial under an existing Hak Pakai — moved
 * onto `recordedBurialAt` (spec, Billing: "the clock counted from the recorded
 * burial date"). Null for a pay-first moment, which has no such clock at all.
 *
 * It never re-derives the printed due date: `tagihanDue` counted from the
 * planned burial at confirmation, and that date stays on the document whatever
 * the burial turns out to be.
 */
export function lewatJatuhTempoAt(moment: PaymentMoment, recordedBurialAt: Date): Date | null {
  switch (moment.kind) {
    case "saat_duka":
      return hoursAfter(recordedBurialAt, moment.paymentWindowHours);
    case "pemakaman_hak_pakai_ada":
      return hoursAfter(recordedBurialAt, THREE_DAYS_HOURS);
    default:
      return null;
  }
}

/** The moment's own kind and due date; a standalone Layanan order has none of its own (only its lines'). */
function momentDue(moment: PaymentMoment, issuedAt: Date): { kind: TagihanKind; dueAt: Date | null } {
  switch (moment.kind) {
    case "saat_duka":
      return { kind: "pay_after", dueAt: hoursAfter(moment.burialAt, moment.paymentWindowHours) };
    case "pemakaman_hak_pakai_ada":
      return { kind: "pay_after", dueAt: hoursAfter(moment.burialAt, THREE_DAYS_HOURS) };
    case "terencana":
      return { kind: "pay_first", dueAt: moment.holdExpiresAt };
    case "perpanjangan":
    case "pengurusan_berkas":
      return { kind: "pay_first", dueAt: hoursAfter(issuedAt, THREE_DAYS_HOURS) };
    case "layanan":
      return { kind: "pay_first", dueAt: null };
    case "paket_cycle":
      return { kind: "pay_first", dueAt: endOfWibDay(moment.cycleDate, -1) };
  }
}
