/**
 * Recording the Pemakaman of a confirmed Saat Duka order (spec, Pemesanan >
 * Saat Duka: "Diajukan → Dikonfirmasi → Dimakamkan → Selesai", and Inventory >
 * Pemakaman; ticket 25's AC 2). One step for the Admin Lokasi and all of it in
 * one transaction: the burial is recorded on the Hak Pakai the confirmation
 * created, that Hak Pakai's tenure clock starts at **this** date, and the order
 * becomes Dimakamkan. Nothing about the money changes here: the Tagihan was
 * issued at the confirmation and its pay-after clock runs from this date, not
 * from the date the burial was planned.
 *
 * Only that Lokasi's Admin Lokasi may record. Admin Platform does the burial
 * through the Lokasi, never for it, and the same as a confirmation, documents
 * never gate it: a burial is not delayed for paperwork.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { wibDateOf } from "@/lib/time/jakarta";
import type { MasaHakPakai } from "@/domain/inventory";
import { terbitkanBukti } from "./efek-bukti-pemesanan";
import type { ChasingDijadwalkan, PemesananDeps } from "./deps";
import { pemesananMakam } from "./schema";

/** What the Admin Lokasi's "Catat Pemakaman" form sends. */
export const catatPemakamanOrderSchema = z.object({
  nomor: z.string().trim().regex(/^MKM-\d{4}-\d{6}$/),
  /** A whole date (WIB has no bearing on which calendar day a burial falls on). */
  tanggal: z.iso.date(),
  /** Which layer of the plot the Almarhum is laid in; the first by default. */
  layer: z.coerce.number().int().min(1).max(20).optional(),
});
export type CatatPemakamanOrderInput = z.infer<typeof catatPemakamanOrderSchema>;

export type CatatPemakamanOrderResult =
  | {
      ok: true;
      pesanan: { nomor: string; status: "dimakamkan" | "selesai"; petakNomor: string };
      pemakaman: { almarhumName: string; tanggal: string; layer: number };
      /** The Hak Pakai's term as this burial left it: whole dates, no end for a Selamanya Jenis Makam. */
      hakPakai: { masa: MasaHakPakai };
      /** The Bukti Pemesanan issued here because the order was already paid; null while it still waits for the money. */
      buktiPemesananNomor: string | null;
    }
  | WriteRefusal
  | { ok: false; reason: "input_tidak_valid" }
  /** No order of that Nomor Pemesanan. */
  | { ok: false; reason: "pesanan_tidak_ditemukan" }
  /** The order is not Dikonfirmasi: there is no plot to bury in. */
  | { ok: false; reason: "pesanan_belum_dikonfirmasi" }
  /** The order's Tagihan is gone, so the burial cannot start its overdue clock either. */
  | { ok: false; reason: "tagihan_tidak_ditemukan" }
  /** The burial is already recorded: the first one is the one that counts. */
  | { ok: false; reason: "pemakaman_sudah_dicatat" }
  /** A burial cannot be recorded for a day the Clock has not reached. */
  | { ok: false; reason: "tanggal_pemakaman_tidak_valid" }
  /**
   * Inventory refused the record itself (a Hak Pakai that is no longer there,
   * say). It rolls the whole step back: the order stays Dikonfirmasi.
   */
  | { ok: false; reason: "hak_pakai_tidak_ditemukan" | "petak_tidak_ditemukan" };

/**
 * Records the Pemakaman of one confirmed order and makes it Dimakamkan, in one
 * transaction, so a failure anywhere leaves the order Dikonfirmasi and its
 * tenure clock unstarted.
 */
export async function catatPemakaman(
  deps: PemesananDeps,
  by: Actor,
  rawInput: unknown,
): Promise<CatatPemakamanOrderResult> {
  const parsed = catatPemakamanOrderSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;

  // The order names the Lokasi whose orders this is, so the check can be made
  // against that Lokasi (a read, never a write).
  const [order] = await deps.db.select().from(pemesananMakam).where(eq(pemesananMakam.nomor, input.nomor));
  if (!order) return { ok: false, reason: "pesanan_tidak_ditemukan" };
  const refusal = writeRefusal(by, "pemakaman.catat", lokasiMitraResource(order.lokasiId));
  if (refusal) return refusal;
  if (order.status === "dimakamkan" || order.status === "selesai") return { ok: false, reason: "pemakaman_sudah_dicatat" };
  if (order.status !== "dikonfirmasi") return { ok: false, reason: "pesanan_belum_dikonfirmasi" };
  if (!order.hakPakaiId || !order.petakId) return { ok: false, reason: "pesanan_belum_dikonfirmasi" };
  if (input.tanggal > wibDateOf(deps.clock.now())) return { ok: false, reason: "tanggal_pemakaman_tidak_valid" };

  const now = deps.clock.now();
  // Assigned inside the transaction below and read after it commits, so
  // Chasing's reminders are queued only once the burial is really on record
  // (never against a transaction that later rolls back).
  let chasing: ChasingDijadwalkan | null = null;
  const hasil = await deps.audit.staffWrite(deps.db, async (tx, record) => {
    const dicatat = await deps.inventory.within(tx).catatPemakaman(by, order.lokasiId, {
      hakPakaiId: order.hakPakaiId!,
      almarhumName: order.almarhumName,
      tanggal: input.tanggal,
      layer: input.layer,
    });
    if (!dicatat.ok) return dicatat;

    const moved = await tx
      .update(pemesananMakam)
      .set({ status: "dimakamkan", dimakamkanPada: now, pemakamanTanggal: input.tanggal, pemakamanLayer: dicatat.pemakaman.layer })
      .where(and(eq(pemesananMakam.id, order.id), eq(pemesananMakam.status, "dikonfirmasi")))
      .returning({ id: pemesananMakam.id });
    if (moved.length === 0) return { ok: false as const, reason: "pemakaman_sudah_dicatat" as const };

    // Payouts is told in the same transaction, so the fact commits with the
    // burial or not at all (ticket 90). Its Saat Duka trigger needs it beside the
    // Lunas half; the tick makes the Pencairan due whichever came first. The
    // instant is the moment it was recorded, the same one the pay-after clock
    // below starts from.
    await deps.payouts.pemakamanTercatat(tx, { nomorPemesanan: order.nomor, pemakamanAt: now });

    // The pay-after Tagihan's overdue clock starts here, not at the day the
    // burial was planned: the family gets its full window from the burial that
    // happened, and the Tagihan is not reissued for it.
    // A Harga Khusus may have reissued the Tagihan since the order stored its id: the clock runs on the one in force (ticket 93).
    const berlaku = order.tagihanId ? await deps.billing.within(tx).tagihanBerlaku(order.tagihanId) : null;
    if (order.tagihanId && !berlaku) return { ok: false as const, reason: "tagihan_tidak_ditemukan" as const };
    if (berlaku) {
      const jam = await deps.billing.within(tx).setOverdueAnchor(berlaku.id, now);
      // A Tagihan with no pay-after clock is nothing to do; its money did not change.
      if (!jam.ok && jam.reason !== "tidak_pay_after") return { ok: false as const, reason: "tagihan_tidak_ditemukan" as const };
      if (jam.ok) {
        // Chasing's four reminders are queued once the anchor is known (ticket
        // 29): the Tagihan itself, read fresh, carries the total and link.
        const tagihan = await deps.billing.within(tx).tagihan(berlaku.id);
        if (tagihan) {
          chasing = {
            tagihanId: berlaku.id,
            nomorTagihan: tagihan.nomorTagihan,
            nomorPemesanan: order.nomor,
            email: order.email,
            perihal: `Pemakaman ${order.almarhumName} di ${order.lokasiName}`,
            total: tagihan.total,
            lewatJatuhTempoAt: jam.lewatJatuhTempoAt,
            link: tagihan.link,
          };
        }
      }
    }

    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "pemesanan.catat_pemakaman",
      entity: { kind: "pemesanan_makam", id: order.id },
      lokasiId: order.lokasiId,
      before: { status: "dikonfirmasi", pemakamanTanggal: null },
      after: {
        status: "dimakamkan",
        pemakamanTanggal: input.tanggal,
        petak: order.petakNomor,
        hakPakaiId: order.hakPakaiId,
      },
      reason: null,
    });

    // A family that paid before the burial is owed its Bukti Pemesanan the moment
    // the burial is on record: the order is now Dimakamkan *and* its Tagihan Lunas,
    // which together are Selesai. (The other order of the two — the burial first,
    // the payment second — is Billing's own payment effect.)
    let buktiNomor: string | null = null;
    if (berlaku) {
      const tagihan = await deps.billing.within(tx).tagihan(berlaku.id);
      if (tagihan?.status === "lunas") {
        buktiNomor = await terbitkanBukti(
          tx,
          {
            billingOn: (db) => deps.billing.within(db),
            inventory: deps.inventory,
            lokasi: deps.lokasi,
            notifikasi: deps.notifikasi,
          },
          order.id,
          now,
        );
      }
    }

    return {
      ok: true as const,
      pesanan: {
        nomor: order.nomor,
        status: (buktiNomor ? "selesai" : "dimakamkan") as "dimakamkan" | "selesai",
        petakNomor: order.petakNomor ?? "",
      },
      pemakaman: { almarhumName: dicatat.pemakaman.almarhumName, tanggal: dicatat.pemakaman.date, layer: dicatat.pemakaman.layer },
      hakPakai: { masa: dicatat.masa },
      /** The Bukti Pemesanan issued with this recording, when the order was already paid; null while it still waits for the money. */
      buktiPemesananNomor: buktiNomor,
    };
  });
  if (hasil.ok && chasing) await deps.notifikasi.chasingDijadwalkan(chasing);
  return hasil;
}
