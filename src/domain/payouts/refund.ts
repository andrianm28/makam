/**
 * Refunds and Bukti Pengembalian Dana (spec, Billing > Refunds; ticket 31).
 *
 * One refund flow for the whole platform, in three steps that cannot be skipped:
 *
 * 1. **something asks** — a cancellation, a Keluhan, a Pembatalan, a PTSP
 *    refusal, a Berhenti leftover or a goodwill decision calls
 *    `catatPermintaanPengembalian` inside its own transaction, naming the Tagihan,
 *    the lines and whose fault it is;
 * 2. **Admin Platform approves** — `setujuiPengembalian`, which is the only gate:
 *    no money can leave without it, and the approval is audited (AC 2). This is
 *    also the moment the Tier 3 Antrean row opens, due in 2 Hari Kerja (AC 3);
 * 3. **Admin Platform transfers by hand** — `terbitkanBuktiPengembalian` takes
 *    the uploaded proof and the transfer date and issues `RFD/YYYY/NNNNNN`, moves
 *    the Tagihan to Dikembalikan Sebagian or Penuh, tells the Pemesan, and settles
 *    the partner's side (AC 4, AC 7).
 *
 * **Where it lives, and why not in Billing.** The spec's section 10 lists refunds
 * under Billing, and Billing does own the part of a refund that is about a bill:
 * the Tagihan's status (`billing.terimaPengembalian`) and the `RFD` document
 * series. But the rest of the flow is a *decision about the Operator's money* that
 * ends in a Potongan or a cancelled Pencairan item — Payouts' own tables — and
 * `src/composition/billing.ts` composes Billing **before** Payouts, deliberately
 * (`src/domain/payouts/efek.ts` says why). A Billing function that reached into
 * Payouts would be a cycle, so the flow is here, next to the other money-out flow
 * it mirrors (`./transfer.ts`), and calls Billing for everything Billing owns. The
 * two seams Payouts left for this ticket — `kurangiPencairanPesanan` and
 * `batalkanPencairanTagihan`, both documented as "the Refunds module (ticket 31)
 * calls this" — are called from inside the transfer's own transaction.
 *
 * **The Biaya Layanan Platform rule, in one place.** `biayaLayananPlatformDikembalikan`
 * is the whole of the spec's table: the fee is kept when the fault is the
 * Pemesan's, and refunded when the fault is the Lokasi's, the Mitra Jasa's or the
 * Operator's. It is stored on the row rather than recomputed, because the Bukti
 * Pengembalian Dana has to *say* which it was (spec, Documents) and a document
 * that re-derived a rule at reading time could say something different from what
 * was paid.
 *
 * **The one rule this ticket could not be told, and did not decide.** Ticket 24
 * records its refund request as `total − Σ Biaya Layanan Platform` — the fee is
 * never refunded, always. That is right for the case 24 has (a Pemesan cancelling
 * their own Saat Duka order), and wrong for every case in the second row of the
 * spec's table, where the fee comes back too. So the two numbers disagree for any
 * non-Pemesan-fault refund, by exactly the fee, and `catatPermintaanPengembalian`
 * writes **ticket 31's** fault rule rather than ticket 24's arithmetic. Which of
 * the two is right for a non-Pemesan-fault refund is the owner's decision, not a
 * builder's, and it is recorded in the ticket's `## Comments`; `./refund.test.ts`
 * asserts both halves of it — that the two agree for a Pemesan's cancellation and
 * differ by exactly the fee for every other fault — so the disagreement is visible
 * in the tree rather than only in prose.
 */
import { and, asc, eq, inArray, sum } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Database } from "@/db/client";
import { refusable } from "@/db/unit-of-work";
import type { AuditLog, RecordEntry } from "@/domain/audit";
import {
  currentHeader,
  documentLinkSchema,
  newDocumentLink,
  noHeader,
  type Billing,
  type DocumentHeader,
  type TagihanLine,
} from "@/domain/billing";
import { pengembalianResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { addWorkingDays, type Lokasi } from "@/domain/lokasi";
import type { OperatorSettings } from "@/domain/operator-settings";
import { documentExtension } from "@/lib/files/document-type";
import type { ReportError } from "@/lib/observability/report-error";
import { rupiahSchema, sumRupiah, type Rupiah } from "@/lib/rupiah";
import { wibDateOf } from "@/lib/time/jakarta";
import type { Clock } from "@/ports/clock";
import type { FileStore } from "@/ports/file-store";
import { batalkanPencairanTagihan, kurangiPencairanPesanan } from "./item";
import { sisipPotongan } from "./potongan";
import {
  buktiPengembalianDana,
  pencairanItem,
  pengembalian,
  pengembalianBaris,
  type PengembalianFault,
  type PengembalianPenanggung,
  type PengembalianSebab,
} from "./schema";

/**
 * How long Admin Platform has to transfer an approved refund (AC 3: "a 2-working-day
 * deadline (Admin Platform calendar, ticket 11)"). Stamped on the refund at
 * approval and read by the Tier 3 row, never recalculated — exactly as a Pencairan
 * item's own deadline is stamped by the trigger that made it due.
 */
export const TENGGAT_PENGEMBALIAN_HARI_KERJA = 2;

/** The largest transfer proof accepted, 10 MB (the Server Action body limit is 11 MB), as a Bukti Pencairan's. */
export const BUKTI_PENGEMBALIAN_MAX_BYTES = 10 * 1024 * 1024;

/**
 * **The fault rule (spec, Billing > Refunds).** The Biaya Layanan Platform is the
 * Operator's fee for the convenience it provided: it is kept when the Pemesan
 * cancels, and refunded when the fault is the Lokasi's, the Mitra Jasa's or the
 * Operator's own. Four values, one answer, and the one place the answer lives.
 */
export function biayaLayananPlatformDikembalikan(fault: PengembalianFault): boolean {
  return fault !== "pemesan";
}

/** Where a refund's money goes, as a person states it. Never derived by this module. */
export interface RekeningTujuan {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

const rekeningSchema = z.object({
  bankName: z.string().trim().min(1).max(120),
  accountNumber: z.string().trim().min(1).max(64),
  accountHolder: z.string().trim().min(1).max(200),
});

/** One line of a refund, as the request and the Bukti state it. */
export interface BarisPengembalian {
  /** The issued Tagihan line's own position, so the Bukti repeats the bill's order. */
  posisi: number;
  label: string;
  jumlah: Rupiah;
  /** The issued line's provider, copied: who provided what is being given back. */
  provider: TagihanLine["provider"];
}

export interface PengembalianRow {
  id: string;
  tagihanId: string;
  nomorTagihan: string;
  nomorPemesanan: string | null;
  pemesan: { nama: string; telepon: string; akunId: string | null };
  fault: PengembalianFault;
  sebab: PengembalianSebab;
  jumlah: Rupiah;
  biayaLayananPlatform: Rupiah;
  biayaLayananPlatformDikembalikan: boolean;
  penanggung: PengembalianPenanggung;
  catatan: string | null;
  rekening: RekeningTujuan | null;
  status: "diminta" | "disetujui" | "ditransfer";
  dimintaPada: Date;
  disetujuiPada: Date | null;
  /** The Admin Platform that approved it, or null while it is not approved. */
  disetujuiOleh: string | null;
  /** The 2 Hari Kerja deadline stamped at approval, or null while it is not approved. */
  jatuhTempoAt: Date | null;
  ditransferPada: string | null;
  baris: BarisPengembalian[];
}

export interface RefundDeps {
  db: Database;
  clock: Clock;
  audit: AuditLog;
  files: FileStore;
  /** The issued Tagihan, ticket 24's recorded requests, the `RFD` series, and the Tagihan's own status. */
  billing: Pick<Billing, "tagihan" | "tagihanDenganPermintaanPengembalian" | "within" | "terimaPengembalian">;
  /** The Admin Platform Hari Kerja calendar, which the 2 Hari Kerja deadline is counted on. */
  lokasi: Pick<Lokasi, "adminPlatformCalendar">;
  operatorSettings: Pick<OperatorSettings, "current">;
  /** The Bukti Pengembalian Dana page's absolute URL, which the Pemesan is sent and the PDF rendered from. */
  buktiUrl: (link: string) => string;
  /** Sends the Pemesan its Bukti Pengembalian Dana link; this module owns the decision, the caller the channel. */
  kirimBukti: KirimBuktiPengembalian;
  reportError?: ReportError;
}

/** What the Pemesan is told about its refund, sent after the Bukti exists. */
export interface BuktiPengembalianTerbit {
  /** The Tagihan the refund reverses: the caller needs it to find where the family reads. */
  tagihanId: string;
  pemesan: { nama: string; telepon: string; akunId: string | null };
  nomorTagihan: string;
  nomorPemesanan: string | null;
  nomorBukti: string;
  /** The Bukti Pengembalian Dana page's absolute URL. */
  url: string;
  /** The date entered for the transfer (WIB "YYYY-MM-DD"). */
  ditransferPada: string;
  /** Whole rupiah transferred. */
  jumlah: Rupiah;
  /** Whether the Biaya Layanan Platform came back too, which the message states (AC 4). */
  biayaLayananPlatformDikembalikan: boolean;
}
export type KirimBuktiPengembalian = (bukti: BuktiPengembalianTerbit) => Promise<void>;

// ---------------------------------------------------------------------------
// 1. Something asks
// ---------------------------------------------------------------------------

export interface CatatPermintaanPengembalianInput {
  /** The Tagihan whose money is coming back. Read through Billing, never from its table. */
  tagihanId: string;
  /** Which of the six things that ask for a refund this is. */
  sebab: PengembalianSebab;
  /** Whose fault it is, which is the only thing that decides the Biaya Layanan Platform. */
  fault: PengembalianFault;
  /**
   * Which lines come back. **Omit it and the fault rule picks them**: every line
   * but the Biaya Layanan Platform for a Pemesan's own cancellation (which is
   * exactly what ticket 24 recorded as `pengembalian_jumlah`), and every line
   * when the fault is not the Pemesan's. Naming them is for a case the rule does
   * not cover — a Keluhan that returns one Layanan and nothing else.
   */
  baris?: { posisi: number; jumlah: number }[];
  /** Whether the money comes out of the partner's share or the Operator's own funds. */
  penanggung: PengembalianPenanggung;
  /** Why, in words. Required for a goodwill decision, which is the Operator's own money. */
  catatan?: string | null;
  /** Who asked: an Admin Platform's account, or null when another module asks in its own write. */
  dimintaOleh?: string | null;
}

export type CatatPermintaanPengembalianResult =
  | { ok: true; pengembalian: PengembalianRow }
  | { ok: false; reason: "tidak_ditemukan" }
  /** The Tagihan never took money, so there is nothing to give back. */
  | { ok: false; reason: "belum_dibayar" }
  /** The named lines do not belong to the Tagihan, or name the fee the fault rule keeps. */
  | { ok: false; reason: "baris_tidak_valid" }
  /** The lines come to Rp 0, above the largest amount anywhere, or more than the bill charged. */
  | { ok: false; reason: "jumlah_tidak_valid" }
  /** The lines would give back more than an earlier refund already returned. */
  | { ok: false; reason: "melebihi_yang_sudah_dikembalikan" }
  /** A goodwill decision with no reason, which is a decision nobody could account for. */
  | { ok: false; reason: "catatan_wajib" }
  /** A request for this Tagihan and this cause is already open. */
  | { ok: false; reason: "sudah_diminta" };

/**
 * Records a refund request, inside the caller's own transaction. Nothing leaves
 * here: this is an ask, and the money cannot move until an Admin Platform approves
 * it (AC 2).
 *
 * **The caller is the module whose business caused it** — Pemesanan for a Saat Duka
 * cancellation, a Keluhan's own decision, the Pembatalan module (ticket 38), the
 * TPU Pengurusan module (ticket 47), the Lokasi module for a Berhenti leftover, and
 * Admin Platform itself for goodwill. It runs this inside that module's staff
 * write, so the Entri Audit has one entry for the cause and this row is part of it
 * rather than a second decision.
 *
 * Ticket 24's Saat Duka cancellation is the case that needs no new caller: it
 * already recorded the request on the Tagihan itself, so its Admin Platform picks
 * the refund up through `permintaanTagihan` below, which reads the same two
 * columns and applies the same fault rule.
 */
export async function catatPermintaanPengembalian(
  deps: RefundDeps,
  tx: Database,
  input: CatatPermintaanPengembalianInput,
  now: Date,
): Promise<CatatPermintaanPengembalianResult> {
  const parsed = z
    .object({
      tagihanId: z.uuid(),
      sebab: z.enum(["pemesanan_dibatalkan", "keluhan", "pembatalan", "ptsp_ditolak", "sisa_berhenti", "goodwill"]),
      fault: z.enum(["pemesan", "lokasi", "mitra_jasa", "operator"]),
      penanggung: z.enum(["mitra", "operator"]),
      catatan: z.string().trim().max(500).nullish(),
      dimintaOleh: z.string().trim().min(1).max(64).nullish(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, reason: "tidak_ditemukan" };
  const data = parsed.data;
  // Goodwill is the Operator's own money given away, so it always says why, and it
  // is never netted from a partner — the two are the same fact (spec, Refunds), so
  // the module writes the one that is true rather than trusting a caller to
  // remember: there is no shape of a goodwill refund that reaches a partner.
  if (data.sebab === "goodwill" && !data.catatan) return { ok: false, reason: "catatan_wajib" };
  const penanggung: PengembalianPenanggung = data.sebab === "goodwill" ? "operator" : data.penanggung;

  const tagihan = await deps.billing.tagihan(input.tagihanId);
  if (!tagihan) return { ok: false, reason: "tidak_ditemukan" };
  // Nothing to give back: the bill never took money. Ticket 24's own rule is that
  // a cancellation with no payment records no request at all, and this is where
  // that shows up for the other five causes.
  if (tagihan.paidAt === null) return { ok: false, reason: "belum_dibayar" };

  const baris = barisRefund(tagihan.lines, data.fault, input.baris);
  if (!baris.ok) return baris;
  const total = sumRupiah(baris.value.map((line) => line.jumlah));
  if (!total.ok || total.amount <= 0 || total.amount > tagihan.total) {
    return { ok: false, reason: "jumlah_tidak_valid" };
  }

  const fee = feeOf(tagihan.lines);
  const dikembalikan = biayaLayananPlatformDikembalikan(data.fault);
  // A second refund of the same line cannot give back more than the line is worth
  // between them. This is a refusal and not a clamp: a clamp would quietly hand a
  // family back a different amount from the one anybody approved.
  const sudah = await sudahDikembalikan(tx, tagihan.id);
  if (baris.value.some((line) => line.jumlah + (sudah.get(line.posisi) ?? 0) > tagihan.lines[line.posisi]!.amount)) {
    return { ok: false, reason: "melebihi_yang_sudah_dikembalikan" };
  }

  return refusable<CatatPermintaanPengembalianResult>(tx, async (inner) => {
    const [row] = await inner
      .insert(pengembalian)
      .values({
        tagihanId: tagihan.id,
        nomorTagihan: tagihan.nomorTagihan,
        nomorPemesanan: tagihan.nomorPemesanan,
        pemesanNama: tagihan.addressee.name,
        pemesanTelepon: tagihan.addressee.phoneNumber,
        pemesanAkunId: tagihan.addressee.accountId,
        fault: data.fault,
        sebab: data.sebab,
        jumlah: total.amount,
        // The fee the Operator kept, and nothing at all when it came back: the two
        // columns together are what the Bukti has to say about it (AC 4).
        biayaLayananPlatform: dikembalikan ? (0 as Rupiah) : fee,
        biayaLayananPlatformDikembalikan: dikembalikan,
        penanggung,
        catatan: data.catatan ?? null,
        status: "diminta",
        dimintaPada: now,
        dimintaOleh: data.dimintaOleh ?? null,
        dibuatPada: now,
      })
      .onConflictDoNothing()
      .returning({ id: pengembalian.id });
    if (!row) return { ok: false as const, reason: "sudah_diminta" as const };
    await inner.insert(pengembalianBaris).values(
      baris.value.map((line) => ({
        pengembalianId: row.id,
        posisi: line.posisi,
        label: line.label,
        jumlah: line.jumlah,
        provider: line.provider,
      })),
    );
    const dibaca = await pengembalianById(inner, row.id);
    if (!dibaca) throw new Error("the refund just requested was not found");
    return { ok: true as const, pengembalian: dibaca };
  });
}

/** What a Saat Duka cancellation left behind: a Tagihan carrying its own request (ticket 24). */
export interface PermintaanTagihan {
  tagihanId: string;
  nomorTagihan: string;
  /** What the cancellation recorded: the paid total less the Biaya Layanan Platform. */
  jumlahDiminta: Rupiah;
  dimintaPada: Date;
}

/**
 * Every Tagihan whose cancellation asked for money back — ticket 24's requests,
 * waiting for an Admin Platform. Reads the two columns ticket 24 wrote through
 * Billing's own public read, never its table.
 */
export async function permintaanTagihan(deps: Pick<RefundDeps, "billing">): Promise<PermintaanTagihan[]> {
  const semua = await deps.billing.tagihanDenganPermintaanPengembalian();
  return semua.flatMap((tagihan) =>
    tagihan.pengembalianDiminta === null
      ? []
      : [
          {
            tagihanId: tagihan.id,
            nomorTagihan: tagihan.nomorTagihan,
            jumlahDiminta: tagihan.pengembalianDiminta.jumlah,
            dimintaPada: tagihan.pengembalianDiminta.dimintaPada,
          },
        ],
  );
}

/**
 * The lines a request refunds, named or by the fault rule. Refused for a position
 * that is not one of the Tagihan's own lines, which is what makes a refund of
 * money this bill never charged impossible, and for an amount above the line's own
 * amount, which is what makes a refund bigger than the bill impossible.
 */
function barisRefund(
  lines: readonly TagihanLine[],
  fault: PengembalianFault,
  named?: readonly { posisi: number; jumlah: number }[],
): { ok: true; value: BarisPengembalian[] } | { ok: false; reason: "baris_tidak_valid" | "jumlah_tidak_valid" } {
  const dikembalikan = biayaLayananPlatformDikembalikan(fault);
  const wanted =
    named ??
    lines
      .map((line, posisi) => ({ posisi, jumlah: line.amount }))
      // A negative line (a Penyesuaian Harga Khusus) reduced a bill; it is never
      // money to hand back, and the fee is skipped only while the Pemesan caused it.
      .filter((entry) => lines[entry.posisi]!.amount > 0)
      .filter((entry) => dikembalikan || lines[entry.posisi]!.kind !== "biaya_layanan_platform");
  if (wanted.length === 0) return { ok: false, reason: "jumlah_tidak_valid" };
  const value: BarisPengembalian[] = [];
  for (const { posisi, jumlah } of wanted) {
    if (!Number.isInteger(posisi) || posisi < 0) return { ok: false, reason: "baris_tidak_valid" };
    const line = lines[posisi];
    if (!line) return { ok: false, reason: "baris_tidak_valid" };
    // A refund never returns the fee when the Pemesan's own cancellation caused
    // it, whether the caller names the line or leaves the rule to pick: the rule
    // is the spec's, not the caller's to widen.
    if (line.kind === "biaya_layanan_platform" && !dikembalikan) return { ok: false, reason: "baris_tidak_valid" };
    const parsed = rupiahSchema.safeParse(jumlah);
    if (!parsed.success || parsed.data <= 0 || parsed.data > line.amount) {
      return { ok: false, reason: "jumlah_tidak_valid" };
    }
    value.push({ posisi, label: line.label, jumlah: parsed.data, provider: line.provider });
  }
  return { ok: true, value };
}

/** The Biaya Layanan Platform on a bill: never negative, and 0 when it has none. */
function feeOf(lines: readonly TagihanLine[]): Rupiah {
  let fee = 0;
  for (const line of lines) {
    if (line.kind === "biaya_layanan_platform" && line.amount > 0) fee += line.amount;
  }
  return fee as Rupiah;
}

/** What earlier transferred refunds already returned of each line, by position. */
async function sudahDikembalikan(tx: Database, tagihanId: string): Promise<Map<number, number>> {
  const rows = await tx
    .select({ posisi: pengembalianBaris.posisi, jumlah: sum(pengembalianBaris.jumlah) })
    .from(pengembalianBaris)
    .innerJoin(pengembalian, eq(pengembalian.id, pengembalianBaris.pengembalianId))
    .where(and(eq(pengembalian.tagihanId, tagihanId), eq(pengembalian.status, "ditransfer")))
    .groupBy(pengembalianBaris.posisi);
  return new Map(rows.map((row) => [row.posisi, Number(row.jumlah ?? 0)]));
}

// ---------------------------------------------------------------------------
// 2. Admin Platform approves
// ---------------------------------------------------------------------------

export type SetujuiPengembalianResult =
  | { ok: true; pengembalian: PengembalianRow }
  | WriteRefusal
  | { ok: false; reason: "tidak_ditemukan" }
  /** It is already approved, or already paid out. */
  | { ok: false; reason: "sudah_disetujui" };

/**
 * Admin Platform approves a refund, and the money may now leave. This is the only
 * gate in the flow (AC 2): nothing in `terbitkanBuktiPengembalian` can be reached
 * without it, and it is the moment the Tier 3 Antrean row opens with its 2 Hari
 * Kerja deadline (AC 3), which the row reads and never recalculates.
 *
 * Audited, and one-way: an approved refund cannot be un-approved, because a second
 * approval is a second decision about money that is already on its way.
 */
export async function setujuiPengembalian(
  deps: RefundDeps,
  by: Actor,
  input: { pengembalianId: string },
): Promise<SetujuiPengembalianResult> {
  const refusal = writeRefusal(by, "pengembalian.kelola", pengembalianResource());
  if (refusal) return refusal;
  if (!z.uuid().safeParse(input.pengembalianId).success) return { ok: false, reason: "tidak_ditemukan" };
  const now = deps.clock.now();
  const calendar = await deps.lokasi.adminPlatformCalendar();
  const tenggat = addWorkingDays(calendar, now, TENGGAT_PENGEMBALIAN_HARI_KERJA);
  // An Admin Platform calendar with no Hari Kerja in it is an operator
  // configuration that has not been entered yet, not a refusal of this refund, so
  // it throws the way a Pencairan item's own deadline does (./index.ts) rather than
  // reporting "not found" for a refund that plainly exists.
  if (!tenggat.ok) {
    throw new Error(`the Admin Platform calendar has no Hari Kerja ahead of ${now.toISOString()}`);
  }

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [row] = await tx
      .select()
      .from(pengembalian)
      .where(eq(pengembalian.id, input.pengembalianId))
      .for("update");
    if (!row) return { ok: false as const, reason: "tidak_ditemukan" as const };
    if (row.status !== "diminta") return { ok: false as const, reason: "sudah_disetujui" as const };
    await tx
      .update(pengembalian)
      .set({ status: "disetujui", disetujuiPada: now, disetujuiOleh: by.accountId, jatuhTempoAt: tenggat.at })
      .where(and(eq(pengembalian.id, row.id), eq(pengembalian.status, "diminta")));
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "pengembalian.setujui",
      entity: { kind: "pengembalian", id: row.id },
      lokasiId: null,
      before: { status: row.status },
      after: {
        status: "disetujui",
        jumlah: row.jumlah,
        fault: row.fault,
        penanggung: row.penanggung,
        jatuhTempoAt: tenggat.at.toISOString(),
      },
      reason: row.catatan,
    });
    const dibaca = await pengembalianById(tx, row.id);
    if (!dibaca) throw new Error("the refund just approved was not found");
    return { ok: true as const, pengembalian: dibaca };
  });
}

// ---------------------------------------------------------------------------
// 2b. Where the money goes
// ---------------------------------------------------------------------------

export type CatatRekeningPengembalianResult =
  | { ok: true; pengembalian: PengembalianRow }
  | { ok: false; reason: "tidak_ditemukan" }
  /** The refund is already paid out, so where it went can no longer be changed. */
  | { ok: false; reason: "sudah_ditransfer" }
  | { ok: false; reason: "rekening_tidak_valid" };

/**
 * Records the bank account a refund is paid to (AC 5) — entered by the Pemesan, or
 * recorded by Admin Platform for a family that cannot. It is a person's statement
 * about where to pay, so this module never derives it, and a transfer without one
 * is refused: paying money to an account nobody gave would be the one mistake this
 * flow cannot make.
 *
 * The **Pemesan's** own screen and email that ask for it are ticket 38's (the
 * Terencana Pembatalan) and this ticket's callers'; what is here is the recording
 * and the rule, so no caller can be the only thing that remembers it.
 */
export async function catatRekeningPengembalian(
  deps: RefundDeps,
  tx: Database,
  input: { pengembalianId: string; rekening: unknown },
): Promise<CatatRekeningPengembalianResult> {
  const parsed = z.object({ pengembalianId: z.uuid(), rekening: rekeningSchema }).safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues.some((issue) => issue.path[0] === "pengembalianId")
      ? { ok: false, reason: "tidak_ditemukan" }
      : { ok: false, reason: "rekening_tidak_valid" };
  }
  return refusable<CatatRekeningPengembalianResult>(tx, async (inner) => {
    const [row] = await inner
      .select()
      .from(pengembalian)
      .where(eq(pengembalian.id, parsed.data.pengembalianId))
      .for("update");
    if (!row) return { ok: false as const, reason: "tidak_ditemukan" as const };
    if (row.status === "ditransfer") return { ok: false as const, reason: "sudah_ditransfer" as const };
    await inner.update(pengembalian).set({ rekening: parsed.data.rekening }).where(eq(pengembalian.id, row.id));
    const dibaca = await pengembalianById(inner, row.id);
    if (!dibaca) throw new Error("the refund whose account was recorded was not found");
    return { ok: true as const, pengembalian: dibaca };
  });
}

// ---------------------------------------------------------------------------
// 3. Admin Platform transfers by hand
// ---------------------------------------------------------------------------

export interface TerbitkanBuktiPengembalianInput {
  pengembalianId: string;
  /** The transfer's date as Admin Platform entered it (WIB "YYYY-MM-DD"), never in the future. */
  ditransferPada: string;
  /** The uploaded proof of the transfer (a bank screenshot or slip). */
  bukti: { body: Uint8Array; contentType: string };
}

export type TerbitkanBuktiPengembalianResult =
  | { ok: true; bukti: BuktiPengembalian; /** The Tagihan as the transfer left it. */ tagihan: TagihanRingkasan }
  | WriteRefusal
  | typeof noHeader
  | { ok: false; reason: "tidak_ditemukan" }
  /** It was never approved, or was already paid out: no money leaves without an approval, and never twice. */
  | { ok: false; reason: "belum_disetujui" }
  /**
   * The bill will not take the status: it never took money, or a refund of it
   * already came back. The transfer is refused rather than issuing a Bukti for
   * money the Tagihan cannot account for.
   */
  | { ok: false; reason: "tagihan_tidak_bisa_dikembalikan" }
  /** Nobody has said where the money goes (AC 5). */
  | { ok: false; reason: "rekening_belum_ada" }
  | { ok: false; reason: "tanggal_tidak_valid" }
  | { ok: false; reason: "berkas_tidak_didukung" };

/** The Tagihan as the transfer left it, in the words the Bukti uses. */
export interface TagihanRingkasan {
  nomorTagihan: string;
  status: "dikembalikan_sebagian" | "dikembalikan_penuh";
}

/** A Bukti Pengembalian Dana as the issue itself and the Pemesan's page read it. */
export interface BuktiPengembalian {
  id: string;
  /** `RFD/2026/000001`, from Billing's one document series. */
  nomorBukti: string;
  link: string;
  pengembalianId: string;
  /** The Tagihan the refund reverses, so the caller can find where the family reads. */
  pengembalianTagihanId: string;
  nomorTagihan: string;
  nomorPemesanan: string | null;
  pemesan: { nama: string; telepon: string; akunId: string | null };
  /** Whole rupiah: what left the bank. */
  jumlah: Rupiah;
  /** The lines given back, in the order the bill issued them. */
  baris: BarisPengembalian[];
  /** Whether the Operator's fee was given back, and the amount that was kept when it was not. */
  biayaLayananPlatform: { dikembalikan: boolean; jumlah: Rupiah };
  penanggung: PengembalianPenanggung;
  rekening: RekeningTujuan;
  ditransferPada: string;
  dibuatPada: Date;
  header: DocumentHeader;
}

/**
 * Issues the one Bukti Pengembalian Dana of a refund transfer: the number from
 * Billing's `RFD` series, the lines, whether the fee was kept, the destination
 * account, the date and the proof.
 *
 * The same three guards as `terbitkanBuktiPencairan` make paying twice impossible:
 * a row lock on the refund, the one-way `ditransfer` status, and a unique index
 * on `bukti_pengembalian_dana.pengembalian_id`. All of it is one transaction, so a
 * Bukti with half its work done, or a Tagihan marked refunded with no Bukti, does
 * not exist — the number is taken inside it, the Tagihan's status is moved through
 * Billing, the partner's side is settled, and the Entri Audit is recorded.
 */
export async function terbitkanBuktiPengembalian(
  deps: RefundDeps,
  by: Actor,
  input: TerbitkanBuktiPengembalianInput,
): Promise<TerbitkanBuktiPengembalianResult> {
  const refusal = writeRefusal(by, "pengembalian.kelola", pengembalianResource());
  if (refusal) return refusal;
  const header = await currentHeader(deps.operatorSettings);
  if (!header) return noHeader;
  const now = deps.clock.now();
  const tanggal = tanggalTransfer(input.ditransferPada, now);
  if (!tanggal) return { ok: false, reason: "tanggal_tidak_valid" };
  if (!z.uuid().safeParse(input.pengembalianId).success) return { ok: false, reason: "tidak_ditemukan" };
  const extension = documentExtension(input.bukti, ["application/pdf", "image/jpeg", "image/png"]);
  if (!extension || input.bukti.body.byteLength === 0 || input.bukti.body.byteLength > BUKTI_PENGEMBALIAN_MAX_BYTES) {
    return { ok: false, reason: "berkas_tidak_didukung" };
  }

  // The file goes to the private FileStore first, exactly as an agreement scan
  // does: a Bukti without its proof is not a Bukti, and a refused transfer leaves
  // no file behind.
  const key = `pengembalian/${randomUUID()}.${extension}`;
  try {
    await deps.files.put({ key, body: input.bukti.body, contentType: input.bukti.contentType });
  } catch {
    return { ok: false, reason: "berkas_tidak_didukung" };
  }

  const hasil = await deps.audit.staffWrite(deps.db, async (tx, record) =>
    issueIn(deps, tx, by, { pengembalianId: input.pengembalianId, tanggal, key, header }, now, record),
  );
  if (!hasil.ok) {
    await deps.files.delete(key).catch(() => undefined);
    return hasil;
  }

  // The Pemesan hears about its money after the Bukti exists, never inside the
  // transaction: a failed message must not undo a transfer that really happened.
  const terima: BuktiPengembalianTerbit = {
    tagihanId: hasil.bukti.pengembalianTagihanId,
    pemesan: hasil.bukti.pemesan,
    nomorTagihan: hasil.bukti.nomorTagihan,
    nomorPemesanan: hasil.bukti.nomorPemesanan,
    nomorBukti: hasil.bukti.nomorBukti,
    url: deps.buktiUrl(hasil.bukti.link),
    ditransferPada: tanggal,
    jumlah: hasil.bukti.jumlah,
    biayaLayananPlatformDikembalikan: hasil.bukti.biayaLayananPlatform.dikembalikan,
  };
  try {
    await deps.kirimBukti(terima);
  } catch (error) {
    deps.reportError?.(error instanceof Error ? error : new Error(String(error)), {
      tags: { module: "payouts", event: "bukti_pengembalian_gagal_dikirim", nomorBukti: hasil.bukti.nomorBukti },
    });
  }
  return hasil;
}

interface IssueIn {
  pengembalianId: string;
  tanggal: string;
  key: string;
  header: DocumentHeader;
}

async function issueIn(
  deps: RefundDeps,
  tx: Database,
  by: Actor,
  input: IssueIn,
  now: Date,
  record: RecordEntry,
): Promise<TerbitkanBuktiPengembalianResult> {
  // 1. Lock the refund, so two concurrent transfers of the same one queue instead
  //    of colliding, and the second wakes up to find it paid.
  const row = await tx.select().from(pengembalian).where(eq(pengembalian.id, input.pengembalianId)).for("update");
  const refund = row[0];
  if (!refund) return { ok: false, reason: "tidak_ditemukan" };
  // One-way, and the gate: only an approved refund can be paid, and a paid one
  // never is again.
  if (refund.status !== "disetujui") return { ok: false, reason: "belum_disetujui" };
  const rekening = rekeningSchema.safeParse(refund.rekening);
  if (!rekening.success) return { ok: false, reason: "rekening_belum_ada" };
  const baris = await tx
    .select()
    .from(pengembalianBaris)
    .where(eq(pengembalianBaris.pengembalianId, refund.id))
    .orderBy(asc(pengembalianBaris.posisi));
  if (baris.length === 0) return { ok: false, reason: "tidak_ditemukan" };

  // 2. The Bukti, in this transaction, numbered from Billing's own RFD series.
  const nomor = await deps.billing.within(tx).nextDocumentNumber("RFD");
  const link = newDocumentLink();
  const [bukti] = await tx
    .insert(buktiPengembalianDana)
    .values({
      nomor,
      link,
      pengembalianId: refund.id,
      jumlah: refund.jumlah,
      ditransferPada: input.tanggal,
      buktiTransferKey: input.key,
      header: input.header,
      dibuatPada: now,
    })
    .returning({ id: buktiPengembalianDana.id });

  // 3. The bill says so, through Billing — the same commit, so a Bukti with no
  //    Tagihan behind it cannot exist and neither can a Tagihan with no Bukti.
  const diterima = await deps.billing.terimaPengembalian(tx, { tagihanId: refund.tagihanId, jumlah: refund.jumlah });
  if (!diterima.ok) return { ok: false, reason: "tagihan_tidak_bisa_dikembalikan" };

  // 4. The partner's side, in this same commit: money already paid out to a Lokasi
  //    Mitra becomes a Potongan, money not yet paid comes off that order's items,
  //    and a goodwill refund touches neither (AC 6).
  await settlePartner(tx, refund, baris, link, now, by.accountId);

  await tx
    .update(pengembalian)
    .set({ status: "ditransfer", ditransferPada: input.tanggal })
    .where(and(eq(pengembalian.id, refund.id), eq(pengembalian.status, "disetujui")));

  await record({
    actor: { accountId: by.accountId, role: "admin_platform" },
    action: "pengembalian.terbitkan_bukti",
    entity: { kind: "bukti_pengembalian_dana", id: bukti.id },
    lokasiId: null,
    before: { status: refund.status },
    after: {
      nomor,
      jumlah: refund.jumlah,
      baris: baris.length,
      biayaLayananPlatformDikembalikan: refund.biayaLayananPlatformDikembalikan,
      penanggung: refund.penanggung,
      ditransferPada: input.tanggal,
      tagihanStatus: diterima.tagihan.status,
    },
    reason: refund.catatan,
  });

  const dibaca = await buktiById(tx, bukti.id);
  if (!dibaca) throw new Error("the Bukti Pengembalian Dana just issued was not found");
  return {
    ok: true,
    bukti: dibaca,
    tagihan: { nomorTagihan: refund.nomorTagihan, status: diterima.tagihan.status as TagihanRingkasan["status"] },
  };
}

/**
 * What the partner owes because of a refund, settled in the transfer's own
 * transaction (AC 6).
 *
 * Only a refund **netted from the partner** (`penanggung: "mitra"`) does anything
 * here, and only for the Lokasi Mitra's own share of the refunded lines: a goodwill
 * refund is the Operator's own money given away and must never become a debt a
 * partner is charged. A Mitra Jasa is never clawed back (spec, Payouts), so its
 * lines are skipped, and so is the Biaya Layanan Platform, which was never the
 * partner's to begin with.
 *
 * Which of the two it is depends on the state of the order's items at the moment
 * of the transfer: money **not yet paid out** comes straight off those items (and
 * a full return cancels them, since the work is not paid for); money **already
 * paid out** is gone, so it becomes a Potongan the next Pencairan nets.
 */
async function settlePartner(
  tx: Database,
  refund: typeof pengembalian.$inferSelect,
  baris: readonly { posisi: number; jumlah: number; provider: unknown }[],
  link: string,
  now: Date,
  oleh: string,
): Promise<void> {
  if (refund.penanggung !== "mitra") return;
  const partnerLines = baris.filter((line) => providerLokasiId(line.provider) !== null);
  if (partnerLines.length === 0) return;
  const lokasiId = providerLokasiId(partnerLines[0]!.provider);
  if (!lokasiId) return;
  // Only one Lokasi Mitra can provide the lines of one bill, and a refund cannot
  // name another's: anything else is refused earlier, so this is the Lokasi whose
  // share is being returned.
  const partnerTotal = partnerLines.reduce((total, line) => total + Number(line.jumlah), 0);

  const items = await tx
    .select()
    .from(pencairanItem)
    .where(
      and(
        eq(pencairanItem.tagihanId, refund.tagihanId),
        eq(pencairanItem.lokasiId, lokasiId),
        inArray(pencairanItem.status, ["belum_jatuh_tempo", "jatuh_tempo"]),
      ),
    )
    .for("update");

  if (items.length > 0 && refund.nomorPemesanan) {
    // Not paid out yet: take the returned share off the order's own items, oldest
    // line first, which is what `kurangiPencairanPesanan` does. A refund that
    // empties them cancels them instead of leaving an Rp 0 line behind.
    if (partnerTotal >= jumlahItems(items)) {
      await batalkanPencairanTagihan(tx, { tagihanId: refund.tagihanId, alasan: "dikembalikan_penuh" }, now);
    } else {
      await kurangiPencairanPesanan(
        tx,
        {
          nomorPemesanan: refund.nomorPemesanan,
          lokasiId,
          amount: partnerTotal,
          alasan: "pengembalian_dana",
          catatan: `Pengembalian dana ${refund.nomorTagihan}`,
          oleh,
        },
        now,
      );
    }
    return;
  }

  // Already paid out, or there was no item to lower: the money is gone, so it
  // becomes a Potongan the Lokasi Mitra's next Pencairan nets. The unique index on
  // (its source Tagihan, its kind) makes a repeated transfer a no-op rather than a
  // second charge, and the Bukti's own link is what shows the debt.
  await sisipPotongan(
    tx,
    {
      lokasiId,
      amount: partnerTotal,
      alasanKind: "pengembalian_dana",
      alasan: `Pengembalian dana Tagihan ${refund.nomorTagihan}`,
      tautan: link,
      sumberTagihanId: refund.tagihanId,
      sumberNomorPemesanan: refund.nomorPemesanan,
    },
    now,
  );
}

/** The Lokasi Mitra a refunded line's provider names, or null for the Operator's own and anyone else's. */
function providerLokasiId(provider: unknown): string | null {
  const parsed = z
    .object({ kind: z.literal("lokasi_mitra"), lokasiId: z.string().min(1) })
    .safeParse(provider);
  return parsed.success ? parsed.data.lokasiId : null;
}

/** What the order's still-open items would pay, at the amount each would pay. */
function jumlahItems(items: readonly (typeof pencairanItem.$inferSelect)[]): number {
  return items.reduce((total, item) => total + (item.jumlahDisesuaikan ?? item.amount), 0);
}

/** The transfer's date: a real WIB date, today included, never in the future. */
function tanggalTransfer(value: string, now: Date): string | null {
  const parsed = z.iso.date().safeParse(value);
  if (!parsed.success) return null;
  return parsed.data <= wibDateOf(now) ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** One refund as its own list, the approval and the transfer read it. */
export async function pengembalianById(db: Database, pengembalianId: string): Promise<PengembalianRow | null> {
  if (!z.uuid().safeParse(pengembalianId).success) return null;
  const [row] = await db.select().from(pengembalian).where(eq(pengembalian.id, pengembalianId));
  if (!row) return null;
  const baris = await db
    .select()
    .from(pengembalianBaris)
    .where(eq(pengembalianBaris.pengembalianId, row.id))
    .orderBy(asc(pengembalianBaris.posisi));
  return toRow(row, baris);
}

function toRow(
  row: typeof pengembalian.$inferSelect,
  baris: (typeof pengembalianBaris.$inferSelect)[],
): PengembalianRow {
  return {
    id: row.id,
    tagihanId: row.tagihanId,
    nomorTagihan: row.nomorTagihan,
    nomorPemesanan: row.nomorPemesanan,
    pemesan: { nama: row.pemesanNama, telepon: row.pemesanTelepon, akunId: row.pemesanAkunId },
    fault: row.fault,
    sebab: row.sebab,
    jumlah: row.jumlah,
    biayaLayananPlatform: row.biayaLayananPlatform,
    biayaLayananPlatformDikembalikan: row.biayaLayananPlatformDikembalikan,
    penanggung: row.penanggung,
    catatan: row.catatan,
    rekening: row.rekening ? rekeningSchema.parse(row.rekening) : null,
    status: row.status,
    dimintaPada: row.dimintaPada,
    disetujuiPada: row.disetujuiPada,
    disetujuiOleh: row.disetujuiOleh,
    jatuhTempoAt: row.jatuhTempoAt,
    ditransferPada: row.ditransferPada,
    baris: baris.map((line) => ({
      posisi: line.posisi,
      label: line.label,
      jumlah: line.jumlah,
      provider: line.provider as TagihanLine["provider"],
    })),
  };
}

/** Every refund still waiting for an Admin Platform's decision, oldest first. */
export async function pengembalianDiminta(db: Database): Promise<PengembalianRow[]> {
  const rows = await db
    .select()
    .from(pengembalian)
    .where(eq(pengembalian.status, "diminta"))
    .orderBy(asc(pengembalian.dimintaPada));
  const dibaca: PengembalianRow[] = [];
  for (const row of rows) {
    const satu = await pengembalianById(db, row.id);
    if (satu) dibaca.push(satu);
  }
  return dibaca;
}

/** One approved, not-yet-paid refund: the Tier 3 "refund transfer" row (AC 3). */
export interface BarisSiapDitransfer {
  id: string;
  nomorTagihan: string;
  pemesanNama: string;
  /** Whole rupiah waiting to go back. */
  jumlah: Rupiah;
  /** `disetujui_pada` plus 2 Hari Kerja, stamped at approval and read here. */
  jatuhTempoAt: Date;
}

/** Every approved refund still waiting for its transfer: the Tier 3 row's own query. */
export async function pengembalianSiapDitransfer(db: Database): Promise<BarisSiapDitransfer[]> {
  const rows = await db
    .select()
    .from(pengembalian)
    .where(eq(pengembalian.status, "disetujui"))
    .orderBy(asc(pengembalian.jatuhTempoAt), asc(pengembalian.id));
  return rows.flatMap((row) =>
    row.jatuhTempoAt === null
      ? []
      : [
          {
            id: row.id,
            nomorTagihan: row.nomorTagihan,
            pemesanNama: row.pemesanNama,
            jumlah: row.jumlah,
            jatuhTempoAt: row.jatuhTempoAt,
          },
        ],
  );
}

/** What an unguessable link shows: the Bukti Pengembalian Dana, in the words the spec asks for. */
export interface DokumenBuktiPengembalian {
  type: "bukti_pengembalian_dana";
  nomorBukti: string;
  link: string;
  nomorTagihan: string;
  pemesan: { nama: string };
  jumlah: Rupiah;
  baris: { label: string; jumlah: Rupiah }[];
  /** Whether the Operator's fee was given back; when it was not, the amount that stayed (AC 4). */
  biayaLayananPlatform: { dikembalikan: boolean; jumlah: Rupiah };
  penanggung: PengembalianPenanggung;
  rekening: RekeningTujuan;
  ditransferPada: string;
  header: DocumentHeader;
}

export async function buktiById(db: Database, buktiId: string): Promise<BuktiPengembalian | null> {
  const [row] = await db.select().from(buktiPengembalianDana).where(eq(buktiPengembalianDana.id, buktiId));
  if (!row) return null;
  const refund = await pengembalianById(db, row.pengembalianId);
  if (!refund) throw new Error("a Bukti Pengembalian Dana without its refund");
  return {
    id: row.id,
    nomorBukti: row.nomor,
    link: row.link,
    pengembalianId: row.pengembalianId,
    pengembalianTagihanId: refund.tagihanId,
    nomorTagihan: refund.nomorTagihan,
    nomorPemesanan: refund.nomorPemesanan,
    pemesan: refund.pemesan,
    jumlah: row.jumlah,
    baris: refund.baris,
    biayaLayananPlatform: {
      dikembalikan: refund.biayaLayananPlatformDikembalikan,
      jumlah: refund.biayaLayananPlatform,
    },
    penanggung: refund.penanggung,
    rekening: rekeningSchema.parse(refund.rekening),
    ditransferPada: row.ditransferPada,
    dibuatPada: row.dibuatPada,
    header: row.header as DocumentHeader,
  };
}

export async function buktiPengembalianByLink(db: Database, link: string): Promise<DokumenBuktiPengembalian | null> {
  if (!documentLinkSchema.safeParse(link).success) return null;
  const [row] = await db.select().from(buktiPengembalianDana).where(eq(buktiPengembalianDana.link, link));
  if (!row) return null;
  const refund = await pengembalianById(db, row.pengembalianId);
  if (!refund) return null;
  return {
    type: "bukti_pengembalian_dana",
    nomorBukti: row.nomor,
    link: row.link,
    nomorTagihan: refund.nomorTagihan,
    pemesan: { nama: refund.pemesan.nama },
    jumlah: row.jumlah,
    baris: refund.baris.map((line) => ({ label: line.label, jumlah: line.jumlah })),
    biayaLayananPlatform: {
      dikembalikan: refund.biayaLayananPlatformDikembalikan,
      jumlah: refund.biayaLayananPlatform,
    },
    penanggung: refund.penanggung,
    rekening: rekeningSchema.parse(refund.rekening),
    ditransferPada: row.ditransferPada,
    header: row.header as DocumentHeader,
  };
}
