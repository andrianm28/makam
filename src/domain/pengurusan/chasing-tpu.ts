/**
 * The family reminders of an overdue pay-after TPU Tagihan (spec, Billing > Chasing: "reminders at
 * H+3/7/14/30, stopping as soon as the Tagihan is Lunas or Tidak Tertagih"; Notifications' reminder
 * table, "Pay-after Tagihan: Saat Duka (Lokasi Mitra, DKI TPU)"; ticket 46, gap 5).
 *
 * `catatDimakamkan` sets the Tagihan's overdue anchor in the burial's own transaction. This worker
 * tick (`tick(ctx, now)`, idempotent) then hands every such Tagihan to Notifications' Chasing
 * (`jadwalkanChasing`), which queues the four reminders and drops them when the Tagihan stops
 * needing money. It is driven from database state: an order whose burial is recorded and whose
 * reminders are not yet marked handed over (`chasing_dijadwalkan_pada`). The mark is written after
 * the hand-over, so a tick that dies in between hands it over again on its next run, and
 * Notifications queues nothing twice (one message per Tagihan per template).
 *
 * The anchor and the Tagihan are Billing's, read through its public functions; the email and the
 * wording are this module's own order. An order with a pay-first Tagihan (the filing-only
 * Pengurusan IPTM) has no anchor and is only marked.
 */
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { Database } from "@/db/client";
import { tagihanPerluDibayar, type Billing } from "@/domain/billing";
import type { Notifications } from "@/domain/notifications";
import { pengurusanTpu } from "./schema";

export interface ChasingTpuDeps {
  db: Database;
  billing: Pick<Billing, "tagihanBerlaku" | "payAfterAnchored">;
  notifikasi: Pick<Notifications, "jadwalkanChasing">;
}

export async function chasingTpuTick(deps: ChasingTpuDeps, now: Date): Promise<{ dijadwalkan: number; ditandai: number }> {
  const kandidat = await deps.db
    .select({
      id: pengurusanTpu.id,
      nomor: pengurusanTpu.nomor,
      email: pengurusanTpu.email,
      almarhumName: pengurusanTpu.almarhumName,
      tpuName: pengurusanTpu.tpuName,
      tagihanId: pengurusanTpu.tagihanId,
    })
    .from(pengurusanTpu)
    .where(and(isNotNull(pengurusanTpu.dimakamkanPada), isNull(pengurusanTpu.chasingDijadwalkanPada)))
    .limit(200);
  if (kandidat.length === 0) return { dijadwalkan: 0, ditandai: 0 };

  const jangkar = new Map((await deps.billing.payAfterAnchored()).map((tagihan) => [tagihan.id, tagihan]));
  let dijadwalkan = 0;
  let ditandai = 0;
  for (const order of kandidat) {
    // A Harga Khusus may have reissued the Tagihan: the reminders are for the one in force.
    const berlaku = order.tagihanId ? await deps.billing.tagihanBerlaku(order.tagihanId) : null;
    const tagihan = berlaku ? jangkar.get(berlaku.id) : undefined;
    // Only a Tagihan that still needs the family's money is chased; a paid, voided or written-off one, or one with no
    // pay-after clock, is only marked.
    if (tagihan && tagihanPerluDibayar(tagihan.status)) {
      const hasil = await deps.notifikasi.jadwalkanChasing({
        tagihanId: tagihan.id,
        nomorTagihan: tagihan.nomorTagihan,
        nomorPemesanan: order.nomor,
        email: order.email,
        perihal: order.almarhumName ? `Pemakaman ${order.almarhumName} di ${order.tpuName}` : `Pengurusan pemakaman di ${order.tpuName}`,
        total: tagihan.total,
        lewatJatuhTempoAt: tagihan.lewatJatuhTempoAt,
        link: tagihan.link,
      });
      dijadwalkan += hasil.dijadwalkan;
    }
    const marked = await deps.db
      .update(pengurusanTpu)
      .set({ chasingDijadwalkanPada: now })
      .where(and(eq(pengurusanTpu.id, order.id), isNull(pengurusanTpu.chasingDijadwalkanPada)))
      .returning({ id: pengurusanTpu.id });
    ditandai += marked.length;
  }
  return { dijadwalkan, ditandai };
}
