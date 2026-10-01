/**
 * Raising a refund request (spec, Billing > Refunds): from a cancelled, paid
 * Tagihan (`materialisasiDariPembatalan`), or Admin Platform's goodwill refund
 * from the Operator's own funds (`ajukanGoodwill`). Both write through
 * `raiseRequest`, so the one-Diajukan index is never bypassed.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Billing, Tagihan } from "@/domain/billing";
import { adalahBiayaLayananPlatform, barisBiayaLayananPlatform, biayaLayananPlatformTerbayar, nilaiDibayarBaris } from "@/domain/billing";
import { pengembalianResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { rupiahSchema, type Rupiah } from "@/lib/rupiah";
import type { Clock } from "@/ports/clock";
import { biayaLayananPlatformDikembalikan } from "./aturan";
import { permintaanPengembalian, pihakBersalahKinds, type PihakBersalah } from "./schema";
import { toPermintaan, type PermintaanPengembalian } from "./baca";

const CATATAN_MAX = 500;

/** One refunded line, snapshotted at request time: what the Bukti Pengembalian Dana repeats, and what nets by Lokasi. */
export interface RefundLine {
  label: string;
  amount: number;
  /** The Lokasi Mitra whose tariff this line is, when it is one; null for the Operator's own line or a manual/goodwill line. */
  lokasiId: string | null;
  /**
   * The Tagihan line's kind this snapshots. Every new row, a snapshot of a
   * Tagihan line writes sets it; it lets Refunds tell the fee line from a
   * tariff line. It is optional only because rows written by the release before
   * ticket 95 stored none (the `{ label, amount, lokasiId }` shape), and those
   * in-flight rows are read through `indeksBiayaLayananPlatform` below, never
   * appended to by guessing.
   */
  kind?: Tagihan["lines"][number]["kind"];
}

/**
 * The index of the Biaya Layanan Platform line among a refund request's own
 * lines. A row written before ticket 95 carries no `kind`, so when none does,
 * the fee is found by the label the Tagihan issues it with; as a last resort a
 * single line whose label names the fee. `-1` when there is none, and the
 * caller replaces only what it found — never appends a second fee line.
 */
export function indeksBiayaLayananPlatform(lines: readonly RefundLine[], labelBiaya: string | null | undefined): number {
  const olehKind = lines.findIndex((line) => line.kind === "biaya_layanan_platform");
  if (olehKind >= 0) return olehKind;
  if (labelBiaya) {
    const olehLabel = lines.findIndex((line) => line.label === labelBiaya);
    if (olehLabel >= 0) return olehLabel;
  }
  const cocok = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.label.toLowerCase().includes("biaya layanan platform"));
  return cocok.length === 1 ? cocok[0].index : -1;
}

export interface RequestDeps {
  db: Database;
  clock: Clock;
  audit: AuditLog;
}

/**
 * The one place a request row is inserted, so the open-index applies to every
 * source alike. `biayaLayananPlatformDikembalikan` is the caller's own,
 * already decided — for `pihakBersalah`, `./aturan.ts`'s rule (fee kept only
 * when the Pemesan cancels); for goodwill, the Operator's own free choice,
 * which is not a fault finding and so does not go through that rule at all.
 */
async function raiseRequest(
  db: Database,
  now: Date,
  values: {
    tagihanId: string;
    nomorTagihan: string;
    nomorPemesanan: string | null;
    sumber: "pembatalan" | "manual";
    pihakBersalah: PihakBersalah;
    biayaLayananPlatformDikembalikan: boolean;
    goodwill: boolean;
    penuh: boolean;
    lines: RefundLine[];
    jumlah: Rupiah;
    catatan: string | null;
    diajukanOleh: string | null;
  },
): Promise<{ id: string } | null> {
  const [row] = await db
    .insert(permintaanPengembalian)
    .values({
      tagihanId: values.tagihanId,
      nomorTagihan: values.nomorTagihan,
      nomorPemesanan: values.nomorPemesanan,
      sumber: values.sumber,
      pihakBersalah: values.pihakBersalah,
      biayaLayananPlatformDikembalikan: values.biayaLayananPlatformDikembalikan,
      goodwill: values.goodwill,
      penuh: values.penuh,
      lines: values.lines,
      jumlah: values.jumlah,
      catatan: values.catatan,
      diajukanPada: now,
      diajukanOleh: values.diajukanOleh,
      status: "diajukan",
    })
    .onConflictDoNothing()
    .returning({ id: permintaanPengembalian.id });
  return row ?? null;
}

/**
 * Materialises a cancelled, paid Tagihan (one Billing flagged with
 * `pengembalianDiminta`) into a refund request, unless one already exists (the
 * `sumber = 'pembatalan'` unique index makes a second call a no-op, so the tick
 * driving it is idempotent). The **caller names who is at fault**, and the
 * amount comes from the spec's fee rule (`aturan.ts`), not from the figure
 * Billing stored at cancellation: Billing's own figure always keeps the fee,
 * which is right only when the Pemesan cancels. It is always "penuh": every line
 * that may be refunded is refunded.
 */
export async function materialisasiDariPembatalan(
  db: Database,
  now: Date,
  tagihan: Tagihan,
  pihakBersalah: PihakBersalah,
): Promise<{ id: string } | null> {
  if (!tagihan.pengembalianDiminta) return null;
  const denganFee = biayaLayananPlatformDikembalikan(pihakBersalah);
  // After a Harga Khusus each line is refunded at what was really paid (ticket 95's owner decision):
  // the tariff lines in full (only the surplus above the fee reduces them) and the fee at its payable
  // part. The Penyesuaian line itself is never refunded — it is not money the family paid.
  const lines: RefundLine[] = [];
  for (const line of tagihan.lines) {
    if (line.kind === "penyesuaian_harga_khusus") continue;
    if (adalahBiayaLayananPlatform(line)) {
      if (!denganFee) continue;
      const amount = biayaLayananPlatformTerbayar(tagihan.lines);
      if (amount > 0) lines.push({ label: line.label, amount, lokasiId: null, kind: line.kind });
      continue;
    }
    const amount = nilaiDibayarBaris(tagihan.lines, line);
    if (amount > 0) lines.push({ label: line.label, amount, lokasiId: line.provider.kind === "lokasi_mitra" ? line.provider.lokasiId : null, kind: line.kind });
  }
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  // The lines are each line's paid value, so their sum can never pass what the Tagihan was paid.
  if (total <= 0 || total > tagihan.total) return null;
  const jumlah = rupiahSchema.safeParse(total);
  if (!jumlah.success || jumlah.data === 0) return null;
  return raiseRequest(db, now, {
    tagihanId: tagihan.id,
    nomorTagihan: tagihan.nomorTagihan,
    nomorPemesanan: tagihan.nomorPemesanan,
    sumber: "pembatalan",
    pihakBersalah,
    biayaLayananPlatformDikembalikan: denganFee,
    goodwill: false,
    penuh: true,
    lines,
    jumlah: jumlah.data,
    catatan: null,
    diajukanOleh: null,
  });
}

const ajukanGoodwillSchema = z.object({
  tagihanId: z.uuid(),
  nomorTagihan: z.string().trim().min(1).max(50),
  nomorPemesanan: z.string().trim().min(1).max(50).nullable(),
  jumlah: rupiahSchema,
  catatan: z.string().trim().min(1).max(CATATAN_MAX),
});
/** `jumlah` is a plain `number` at the boundary, like every other money input in this codebase; `ajukanGoodwillSchema` validates and brands it inside. */
export interface AjukanGoodwillInput {
  tagihanId: string;
  nomorTagihan: string;
  nomorPemesanan: string | null;
  jumlah: number;
  catatan: string;
}

export type AjukanGoodwillResult =
  | { ok: true; permintaan: PermintaanPengembalian }
  | WriteRefusal
  | { ok: false; reason: "input_tidak_valid" }
  /** Another pengembalian dana for this Tagihan is still open (Diajukan or Disetujui, not yet transferred). */
  | { ok: false; reason: "sudah_ada_permintaan_terbuka" };

/**
 * Admin Platform raises a goodwill refund on any Tagihan: an amount from the
 * Operator's own funds, as a courtesy, never netted from a Lokasi Mitra's
 * Pencairan whatever Payouts holds for this Tagihan. Audited.
 */
export async function ajukanGoodwill(deps: RequestDeps, by: Actor, input: AjukanGoodwillInput): Promise<AjukanGoodwillResult> {
  const refusal = writeRefusal(by, "pengembalian.kelola", pengembalianResource());
  if (refusal) return refusal;
  const parsed = ajukanGoodwillSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const data = parsed.data;
  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const raised = await raiseRequest(tx, now, {
      tagihanId: data.tagihanId,
      nomorTagihan: data.nomorTagihan,
      nomorPemesanan: data.nomorPemesanan,
      sumber: "manual",
      // A goodwill gesture is the Operator's own call, not a fault finding, so
      // it never goes through the fee table at all: `jumlah` is exactly what
      // Admin Platform entered, fee included or not, by hand.
      pihakBersalah: "operator",
      biayaLayananPlatformDikembalikan: false,
      goodwill: true,
      penuh: false,
      lines: [{ label: "Pengembalian dana (goodwill)", amount: data.jumlah, lokasiId: null }],
      jumlah: data.jumlah,
      catatan: data.catatan,
      diajukanOleh: by.accountId,
    });
    if (!raised) return { ok: false, reason: "sudah_ada_permintaan_terbuka" } as const;
    const [row] = await tx.select().from(permintaanPengembalian).where(eq(permintaanPengembalian.id, raised.id));
    if (!row) throw new Error("goodwill request just inserted was not found");
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "pengembalian.ajukan_goodwill",
      entity: { kind: "permintaan_pengembalian", id: row.id },
      lokasiId: null,
      before: null,
      after: { tagihanId: row.tagihanId, jumlah: row.jumlah, catatan: row.catatan },
      reason: data.catatan,
    });
    return { ok: true, permintaan: toPermintaan(row) } as const;
  });
}

/** A refunded line is a whole-rupiah amount of a Tagihan line, so it can never exceed what one Tagihan may hold. */
const RUPIAH_MAX_LINE = 10_000_000_000;

const ajukanBarisSchema = z.object({
  pihakBersalah: z.enum(pihakBersalahKinds),
  penuh: z.boolean().optional(),
  penuhBilaLengkap: z.boolean().optional(),
  lines: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(300),
        // Zero is allowed: a fully-waived Tagihan (the Harga Khusus equals tariff plus fee) owes a
        // line of Rp 0, and zero refund is not a refusal — see the no-op below, no zero row is written.
        amount: z.number().int().nonnegative().max(RUPIAH_MAX_LINE),
        lokasiId: z.uuid().nullable(),
      }),
    )
    .min(1)
    .max(50),
});

export interface AjukanBarisInput {
  pihakBersalah: PihakBersalah;
  /**
   * True when the lines return everything the fault rule lets this Tagihan return (a Pembatalan within its Masa
   * Pembatalan: the whole tariff, the Biaya Layanan Platform kept). Only then is the Tagihan Dikembalikan penuh, the
   * Lokasi Mitra's Pencairan cancelled and never made later. Refused unless it really is everything; default false.
   */
  penuh?: boolean;
  /**
   * The request is "penuh" exactly when, with this one, everything the fee rule returns has been asked (a Pembatalan of the
   * last Hak Pakai of an order, every earlier one refunded in full); otherwise it is an ordinary partial request. Never refused
   * for not being complete, unlike `penuh`.
   */
  penuhBilaLengkap?: boolean;
  /** The lines of the Tagihan to return, the Biaya Layanan Platform excluded: whether that fee comes back is Refunds' rule. */
  lines: RefundLine[];
}

export type AjukanBarisResult =
  | {
      ok: true;
      /**
       * The request this joined or raised, or null when there was nothing to
       * refund at all (a fully-waived Tagihan: `jumlah` is Rp 0 and no request
       * row is written — the check constraint holds at least Rp 1).
       */
      permintaanId: string | null;
      /** What this call added to the request: the lines given, plus the fee line where the fault rule and the Tagihan allow it. */
      lines: RefundLine[];
      jumlah: number;
      biayaLayananPlatformDikembalikan: boolean;
    }
  | { ok: false; reason: "input_tidak_valid" | "tagihan_tidak_ditemukan" | "tagihan_belum_lunas" | "melebihi_tagihan" | "sudah_ada_permintaan_terbuka" };

/**
 * A refund request for some lines of a paid Tagihan: what an order cancelled one
 * item at a time returns (a Layanan job cancelled by the Pemesan or for lateness).
 * The caller names the lines and who is at fault; the **fee rule is Refunds'**
 * (`aturan.ts`): the Biaya Layanan Platform line of the Tagihan is added when the
 * fault is not the Pemesan's, and only once per Tagihan however many requests
 * follow. The total of every request on a Tagihan never exceeds what it was paid.
 *
 * An open request that no one has approved yet takes the new lines (one transfer
 * for one order's cancellations); one already approved or transferring cannot,
 * because its amount is fixed, so the new lines wait as a request of their own
 * and its transfer pays them, never the approved one's.
 */
export async function ajukanBaris(
  deps: { db: Database; clock: Clock; billing: Pick<Billing, "tagihan"> },
  tagihanId: string,
  input: AjukanBarisInput,
): Promise<AjukanBarisResult> {
  // One transaction (a savepoint when the caller's is open) so the row lock below is held until the
  // lines it read are written: two cancellations joining one open request take turns, never overwrite.
  return deps.db.transaction((tx) => ajukanBarisTerkunci({ ...deps, db: tx }, tagihanId, input));
}

async function ajukanBarisTerkunci(
  deps: { db: Database; clock: Clock; billing: Pick<Billing, "tagihan"> },
  tagihanId: string,
  input: AjukanBarisInput,
): Promise<AjukanBarisResult> {
  const parsed = ajukanBarisSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const tagihan = await deps.billing.tagihan(tagihanId);
  if (!tagihan) return { ok: false, reason: "tagihan_tidak_ditemukan" };
  if (tagihan.status !== "lunas" && tagihan.status !== "dikembalikan_sebagian") return { ok: false, reason: "tagihan_belum_lunas" };

  // FOR UPDATE: the Tagihan's requests are locked here, so a concurrent join waits for this one to commit
  // and then reads the lines and the total this one wrote (no under-refund from a lost update).
  const sebelumnya = await deps.db.select().from(permintaanPengembalian).where(eq(permintaanPengembalian.tagihanId, tagihanId)).for("update");
  const feeSudahDikembalikan = sebelumnya.some((row) => !row.goodwill && row.biayaLayananPlatformDikembalikan);
  const lines: RefundLine[] = [...parsed.data.lines];
  const feeLine = barisBiayaLayananPlatform(tagihan.lines)[0];
  // After a Harga Khusus the fee is never apportioned like a tariff line (ticket 95's owner decision): the Operator bore
  // the Harga Khusus from the fee first (spec 503), so what may return is the payable fee — never its proportional share.
  const feeNilai = feeLine ? biayaLayananPlatformTerbayar(tagihan.lines) : 0;
  const denganFee = biayaLayananPlatformDikembalikan(parsed.data.pihakBersalah) && !feeSudahDikembalikan && feeLine !== undefined && feeNilai > 0;
  if (denganFee && feeLine) lines.push({ label: feeLine.label, amount: feeNilai, lokasiId: null, kind: feeLine.kind });
  const jumlah = lines.reduce((sum, line) => sum + line.amount, 0);
  const sudah = sebelumnya.reduce((sum, row) => sum + row.jumlah, 0);
  if (sudah + jumlah > tagihan.total) return { ok: false, reason: "melebihi_tagihan" };
  // Nothing to return: a fully-waived Tagihan owes Rp 0 (its Harga Khusus equals tariff plus fee) and a
  // zero-jumlah request row is not allowed. That is a clean no-op, not a refusal, so the caller can finish.
  if (jumlah === 0) return { ok: true, permintaanId: null, lines, jumlah: 0, biayaLayananPlatformDikembalikan: false };

  // A "penuh" request is everything the Tagihan can return: nothing may stay behind but the fee the fault rule keeps.
  // What stays behind is the fee's **payable** part (`clamp(F − |P|, 0, F)`), not its gross amount: after a Harga
  // Khusus the Operator already bore part of it, so the full tariff plus the payable fee is the reduced total again.
  const feeDitahan = feeLine !== undefined && !denganFee && !feeSudahDikembalikan ? biayaLayananPlatformTerbayar(tagihan.lines) : 0;
  const lengkap = sudah + jumlah + feeDitahan === tagihan.total;
  if (parsed.data.penuh && !lengkap) return { ok: false, reason: "input_tidak_valid" };
  const penuh = lengkap && (parsed.data.penuh === true || parsed.data.penuhBilaLengkap === true);

  // The one request still Diajukan (the partial unique index allows at most one) is the only one a new line may
  // join. Named explicitly, never by row order: a request already approved is awaiting the transfer of the amount
  // Admin Platform approved, so its lines are frozen, and a goodwill one is the Operator's own gesture, not this
  // caller's to add to. The new lines then become their own request, with a transfer of their own, so every line is
  // still refunded exactly once however many plots are cancelled, in whatever order.
  const diajukan = sebelumnya.find((row) => row.status === "diajukan");
  const bisaDigabung = diajukan !== undefined && !diajukan.goodwill && !diajukan.penuh;
  // A Diajukan request that cannot take these lines leaves nowhere else for them: a second Diajukan request for one
  // Tagihan is impossible by the partial unique index, so the raise is refused rather than colliding with it.
  if (diajukan && !bisaDigabung) return { ok: false, reason: "sudah_ada_permintaan_terbuka" };
  if (diajukan && bisaDigabung) {
    await deps.db
      .update(permintaanPengembalian)
      .set({
        lines: [...(diajukan.lines as RefundLine[]), ...lines],
        jumlah: rupiahSchema.parse(diajukan.jumlah + jumlah),
        biayaLayananPlatformDikembalikan: diajukan.biayaLayananPlatformDikembalikan || denganFee,
        // Joining may complete the Tagihan: everything the fee rule returns is then asked, and the request is "penuh".
        penuh,
      })
      .where(and(eq(permintaanPengembalian.id, diajukan.id), eq(permintaanPengembalian.status, "diajukan")));
    return { ok: true, permintaanId: diajukan.id, lines, jumlah, biayaLayananPlatformDikembalikan: denganFee };
  }

  const raised = await raiseRequest(deps.db, deps.clock.now(), {
    tagihanId: tagihan.id,
    nomorTagihan: tagihan.nomorTagihan,
    nomorPemesanan: tagihan.nomorPemesanan,
    sumber: "manual",
    pihakBersalah: parsed.data.pihakBersalah,
    biayaLayananPlatformDikembalikan: denganFee,
    goodwill: false,
    penuh,
    lines,
    jumlah: rupiahSchema.parse(jumlah),
    catatan: null,
    diajukanOleh: null,
  });
  if (!raised) return { ok: false, reason: "sudah_ada_permintaan_terbuka" };
  return { ok: true, permintaanId: raised.id, lines, jumlah, biayaLayananPlatformDikembalikan: denganFee };
}
