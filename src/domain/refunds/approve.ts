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
import { pengembalianResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { addWorkingDays, type Lokasi } from "@/domain/lokasi";
import type { Clock } from "@/ports/clock";
import { toPermintaan, type PermintaanPengembalian } from "./baca";
import { permintaanPengembalian } from "./schema";

/** How soon a transfer is due after approval (spec, Work Queues: "refund transfers (2 working days after approval)"). */
export const TENGGAT_TRANSFER_HARI_KERJA = 2;

export interface ApproveDeps {
  db: Database;
  clock: Clock;
  audit: AuditLog;
  lokasi: Pick<Lokasi, "adminPlatformCalendar">;
}

export type SetujuiResult =
  | { ok: true; permintaan: PermintaanPengembalian }
  | WriteRefusal
  | { ok: false; reason: "tidak_ditemukan" }
  | { ok: false; reason: "sudah_diproses" };

const inputSchema = z.object({ permintaanId: z.uuid() });

export async function setujuiPengembalian(
  deps: ApproveDeps,
  by: Actor,
  input: { permintaanId: string },
): Promise<SetujuiResult> {
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
    await tx
      .update(permintaanPengembalian)
      .set({ status: "disetujui", disetujuiPada: now, disetujuiOleh: by.accountId, tenggatTransferPada: deadline.at })
      .where(eq(permintaanPengembalian.id, row.id));
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "pengembalian.setujui",
      entity: { kind: "permintaan_pengembalian", id: row.id },
      lokasiId: null,
      before: { status: row.status },
      after: { status: "disetujui", tenggatTransferPada: deadline.at },
      reason: null,
    });
    const [setelah] = await tx.select().from(permintaanPengembalian).where(eq(permintaanPengembalian.id, row.id));
    return { ok: true, permintaan: toPermintaan(setelah) } as const;
  });
}
