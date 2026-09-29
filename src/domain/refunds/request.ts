/**
 * Raising a refund request (spec, Billing > Refunds): from a cancelled, paid
 * Tagihan (`materialisasiDariPembatalan`), or Admin Platform's goodwill refund
 * from the Operator's own funds (`ajukanGoodwill`). Both write through
 * `raiseRequest`, so the open-request index is never bypassed.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Billing, Tagihan } from "@/domain/billing";
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
  const lines: RefundLine[] = tagihan.lines
    .filter((line) => denganFee || line.kind !== "biaya_layanan_platform")
    .map((line) => ({
      label: line.label,
      amount: line.amount,
      lokasiId: line.provider.kind === "lokasi_mitra" ? line.provider.lokasiId : null,
    }));
  const jumlah = rupiahSchema.safeParse(lines.reduce((sum, line) => sum + line.amount, 0));
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
  /** Another request for this Tagihan is already open (diajukan or disetujui). */
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
  lines: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(300),
        amount: z.number().int().positive().max(RUPIAH_MAX_LINE),
        lokasiId: z.uuid().nullable(),
      }),
    )
    .min(1)
    .max(50),
});

export interface AjukanBarisInput {
  pihakBersalah: PihakBersalah;
  /** The lines of the Tagihan to return, the Biaya Layanan Platform excluded: whether that fee comes back is Refunds' rule. */
  lines: RefundLine[];
}

export type AjukanBarisResult =
  | {
      ok: true;
      permintaanId: string;
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
 * for one order's cancellations); one already approved or transferring refuses,
 * so a caller can undo what it was doing rather than lose the money.
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
  const feeLine = tagihan.lines.find((line) => line.kind === "biaya_layanan_platform");
  const denganFee = biayaLayananPlatformDikembalikan(parsed.data.pihakBersalah) && !feeSudahDikembalikan && feeLine !== undefined;
  if (denganFee && feeLine) lines.push({ label: feeLine.label, amount: feeLine.amount, lokasiId: null });
  const jumlah = lines.reduce((sum, line) => sum + line.amount, 0);
  const sudah = sebelumnya.reduce((sum, row) => sum + row.jumlah, 0);
  if (jumlah === 0 || sudah + jumlah > tagihan.total) return { ok: false, reason: "melebihi_tagihan" };

  const terbuka = sebelumnya.find((row) => row.status !== "ditransfer");
  if (terbuka) {
    if (terbuka.status !== "diajukan" || terbuka.goodwill || terbuka.penuh) return { ok: false, reason: "sudah_ada_permintaan_terbuka" };
    await deps.db
      .update(permintaanPengembalian)
      .set({
        lines: [...(terbuka.lines as RefundLine[]), ...lines],
        jumlah: rupiahSchema.parse(terbuka.jumlah + jumlah),
        biayaLayananPlatformDikembalikan: terbuka.biayaLayananPlatformDikembalikan || denganFee,
      })
      .where(and(eq(permintaanPengembalian.id, terbuka.id), eq(permintaanPengembalian.status, "diajukan")));
    return { ok: true, permintaanId: terbuka.id, lines, jumlah, biayaLayananPlatformDikembalikan: denganFee };
  }

  const raised = await raiseRequest(deps.db, deps.clock.now(), {
    tagihanId: tagihan.id,
    nomorTagihan: tagihan.nomorTagihan,
    nomorPemesanan: tagihan.nomorPemesanan,
    sumber: "manual",
    pihakBersalah: parsed.data.pihakBersalah,
    biayaLayananPlatformDikembalikan: denganFee,
    goodwill: false,
    penuh: false,
    lines,
    jumlah: rupiahSchema.parse(jumlah),
    catatan: null,
    diajukanOleh: null,
  });
  if (!raised) return { ok: false, reason: "sudah_ada_permintaan_terbuka" };
  return { ok: true, permintaanId: raised.id, lines, jumlah, biayaLayananPlatformDikembalikan: denganFee };
}
