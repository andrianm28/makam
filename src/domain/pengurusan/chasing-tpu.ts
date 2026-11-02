/**
 * The family reminders of an overdue pay-after TPU Tagihan (spec, Billing > Chasing: "reminders at
 * H+3/7/14/30, stopping as soon as the Tagihan is Lunas or Tidak Tertagih"; Notifications' reminder
 * table, "Pay-after Tagihan: Saat Duka (Lokasi Mitra, DKI TPU)"; ticket 46, gap 5).
 *
 * `catatDimakamkan` sets the Tagihan's overdue anchor in the burial's own transaction. This worker
 * tick (idempotent; it needs no `now`, the reminders' times come from the anchor) then hands every anchored TPU Tagihan that is still owed to
 * Notifications' Chasing (`jadwalkanChasing`), which queues the four reminders and drops them when the
 * Tagihan stops needing money. It is driven from database state: Billing's anchored, still-owed
 * Tagihan, matched to this module's order by its number, and the Tagihan the order last handed over
 * (`chasing_tagihan_id`). A Harga Khusus reissue carries the anchor to the Tagihan in force, which is
 * then handed over in turn (the old one's reminders are dropped with it). The mark is written after the
 * hand-over, so a tick that dies in between hands it over again on its next run, and Notifications
 * queues nothing twice (one message per Tagihan per template).
 *
 * The anchor and the Tagihan are Billing's, read through its public functions; the email and the
 * wording are this module's own order. A pay-first Tagihan (the filing-only Pengurusan IPTM) has no
 * anchor and never appears.
 */
import { and, eq, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { Billing } from "@/domain/billing";
import type { Notifications } from "@/domain/notifications";
import { pengurusanTpu } from "./schema";

export interface ChasingTpuDeps {
  db: Database;
  billing: Pick<Billing, "payAfterAnchoredTerbuka">;
  notifikasi: Pick<Notifications, "jadwalkanChasing">;
}

export async function chasingTpuTick(deps: ChasingTpuDeps): Promise<{ diserahkan: number; dijadwalkan: number }> {
  const terbuka = (await deps.billing.payAfterAnchoredTerbuka()).filter((tagihan) => tagihan.nomorPemesanan !== null);
  if (terbuka.length === 0) return { diserahkan: 0, dijadwalkan: 0 };
  const byNomor = new Map(terbuka.map((tagihan) => [tagihan.nomorPemesanan!, tagihan]));

  const kandidat = await deps.db
    .select({
      id: pengurusanTpu.id,
      nomor: pengurusanTpu.nomor,
      email: pengurusanTpu.email,
      almarhumName: pengurusanTpu.almarhumName,
      tpuName: pengurusanTpu.tpuName,
      chasingTagihanId: pengurusanTpu.chasingTagihanId,
    })
    .from(pengurusanTpu)
    .where(and(inArray(pengurusanTpu.nomor, [...byNomor.keys()]), isNotNull(pengurusanTpu.dimakamkanPada)));

  let diserahkan = 0;
  let dijadwalkan = 0;
  for (const order of kandidat) {
    const tagihan = byNomor.get(order.nomor);
    if (!tagihan || order.chasingTagihanId === tagihan.id) continue;
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
    await deps.db
      .update(pengurusanTpu)
      .set({ chasingTagihanId: tagihan.id })
      .where(and(eq(pengurusanTpu.id, order.id), or(isNull(pengurusanTpu.chasingTagihanId), ne(pengurusanTpu.chasingTagihanId, tagihan.id))));
    diserahkan += 1;
    dijadwalkan += hasil.dijadwalkan;
  }
  return { diserahkan, dijadwalkan };
}
