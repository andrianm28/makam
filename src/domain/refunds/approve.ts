/**
 * Admin Platform approving a refund request (spec, Billing > Refunds: "Admin
 * Platform approves every refund"; Work Queues: the Tier 3 "refund transfer"
 * row, 2 working days after approval; ticket 31's AC 2, AC 3).
 *
 * No money moves here — that is `terbitkanBuktiPengembalianDana`'s, once a
 * bank account is on file — this only turns "diajukan" into "disetujui" and
 * stamps the deadline the Tier 3 row reads, on the Admin Platform calendar
 * (ticket 11), exactly as Payouts stamps its own Pencairan deadline.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import { adaHargaKhusus, biayaLayananPlatformTerbayar, type Billing } from "@/domain/billing";
import { pengembalianResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { addWorkingDays, type Lokasi } from "@/domain/lokasi";
import { rupiahSchema } from "@/lib/rupiah";
import type { Clock } from "@/ports/clock";
import { toPermintaan, type PermintaanPengembalian } from "./baca";
import type { RefundLine } from "./request";
import { permintaanPengembalian } from "./schema";

/** How soon a transfer is due after approval (spec, Work Queues: "refund transfers (2 working days after approval)"). */
export const TENGGAT_TRANSFER_HARI_KERJA = 2;

export interface ApproveDeps {
  db: Database;
  clock: Clock;
  audit: AuditLog;
  lokasi: Pick<Lokasi, "adminPlatformCalendar">;
  billing: Pick<Billing, "tagihan">;
}

export interface SetujuiInput {
  permintaanId: string;
  /**
   * Admin Platform's own fee amount to return, only when the Tagihan carries a
   * Harga Khusus (owner decision 2026-10-01). It may only **lower** the fault
   * rule's payable-fee default; `catatan` is required whenever it differs.
   */
  biayaLayananPlatform?: number;
  /** Required whenever `biayaLayananPlatform` differs from the default. */
  catatan?: string;
}

export type SetujuiResult =
  | { ok: true; permintaan: PermintaanPengembalian }
  | WriteRefusal
  | { ok: false; reason: "tidak_ditemukan" }
  | { ok: false; reason: "sudah_diproses" }
  /** An override was given for a Tagihan with no Harga Khusus: the fault table stands there. */
  | { ok: false; reason: "bukan_harga_khusus" }
  /** An override above the fault rule's payable fee: Admin Platform may only lower it. */
  | { ok: false; reason: "biaya_melebihi_default" }
  /** The override differs from the default but no note was given. */
  | { ok: false; reason: "catatan_wajib" };

const CATATAN_MAX = 500;
const inputSchema = z.object({
  permintaanId: z.uuid(),
  // The one money schema, the same `rupiahSchema` the Server Action's form boundary uses.
  biayaLayananPlatform: rupiahSchema.optional(),
  catatan: z.string().trim().min(1).max(CATATAN_MAX).optional(),
});

export async function setujuiPengembalian(deps: ApproveDeps, by: Actor, input: SetujuiInput): Promise<SetujuiResult> {
  const refusal = writeRefusal(by, "pengembalian.kelola", pengembalianResource());
  if (refusal) return refusal;
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "tidak_ditemukan" };
  const now = deps.clock.now();
  const calendar = await deps.lokasi.adminPlatformCalendar();
  const deadline = addWorkingDays(calendar, now, TENGGAT_TRANSFER_HARI_KERJA);
  if (!deadline.ok) throw new Error(`the Admin Platform calendar has no Hari Kerja ahead of ${now.toISOString()}`);

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [row] = await tx.select().from(permintaanPengembalian).where(eq(permintaanPengembalian.id, parsed.data.permintaanId)).for("update");
    if (!row) return { ok: false, reason: "tidak_ditemukan" } as const;
    if (row.status !== "diajukan") return { ok: false, reason: "sudah_diproses" } as const;

    let lines = row.lines as RefundLine[];
    let jumlah = row.jumlah;
    let biayaLayananPlatformDikembalikan = row.biayaLayananPlatformDikembalikan;
    let penuh = row.penuh;
    let override: number | null = null;
    if (parsed.data.biayaLayananPlatform !== undefined) {
      const tagihan = await deps.billing.tagihan(row.tagihanId);
      if (!tagihan || !adaHargaKhusus(tagihan.lines)) return { ok: false, reason: "bukan_harga_khusus" } as const;
      // One source for the fault rule's default: the same Billing rule the approval screen prefills its field from.
      const biayaBawaan = biayaLayananPlatformTerbayar(tagihan.lines);
      if (parsed.data.biayaLayananPlatform > biayaBawaan) return { ok: false, reason: "biaya_melebihi_default" } as const;
      if (parsed.data.biayaLayananPlatform !== biayaBawaan) {
        if (!parsed.data.catatan) return { ok: false, reason: "catatan_wajib" } as const;
        const nilaiBaru = parsed.data.biayaLayananPlatform;
        const feeLine = tagihan.lines.find((line) => line.kind === "biaya_layanan_platform");
        const indeks = lines.findIndex((line) => line.kind === "biaya_layanan_platform");
        override = nilaiBaru;
        lines =
          nilaiBaru === 0
            ? lines.filter((line) => line.kind !== "biaya_layanan_platform")
            : indeks >= 0
              ? lines.map((line, i) => (i === indeks ? { ...line, amount: nilaiBaru } : line))
              : [...lines, { label: feeLine?.label ?? "Biaya Layanan Platform", amount: nilaiBaru, lokasiId: null, kind: "biaya_layanan_platform" as const }];
        jumlah = rupiahSchema.parse(lines.reduce((sum, line) => sum + line.amount, 0));
        biayaLayananPlatformDikembalikan = nilaiBaru > 0;
        // A refund the fee was lowered below is no longer everything the fault rule allows.
        penuh = false;
      }
    }

    await tx
      .update(permintaanPengembalian)
      .set({
        status: "disetujui",
        disetujuiPada: now,
        disetujuiOleh: by.accountId,
        tenggatTransferPada: deadline.at,
        lines,
        jumlah,
        biayaLayananPlatformDikembalikan,
        penuh,
      })
      .where(eq(permintaanPengembalian.id, row.id));
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "pengembalian.setujui",
      entity: { kind: "permintaan_pengembalian", id: row.id },
      lokasiId: null,
      before: { status: row.status, jumlah: row.jumlah, biayaLayananPlatformDikembalikan: row.biayaLayananPlatformDikembalikan },
      after: {
        status: "disetujui",
        tenggatTransferPada: deadline.at,
        jumlah,
        penyesuaianBiayaLayananPlatform: override,
      },
      reason: parsed.data.catatan ?? null,
    });
    const [setelah] = await tx.select().from(permintaanPengembalian).where(eq(permintaanPengembalian.id, row.id));
    return { ok: true, permintaan: toPermintaan(setelah) } as const;
  });
}
